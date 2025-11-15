/**
 * Database factory with automatic environment variable detection
 * Supports: Single primary, Primary + Replica
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

import { logger } from '../../logger';
import { loadEnvironment, hasEnvVar, getEnvVars } from '../../env';
import { createDatabaseConnection } from './connection';
import { getPoolConfig, getRetryConfig, type DatabaseOptions, type DatabaseClients, type PoolConfig, type RetryConfig } from './config';

const dbLogger = logger.child('@spfn/core:database');

// ============================================================================
// Types
// ============================================================================

/**
 * Database configuration pattern types
 *
 * Represents different ways to configure database connections via environment variables.
 */
type DatabasePattern =
    | { type: 'write-read'; write: string; read: string }     // Explicit write/read separation
    | { type: 'legacy'; primary: string; replica: string }    // Legacy replica pattern
    | { type: 'single'; url: string }                         // Single database
    | { type: 'none' };                                        // No configuration

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if any database configuration exists in environment
 */
function hasDatabaseConfig(): boolean
{
    return hasEnvVar('DATABASE_URL') ||
           hasEnvVar('DATABASE_WRITE_URL') ||
           hasEnvVar('DATABASE_READ_URL');
}

/**
 * Detect database configuration pattern from environment variables
 *
 * Priority order (highest to lowest):
 * 1. write-read: DATABASE_WRITE_URL + DATABASE_READ_URL (explicit separation)
 * 2. legacy: DATABASE_URL + DATABASE_REPLICA_URL (backward compatibility)
 * 3. single: DATABASE_URL (most common)
 * 4. single: DATABASE_WRITE_URL (write-only, no replica)
 * 5. none: No configuration found
 *
 * @returns Detected database configuration pattern
 *
 * @example
 * ```typescript
 * const pattern = detectDatabasePattern();
 *
 * if (pattern.type === 'write-read') {
 *   console.log(`Write: ${pattern.write}, Read: ${pattern.read}`);
 * }
 * ```
 */
function detectDatabasePattern(): DatabasePattern
{
    // Get all database-related environment variables at once
    const vars = getEnvVars([
        'DATABASE_WRITE_URL',
        'DATABASE_READ_URL',
        'DATABASE_URL',
        'DATABASE_REPLICA_URL',
    ]);

    // Priority 1: Explicit write/read separation (recommended)
    if (vars.DATABASE_WRITE_URL && vars.DATABASE_READ_URL)
    {
        return {
            type: 'write-read',
            write: vars.DATABASE_WRITE_URL,
            read: vars.DATABASE_READ_URL,
        };
    }

    // Priority 2: Legacy replica pattern (backward compatibility)
    if (vars.DATABASE_URL && vars.DATABASE_REPLICA_URL)
    {
        return {
            type: 'legacy',
            primary: vars.DATABASE_URL,
            replica: vars.DATABASE_REPLICA_URL,
        };
    }

    // Priority 3: Single primary (most common)
    if (vars.DATABASE_URL)
    {
        return {
            type: 'single',
            url: vars.DATABASE_URL,
        };
    }

    // Priority 4: Write-only (no replica)
    if (vars.DATABASE_WRITE_URL)
    {
        return {
            type: 'single',
            url: vars.DATABASE_WRITE_URL,
        };
    }

    // No configuration found
    return { type: 'none' };
}

/**
 * Create write and read database clients
 *
 * Write connection is required and will throw if it fails.
 * Read connection is optional - if it fails, falls back to using write connection with a warning.
 *
 * @param writeUrl - Write database connection string
 * @param readUrl - Read database connection string
 * @param poolConfig - Connection pool configuration
 * @param retryConfig - Retry configuration
 * @returns Database clients
 * @throws Error if write connection fails
 */
async function createWriteReadClients(
    writeUrl: string,
    readUrl: string,
    poolConfig: PoolConfig,
    retryConfig: RetryConfig
): Promise<DatabaseClients>
{
    let writeClient: Sql | undefined;
    let readClient: Sql | undefined;

    try
    {
        // Write connection is required - must succeed
        writeClient = await createDatabaseConnection(writeUrl, poolConfig, retryConfig);
    }
    catch (error)
    {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        dbLogger.error('Failed to connect to write database', errorObj);
        throw new Error(`Write database connection failed: ${errorObj.message}`, { cause: error });
    }

    // Read connection is optional - fallback to write if it fails
    try
    {
        readClient = await createDatabaseConnection(readUrl, poolConfig, retryConfig);

        return {
            write: drizzle(writeClient),
            read: drizzle(readClient),
            writeClient,
            readClient,
        };
    }
    catch (error)
    {
        const errorObj = error instanceof Error ? error : new Error(String(error));

        // Log warning but continue with write connection as fallback
        dbLogger.warn(
            'Failed to connect to read database (replica). Falling back to write database for read operations.',
            {
                error: errorObj.message,
                readUrl: readUrl.replace(/:[^:@]+@/, ':***@'), // Mask password in logs
                fallbackBehavior: 'Using write connection for both read and write operations',
            }
        );

        // Use write connection for both read and write
        return {
            write: drizzle(writeClient),
            read: drizzle(writeClient),
            writeClient,
            readClient: writeClient,
        };
    }
}

/**
 * Create single database client (used for both read and write)
 *
 * @param url - Database connection string
 * @param poolConfig - Connection pool configuration
 * @param retryConfig - Retry configuration
 * @returns Database clients
 */
async function createSingleClient(
    url: string,
    poolConfig: PoolConfig,
    retryConfig: RetryConfig
): Promise<DatabaseClients>
{
    const client = await createDatabaseConnection(url, poolConfig, retryConfig);
    const db = drizzle(client);

    return {
        write: db,
        read: db,
        writeClient: client,
        readClient: client,
    };
}

/**
 * Create database client(s) from environment variables
 *
 * Supported patterns (priority order):
 * 1. Single primary: DATABASE_URL
 * 2. Primary + Replica: DATABASE_WRITE_URL + DATABASE_READ_URL
 * 3. Legacy replica: DATABASE_URL + DATABASE_REPLICA_URL
 *
 * @param options - Optional database configuration (pool settings, etc.)
 * @returns Database client(s)
 * @throws {Error} If no database configuration is found or connection fails
 *
 * @example
 * ```bash
 * # Single primary (most common)
 * DATABASE_URL=postgresql://localhost:5432/mydb
 *
 * # Primary + Replica
 * DATABASE_WRITE_URL=postgresql://primary:5432/mydb
 * DATABASE_READ_URL=postgresql://replica:5432/mydb
 *
 * # Legacy (backward compatibility)
 * DATABASE_URL=postgresql://primary:5432/mydb
 * DATABASE_REPLICA_URL=postgresql://replica:5432/mydb
 * ```
 *
 * @example
 * ```typescript
 * // Custom pool configuration
 * const db = await createDatabaseFromEnv({
 *   pool: { max: 50, idleTimeout: 60 }
 * });
 * ```
 */
export async function createDatabaseFromEnv(options?: DatabaseOptions): Promise<DatabaseClients>
{
    // Load environment variables using centralized loader
    if (!hasDatabaseConfig())
    {
        dbLogger.debug('No DATABASE_URL found, loading environment variables');

        const result = loadEnvironment({
            debug: process.env.NODE_ENV !== 'production',
        });

        dbLogger.debug('Environment variables loaded', {
            success: result.success,
            loaded: result.loaded.length,
            hasDatabaseUrl: hasEnvVar('DATABASE_URL'),
            hasWriteUrl: hasEnvVar('DATABASE_WRITE_URL'),
            hasReadUrl: hasEnvVar('DATABASE_READ_URL'),
        });
    }

    // Quick exit if no database config
    if (!hasDatabaseConfig())
    {
        const error = new Error(
            'No database configuration found. Please set DATABASE_URL, DATABASE_WRITE_URL, or DATABASE_READ_URL environment variable.'
        );

        dbLogger.error('No database configuration found', {
            cwd: process.cwd(),
            nodeEnv: process.env.NODE_ENV,
            checkedVars: ['DATABASE_URL', 'DATABASE_WRITE_URL', 'DATABASE_READ_URL'],
        });

        throw error;
    }

    try
    {
        const poolConfig = getPoolConfig(options?.pool);
        const retryConfig = getRetryConfig();
        const pattern = detectDatabasePattern();

        // Create database clients based on detected pattern
        switch (pattern.type)
        {
            case 'write-read':
                return await createWriteReadClients(
                    pattern.write,
                    pattern.read,
                    poolConfig,
                    retryConfig
                );

            case 'legacy':
                return await createWriteReadClients(
                    pattern.primary,
                    pattern.replica,
                    poolConfig,
                    retryConfig
                );

            case 'single':
                return await createSingleClient(pattern.url, poolConfig, retryConfig);

            case 'none':
                // This should never happen if hasDatabaseConfig() passed
                // But throw for defensive programming
                throw new Error('No database pattern detected despite passing config check');
        }
    }
    catch (error)
    {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        dbLogger.error(
            'Failed to create database connection',
            errorObj,
            {
                stage: 'initialization',
                hasWriteUrl: hasEnvVar('DATABASE_WRITE_URL'),
                hasReadUrl: hasEnvVar('DATABASE_READ_URL'),
                hasUrl: hasEnvVar('DATABASE_URL'),
                hasReplicaUrl: hasEnvVar('DATABASE_REPLICA_URL'),
            }
        );

        // If DATABASE_URL is configured, connection failure should be fatal
        // This prevents the server from starting without a database connection
        throw new Error(`Database connection failed: ${errorObj.message}`, { cause: error });
    }
}