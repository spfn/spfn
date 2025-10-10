/**
 * Global Database instance manager
 * Provides singleton access to database across all modules
 * Supports Primary + Replica pattern with separate read/write instances
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

import { createDatabaseFromEnv, type DatabaseOptions, type HealthCheckConfig } from './factory.js';
import { logger } from '../../logger';

const dbLogger = logger.child('database');

let writeInstance: PostgresJsDatabase | undefined;
let readInstance: PostgresJsDatabase | undefined;
let writeClient: Sql | undefined;
let readClient: Sql | undefined;
let healthCheckInterval: NodeJS.Timeout | undefined;

/**
 * DB connection type
 */
export type DbConnectionType = 'read' | 'write';

/**
 * Get global database write instance
 *
 * @returns Database write instance or undefined if not initialized
 *
 * @example
 * ```typescript
 * import { getDatabase } from '@spfn/core/db';
 *
 * const db = getDatabase();
 * if (db) {
 *   const users = await db.select().from(usersTable);
 * }
 * ```
 */
export function getDatabase(type?: DbConnectionType): PostgresJsDatabase | undefined
{
    if (type === 'read')
    {
        return readInstance ?? writeInstance;
    }
    return writeInstance;
}

/**
 * Set global database instances (for testing or manual configuration)
 *
 * @param write - Database write instance
 * @param read - Database read instance (optional, defaults to write)
 *
 * @example
 * ```typescript
 * import { setDatabase } from '@spfn/core/db';
 * import { drizzle } from 'drizzle-orm/postgres-js';
 * import postgres from 'postgres';
 *
 * const writeClient = postgres('postgresql://primary:5432/mydb');
 * const readClient = postgres('postgresql://replica:5432/mydb');
 * setDatabase(drizzle(writeClient), drizzle(readClient));
 * ```
 */
export function setDatabase(
    write: PostgresJsDatabase | undefined,
    read?: PostgresJsDatabase | undefined
): void
{
    writeInstance = write;
    readInstance = read ?? write;
}

/**
 * Get health check configuration with priority resolution
 *
 * Priority: options > env > defaults
 */
function getHealthCheckConfig(options?: Partial<HealthCheckConfig>): HealthCheckConfig
{
    const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean =>
    {
        if (value === undefined) return defaultValue;
        return value.toLowerCase() === 'true';
    };

    return {
        enabled: options?.enabled
            ?? parseBoolean(process.env.DB_HEALTH_CHECK_ENABLED, true),
        interval: options?.interval
            ?? (parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '', 10) || 60000),
        reconnect: options?.reconnect
            ?? parseBoolean(process.env.DB_HEALTH_CHECK_RECONNECT, true),
        maxRetries: options?.maxRetries
            ?? (parseInt(process.env.DB_HEALTH_CHECK_MAX_RETRIES || '', 10) || 3),
        retryInterval: options?.retryInterval
            ?? (parseInt(process.env.DB_HEALTH_CHECK_RETRY_INTERVAL || '', 10) || 5000),
    };
}

/**
 * Initialize database from environment variables
 * Automatically called by server startup
 *
 * Supported environment variables:
 * - DATABASE_URL (single primary)
 * - DATABASE_WRITE_URL + DATABASE_READ_URL (primary + replica)
 * - DATABASE_URL + DATABASE_REPLICA_URL (legacy replica)
 * - DB_POOL_MAX (connection pool max size)
 * - DB_POOL_IDLE_TIMEOUT (connection idle timeout in seconds)
 * - DB_HEALTH_CHECK_ENABLED (enable health checks, default: true)
 * - DB_HEALTH_CHECK_INTERVAL (health check interval in ms, default: 60000)
 * - DB_HEALTH_CHECK_RECONNECT (enable auto-reconnect, default: true)
 * - DB_HEALTH_CHECK_MAX_RETRIES (max reconnection attempts, default: 3)
 * - DB_HEALTH_CHECK_RETRY_INTERVAL (retry interval in ms, default: 5000)
 *
 * Configuration priority:
 * 1. options parameter (ServerConfig)
 * 2. Environment variables
 * 3. Defaults (based on NODE_ENV)
 *
 * @param options - Optional database configuration (pool settings, etc.)
 * @returns Object with write and read instances
 *
 * @example
 * ```typescript
 * import { initDatabase } from '@spfn/core/db';
 *
 * // Manual initialization (not needed if using server startup)
 * const { write, read } = await initDatabase();
 * if (write) {
 *   console.log('Database connected');
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Custom pool configuration
 * const { write, read } = await initDatabase({
 *   pool: { max: 50, idleTimeout: 60 }
 * });
 * ```
 */
export async function initDatabase(options?: DatabaseOptions): Promise<{
    write?: PostgresJsDatabase;
    read?: PostgresJsDatabase;
}>
{
    // Already initialized
    if (writeInstance)
    {
        dbLogger.debug('Database already initialized');
        return { write: writeInstance, read: readInstance };
    }

    // Auto-detect from environment
    const result = await createDatabaseFromEnv(options);

    if (result.write)
    {
        try
        {
            // Test connection with a simple query
            await result.write.execute('SELECT 1');

            // Test read instance if different
            if (result.read && result.read !== result.write)
            {
                await result.read.execute('SELECT 1');
            }

            // Store instances
            writeInstance = result.write;
            readInstance = result.read;
            writeClient = result.writeClient;
            readClient = result.readClient;

            const hasReplica = result.read && result.read !== result.write;
            dbLogger.info(
                hasReplica
                    ? 'Database connected (Primary + Replica)'
                    : 'Database connected'
            );

            // Start health check (automatic)
            const healthCheckConfig = getHealthCheckConfig(options?.healthCheck);
            if (healthCheckConfig.enabled)
            {
                startHealthCheck(healthCheckConfig);
            }
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error('Database connection failed', { error: message });

            // Cleanup on failure
            await closeDatabase();

            return { write: undefined, read: undefined };
        }
    }
    else
    {
        dbLogger.warn('No database configuration found');
        dbLogger.warn('Set DATABASE_URL environment variable to enable database');
    }

    return { write: writeInstance, read: readInstance };
}

/**
 * Close all database connections and cleanup
 *
 * Properly closes postgres connection pools with timeout.
 * Should be called during graceful shutdown or after tests.
 *
 * @example
 * ```typescript
 * import { closeDatabase } from '@spfn/core/db';
 *
 * // During graceful shutdown
 * process.on('SIGTERM', async () => {
 *     await closeDatabase();
 *     process.exit(0);
 * });
 *
 * // In tests
 * afterAll(async () => {
 *     await closeDatabase();
 * });
 * ```
 */
export async function closeDatabase(): Promise<void>
{
    if (!writeInstance && !readInstance)
    {
        dbLogger.debug('No database connections to close');
        return;
    }

    // Stop health check
    stopHealthCheck();

    try
    {
        const closePromises: Promise<void>[] = [];

        // Close write client
        if (writeClient)
        {
            dbLogger.debug('Closing write connection...');
            closePromises.push(
                writeClient.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Write connection closed'))
                    .catch(err => dbLogger.error('Error closing write connection', err))
            );
        }

        // Close read client (if different from write)
        if (readClient && readClient !== writeClient)
        {
            dbLogger.debug('Closing read connection...');
            closePromises.push(
                readClient.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Read connection closed'))
                    .catch(err => dbLogger.error('Error closing read connection', err))
            );
        }

        // Wait for all connections to close
        await Promise.all(closePromises);

        dbLogger.info('All database connections closed');
    }
    catch (error)
    {
        dbLogger.error('Error during database cleanup', error as Error);
        throw error;
    }
    finally
    {
        // Always clear instances
        writeInstance = undefined;
        readInstance = undefined;
        writeClient = undefined;
        readClient = undefined;
    }
}

/**
 * Get database connection info (for debugging)
 */
export function getDatabaseInfo(): {
    hasWrite: boolean;
    hasRead: boolean;
    isReplica: boolean;
}
{
    return {
        hasWrite: !!writeInstance,
        hasRead: !!readInstance,
        isReplica: !!(readInstance && readInstance !== writeInstance),
    };
}

/**
 * Start database health check
 *
 * Periodically checks database connection health and attempts reconnection if enabled.
 * Automatically started by initDatabase() when health check is enabled.
 *
 * @param config - Health check configuration
 *
 * @example
 * ```typescript
 * import { startHealthCheck } from '@spfn/core/db';
 *
 * startHealthCheck({
 *   enabled: true,
 *   interval: 30000,      // 30 seconds
 *   reconnect: true,
 *   maxRetries: 5,
 *   retryInterval: 10000, // 10 seconds
 * });
 * ```
 */
export function startHealthCheck(config: HealthCheckConfig): void
{
    if (healthCheckInterval)
    {
        dbLogger.debug('Health check already running');
        return;
    }

    dbLogger.info('Starting database health check', {
        interval: `${config.interval}ms`,
        reconnect: config.reconnect,
    });

    healthCheckInterval = setInterval(async () =>
    {
        try
        {
            const write = getDatabase('write');
            const read = getDatabase('read');

            // Check write connection
            if (write)
            {
                await write.execute('SELECT 1');
            }

            // Check read connection (if different)
            if (read && read !== write)
            {
                await read.execute('SELECT 1');
            }

            dbLogger.debug('Database health check passed');
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error('Database health check failed', { error: message });

            // Attempt reconnection if enabled
            if (config.reconnect)
            {
                await attemptReconnection(config);
            }
        }
    }, config.interval);
}

/**
 * Attempt database reconnection with retry logic
 *
 * @param config - Health check configuration
 */
async function attemptReconnection(config: HealthCheckConfig): Promise<void>
{
    dbLogger.warn('Attempting database reconnection', {
        maxRetries: config.maxRetries,
        retryInterval: `${config.retryInterval}ms`,
    });

    for (let attempt = 1; attempt <= config.maxRetries; attempt++)
    {
        try
        {
            dbLogger.debug(`Reconnection attempt ${attempt}/${config.maxRetries}`);

            // Close existing connections
            await closeDatabase();

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, config.retryInterval));

            // Reinitialize database
            const result = await createDatabaseFromEnv();

            if (result.write)
            {
                // Test connection
                await result.write.execute('SELECT 1');

                // Store instances
                writeInstance = result.write;
                readInstance = result.read;
                writeClient = result.writeClient;
                readClient = result.readClient;

                dbLogger.info('Database reconnection successful', { attempt });
                return;
            }
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error(`Reconnection attempt ${attempt} failed`, {
                error: message,
                attempt,
                maxRetries: config.maxRetries,
            });

            if (attempt === config.maxRetries)
            {
                dbLogger.error('Max reconnection attempts reached, giving up');
            }
        }
    }
}

/**
 * Stop database health check
 *
 * Automatically called by closeDatabase().
 * Can also be called manually to stop health checks.
 *
 * @example
 * ```typescript
 * import { stopHealthCheck } from '@spfn/core/db';
 *
 * stopHealthCheck();
 * ```
 */
export function stopHealthCheck(): void
{
    if (healthCheckInterval)
    {
        clearInterval(healthCheckInterval);
        healthCheckInterval = undefined;
        dbLogger.info('Database health check stopped');
    }
}