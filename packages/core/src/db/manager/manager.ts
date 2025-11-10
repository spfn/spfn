/**
 * Global Database instance manager
 * Provides singleton access to database across all modules
 * Supports Primary + Replica pattern with separate read/write instances
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { logger } from '../../logger';
import { createDatabaseFromEnv } from './factory';
import type { DatabaseOptions, MonitoringConfig } from "./config.js";
import { buildHealthCheckConfig, buildMonitoringConfig } from "./config.js";
import {
    getWriteInstance,
    setWriteInstance,
    getReadInstance,
    setReadInstance,
    getWriteClient,
    setWriteClient,
    getReadClient,
    setReadClient,
    getMonitoringConfig,
    setMonitoringConfig,
} from './global-state';
import { startHealthCheck, stopHealthCheck } from './health-check';

const dbLogger = logger.child('database');

/**
 * DB connection type
 */
export type DbConnectionType = 'read' | 'write';

/**
 * GetDatabase function type
 */
export type GetDatabaseFn = (type?: DbConnectionType) => PostgresJsDatabase<Record<string, unknown>> | undefined;

/**
 * Get caller information from stack trace
 */
function getCallerInfo(): string | undefined
{
    try
    {
        const stack = new Error().stack;
        if (!stack) return undefined;

        const lines = stack.split('\n');
        // Skip first 3 lines: Error, getCallerInfo, getDatabase
        for (let i = 3; i < lines.length; i++)
        {
            const line = lines[i];
            // Find first meaningful caller (not node_modules/@spfn/core/db)
            if (!line.includes('node_modules') && !line.includes('/db/manager/'))
            {
                // Extract file:line from stack line
                const match = line.match(/\((.+):(\d+):(\d+)\)/) || line.match(/at (.+):(\d+):(\d+)/);
                if (match)
                {
                    const fullPath = match[1];
                    // Get relative path from project root
                    const parts = fullPath.split('/');
                    const srcIndex = parts.lastIndexOf('src');
                    if (srcIndex !== -1)
                    {
                        const relativePath = parts.slice(srcIndex).join('/');
                        return `${relativePath}:${match[2]}`;
                    }
                    return `${fullPath}:${match[2]}`;
                }
                break;
            }
        }
    }
    catch
    {
        // Ignore errors in stack trace parsing
    }
    return undefined;
}

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
export function getDatabase(type?: DbConnectionType): PostgresJsDatabase<Record<string, unknown>> | undefined
{
    const writeInst = getWriteInstance();
    const readInst = getReadInstance();

    // Detailed debug logging with caller info (only if DB_DEBUG_TRACE is enabled)
    if (process.env.DB_DEBUG_TRACE === 'true')
    {
        const caller = getCallerInfo();
        dbLogger.debug('getDatabase() called', {
            type: type || 'write',
            hasWrite: !!writeInst,
            hasRead: !!readInst,
            caller,
        });
    }

    if (type === 'read')
    {
        return readInst ?? writeInst;
    }

    return writeInst;
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
    write: PostgresJsDatabase<Record<string, unknown>> | undefined,
    read?: PostgresJsDatabase<Record<string, unknown>> | undefined
): void
{
    setWriteInstance(write);
    setReadInstance(read ?? write);
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
 * - DB_MONITORING_ENABLED (enable query monitoring, default: true in dev, false in prod)
 * - DB_MONITORING_SLOW_THRESHOLD (slow query threshold in ms, default: 1000)
 * - DB_MONITORING_LOG_QUERIES (log actual SQL queries, default: false)
 * - DB_DEBUG_TRACE (enable detailed getDatabase() call tracing with caller info, default: false)
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
    write?: PostgresJsDatabase<Record<string, unknown>>;
    read?: PostgresJsDatabase<Record<string, unknown>>;
}>
{
    // Already initialized
    const writeInst = getWriteInstance();
    if (writeInst)
    {
        dbLogger.debug('Database already initialized');
        return { write: writeInst, read: getReadInstance() };
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

            // Store instances in globalThis
            setWriteInstance(result.write);
            setReadInstance(result.read);
            setWriteClient(result.writeClient);
            setReadClient(result.readClient);

            const hasReplica = result.read && result.read !== result.write;
            dbLogger.info(
                hasReplica
                    ? 'Database connected (Primary + Replica)'
                    : 'Database connected'
            );

            // Start health check (automatic)
            const healthCheckConfig = buildHealthCheckConfig(options?.healthCheck);
            if (healthCheckConfig.enabled)
            {
                startHealthCheck(healthCheckConfig, options, getDatabase, closeDatabase);
            }

            // Initialize monitoring configuration
            const monConfig = buildMonitoringConfig(options?.monitoring);
            setMonitoringConfig(monConfig);
            if (monConfig.enabled)
            {
                dbLogger.info('Database query monitoring enabled', {
                    slowThreshold: `${monConfig.slowThreshold}ms`,
                    logQueries: monConfig.logQueries,
                });
            }
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error('Database connection failed', { error: message });

            // Cleanup on failure
            await closeDatabase();

            // If DATABASE_URL is configured, connection failure should be fatal
            throw new Error(`Database connection test failed: ${message}`, { cause: error });
        }
    }
    else
    {
        dbLogger.warn('No database configuration found');
        dbLogger.warn('Set DATABASE_URL environment variable to enable database');
    }

    return { write: getWriteInstance(), read: getReadInstance() };
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
    const writeInst = getWriteInstance();
    const readInst = getReadInstance();
    if (!writeInst && !readInst)
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
        const writeC = getWriteClient();
        if (writeC)
        {
            dbLogger.debug('Closing write connection...');
            closePromises.push(
                writeC.end({ timeout: 5 })
                    .then(() => dbLogger.debug('Write connection closed'))
                    .catch(err => dbLogger.error('Error closing write connection', err))
            );
        }

        // Close read client (if different from write)
        const readC = getReadClient();
        if (readC && readC !== writeC)
        {
            dbLogger.debug('Closing read connection...');
            closePromises.push(
                readC.end({ timeout: 5 })
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
        setWriteInstance(undefined);
        setReadInstance(undefined);
        setWriteClient(undefined);
        setReadClient(undefined);
        setMonitoringConfig(undefined);
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
    const writeInst = getWriteInstance();
    const readInst = getReadInstance();

    return {
        hasWrite: !!writeInst,
        hasRead: !!readInst,
        isReplica: !!(readInst && readInst !== writeInst),
    };
}

/**
 * Get current monitoring configuration
 *
 * Returns the monitoring configuration that was set during database initialization.
 * Used by Repository to determine if and how to monitor query performance.
 *
 * @returns Current monitoring configuration or undefined if database not initialized
 *
 * @example
 * ```typescript
 * import { getDatabaseMonitoringConfig } from '@spfn/core/db';
 *
 * const config = getDatabaseMonitoringConfig();
 * if (config?.enabled) {
 *   console.log(`Slow query threshold: ${config.slowThreshold}ms`);
 * }
 * ```
 */
export function getDatabaseMonitoringConfig(): MonitoringConfig | undefined
{
    return getMonitoringConfig();
}