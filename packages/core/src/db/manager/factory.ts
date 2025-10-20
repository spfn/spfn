/**
 * Database factory with automatic environment variable detection
 * Supports: Single primary, Primary + Replica
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { logger } from '../../logger';
import { loadEnvironment } from '../../env';
import { createDatabaseConnection } from './connection.js';
import { getPoolConfig, getRetryConfig, type DatabaseOptions, type DatabaseClients, type PoolConfig, type RetryConfig } from './config.js';
import { getDatabase } from "./manager";

const dbLogger = logger.child('database');

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
    return !!(
        process.env.DATABASE_URL ||
        process.env.DATABASE_WRITE_URL ||
        process.env.DATABASE_READ_URL
    );
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
    // Priority 1: Explicit write/read separation (recommended)
    if (process.env.DATABASE_WRITE_URL && process.env.DATABASE_READ_URL)
    {
        return {
            type: 'write-read',
            write: process.env.DATABASE_WRITE_URL,
            read: process.env.DATABASE_READ_URL,
        };
    }

    // Priority 2: Legacy replica pattern (backward compatibility)
    if (process.env.DATABASE_URL && process.env.DATABASE_REPLICA_URL)
    {
        return {
            type: 'legacy',
            primary: process.env.DATABASE_URL,
            replica: process.env.DATABASE_REPLICA_URL,
        };
    }

    // Priority 3: Single primary (most common)
    if (process.env.DATABASE_URL)
    {
        return {
            type: 'single',
            url: process.env.DATABASE_URL,
        };
    }

    // Priority 4: Write-only (no replica)
    if (process.env.DATABASE_WRITE_URL)
    {
        return {
            type: 'single',
            url: process.env.DATABASE_WRITE_URL,
        };
    }

    // No configuration found
    return { type: 'none' };
}

/**
 * Create write and read database clients
 *
 * @param writeUrl - Write database connection string
 * @param readUrl - Read database connection string
 * @param poolConfig - Connection pool configuration
 * @param retryConfig - Retry configuration
 * @returns Database clients
 */
async function createWriteReadClients(
    writeUrl: string,
    readUrl: string,
    poolConfig: PoolConfig,
    retryConfig: RetryConfig
): Promise<DatabaseClients>
{
    const writeClient = await createDatabaseConnection(writeUrl, poolConfig, retryConfig);
    const readClient = await createDatabaseConnection(readUrl, poolConfig, retryConfig);

    return {
        write: drizzle(writeClient),
        read: drizzle(readClient),
        writeClient,
        readClient,
    };
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
 * @returns Database client(s) or undefined if no configuration found
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
            debug: true,
        });

        dbLogger.debug('Environment variables loaded', {
            success: result.success,
            loaded: result.loaded.length,
            hasDatabaseUrl: !!process.env.DATABASE_URL,
            hasWriteUrl: !!process.env.DATABASE_WRITE_URL,
            hasReadUrl: !!process.env.DATABASE_READ_URL,
        });
    }

    // Quick exit if no database config
    if (!hasDatabaseConfig())
    {
        dbLogger.warn('No database configuration found', {
            cwd: process.cwd(),
            nodeEnv: process.env.NODE_ENV,
            checkedVars: ['DATABASE_URL', 'DATABASE_WRITE_URL', 'DATABASE_READ_URL'],
        });
        return { write: undefined, read: undefined };
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
                dbLogger.debug('Using write-read pattern', {
                    write: pattern.write.replace(/:[^:@]+@/, ':***@'),
                    read: pattern.read.replace(/:[^:@]+@/, ':***@'),
                });
                return await createWriteReadClients(
                    pattern.write,
                    pattern.read,
                    poolConfig,
                    retryConfig
                );

            case 'legacy':
                dbLogger.debug('Using legacy replica pattern', {
                    primary: pattern.primary.replace(/:[^:@]+@/, ':***@'),
                    replica: pattern.replica.replace(/:[^:@]+@/, ':***@'),
                });
                return await createWriteReadClients(
                    pattern.primary,
                    pattern.replica,
                    poolConfig,
                    retryConfig
                );

            case 'single':
                dbLogger.debug('Using single database pattern', {
                    url: pattern.url.replace(/:[^:@]+@/, ':***@'),
                });
                return await createSingleClient(pattern.url, poolConfig, retryConfig);

            case 'none':
                dbLogger.warn('No database pattern detected');
                return { write: undefined, read: undefined };
        }
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : 'Unknown error';
        dbLogger.error('Failed to create database connection', {
            error: message,
            stage: 'initialization',
            hasWriteUrl: !!process.env.DATABASE_WRITE_URL,
            hasReadUrl: !!process.env.DATABASE_READ_URL,
            hasUrl: !!process.env.DATABASE_URL,
            hasReplicaUrl: !!process.env.DATABASE_REPLICA_URL,
        });

        // If DATABASE_URL is configured, connection failure should be fatal
        // This prevents the server from starting without a database connection
        throw new Error(`Database connection failed: ${message}`, { cause: error });
    }
}

export const db = new Proxy({} as PostgresJsDatabase, {
    get(_target, prop)
    {
        const instance = getDatabase('write');
        if (!instance)
        {
            throw new Error(
                'Database not initialized. ' +
                'Set DATABASE_URL environment variable or call initDatabase() first.'
            );
        }

        return (instance as Record<string | symbol, any>)[prop];
    },
});