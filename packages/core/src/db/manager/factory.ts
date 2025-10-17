/**
 * Database factory with automatic environment variable detection
 * Supports: Single primary, Primary + Replica
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

import { createDatabaseConnection } from './connection.js';
import { getPoolConfig, getRetryConfig, type PoolConfig } from './config.js';
import { logger } from '../../logger';
import { loadEnvironment } from '../../env';

const dbLogger = logger.child('database');

export interface DatabaseClients
{
    /** Primary database for writes (or both read/write if no replica) */
    write?: PostgresJsDatabase;
    /** Replica database for reads (optional, falls back to write) */
    read?: PostgresJsDatabase;
    /** Raw postgres client for write operations (for cleanup) */
    writeClient?: Sql;
    /** Raw postgres client for read operations (for cleanup) */
    readClient?: Sql;
}

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
 * Health check configuration
 */
export interface HealthCheckConfig
{
    enabled: boolean;
    interval: number;
    reconnect: boolean;
    maxRetries: number;
    retryInterval: number;
}

/**
 * Query performance monitoring configuration
 */
export interface MonitoringConfig
{
    enabled: boolean;
    slowThreshold: number;
    logQueries: boolean;
}

/**
 * Database initialization options
 */
export interface DatabaseOptions
{
    /**
     * Connection pool configuration
     * Overrides environment variables and defaults
     */
    pool?: Partial<PoolConfig>;

    /**
     * Health check configuration
     * Periodic checks to ensure database connection is alive
     */
    healthCheck?: Partial<HealthCheckConfig>;

    /**
     * Query performance monitoring configuration
     * Tracks slow queries and logs performance metrics
     */
    monitoring?: Partial<MonitoringConfig>;
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

        // 1. Primary + Replica pattern (explicit separation)
        if (process.env.DATABASE_WRITE_URL && process.env.DATABASE_READ_URL)
        {
            const writeClient = await createDatabaseConnection(
                process.env.DATABASE_WRITE_URL,
                poolConfig,
                retryConfig
            );

            const readClient = await createDatabaseConnection(
                process.env.DATABASE_READ_URL,
                poolConfig,
                retryConfig
            );

            return {
                write: drizzle(writeClient),
                read: drizzle(readClient),
                writeClient,
                readClient,
            };
        }

        // 2. Legacy replica pattern (backward compatibility)
        if (process.env.DATABASE_URL && process.env.DATABASE_REPLICA_URL)
        {
            const writeClient = await createDatabaseConnection(
                process.env.DATABASE_URL,
                poolConfig,
                retryConfig
            );

            const readClient = await createDatabaseConnection(
                process.env.DATABASE_REPLICA_URL,
                poolConfig,
                retryConfig
            );

            return {
                write: drizzle(writeClient),
                read: drizzle(readClient),
                writeClient,
                readClient,
            };
        }

        // 3. Single primary (most common)
        if (process.env.DATABASE_URL)
        {
            const client = await createDatabaseConnection(
                process.env.DATABASE_URL,
                poolConfig,
                retryConfig
            );

            const db = drizzle(client);
            return {
                write: db,
                read: db,
                writeClient: client,
                readClient: client,
            };
        }

        // 4. DATABASE_WRITE_URL only (no read replica)
        if (process.env.DATABASE_WRITE_URL)
        {
            const client = await createDatabaseConnection(
                process.env.DATABASE_WRITE_URL,
                poolConfig,
                retryConfig
            );

            const db = drizzle(client);
            return {
                write: db,
                read: db,
                writeClient: client,
                readClient: client,
            };
        }

        // No valid configuration
        return { write: undefined, read: undefined };
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