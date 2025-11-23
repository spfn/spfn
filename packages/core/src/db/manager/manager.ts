/**
 * Global Database instance manager
 * Provides singleton access to database across all modules
 * Supports Primary + Replica pattern with separate read/write instances
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

import { logger } from '../../logger';
import { createDatabaseFromEnv } from './factory';
import type { DatabaseOptions, MonitoringConfig } from "./config.js";
import { buildHealthCheckConfig, buildMonitoringConfig } from "./config.js";
import { env } from '../../config';
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

const dbLogger = logger.child('@spfn/core:database');

/**
 * Connection close timeout in seconds
 */
const DB_CONNECTION_CLOSE_TIMEOUT = 5;

/**
 * Number of stack trace lines to skip when detecting caller
 */
const STACK_TRACE_SKIP_LINES = 3;

/**
 * Regular expressions for parsing stack trace lines
 */
const STACK_TRACE_PATTERNS = {
    withParens: /\((.+):(\d+):(\d+)\)/,
    withoutParens: /at (.+):(\d+):(\d+)/,
};

/**
 * Initialization promise to prevent concurrent initialization
 */
let initPromise: Promise<{
    write?: PostgresJsDatabase<Record<string, unknown>>;
    read?: PostgresJsDatabase<Record<string, unknown>>;
}> | null = null;

/**
 * Close in progress flag to prevent concurrent closeDatabase calls
 */
let isClosing = false;

/**
 * DB connection type
 */
export type DbConnectionType = 'read' | 'write';

/**
 * GetDatabase function type
 */
export type GetDatabaseFn = (type?: DbConnectionType) => PostgresJsDatabase<Record<string, unknown>>;

// ============================================================================
// Helper Functions (Private)
// ============================================================================

/**
 * Cleanup database connections
 *
 * Closes write and read client connections with timeout.
 * Ignores cleanup errors to ensure all cleanup attempts complete.
 *
 * @param writeClient - Write client to cleanup
 * @param readClient - Read client to cleanup
 * @internal
 */
async function cleanupDatabaseConnections(
    writeClient: Sql | undefined,
    readClient: Sql | undefined
): Promise<void>
{
    const cleanupPromises: Promise<void>[] = [];

    if (writeClient)
    {
        cleanupPromises.push(
            writeClient.end({ timeout: DB_CONNECTION_CLOSE_TIMEOUT }).catch((err) => {
                dbLogger.debug('Write client cleanup failed', { error: err });
            })
        );
    }

    if (readClient && readClient !== writeClient)
    {
        cleanupPromises.push(
            readClient.end({ timeout: DB_CONNECTION_CLOSE_TIMEOUT }).catch((err) => {
                dbLogger.debug('Read client cleanup failed', { error: err });
            })
        );
    }

    await Promise.allSettled(cleanupPromises);
}

/**
 * Close a single database client connection
 *
 * @param client - Database client to close
 * @param type - Connection type ('write' or 'read')
 * @internal
 */
async function closeDatabaseClient(client: Sql, type: 'write' | 'read'): Promise<void>
{
    const typeName = type.charAt(0).toUpperCase() + type.slice(1);
    dbLogger.debug(`Closing ${type} connection...`);

    try
    {
        await client.end({ timeout: DB_CONNECTION_CLOSE_TIMEOUT });
        dbLogger.debug(`${typeName} connection closed`);
    }
    catch (err: unknown)
    {
        const error = err instanceof Error ? err : new Error(String(err));
        dbLogger.error(`Error closing ${type} connection`, error);
    }
}

/**
 * Test database connections
 *
 * Executes a simple SELECT 1 query on both write and read connections.
 *
 * @param write - Write database instance
 * @param read - Read database instance
 * @throws Error if connection test fails
 * @internal
 */
async function testDatabaseConnections(
    write: PostgresJsDatabase<Record<string, unknown>> | undefined,
    read: PostgresJsDatabase<Record<string, unknown>> | undefined
): Promise<void>
{
    if (write)
    {
        await write.execute('SELECT 1');

        // Test read connection if different from write
        if (read && read !== write)
        {
            await read.execute('SELECT 1');
        }
    }
}

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
        for (let i = STACK_TRACE_SKIP_LINES; i < lines.length; i++)
        {
            const line = lines[i];
            // Find first meaningful caller (not node_modules/@spfn/core/db)
            if (!line.includes('node_modules') && !line.includes('/db/manager/'))
            {
                // Extract file:line from stack line
                const match = line.match(STACK_TRACE_PATTERNS.withParens) || line.match(STACK_TRACE_PATTERNS.withoutParens);
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
    catch (error: unknown)
    {
        // Stack trace parsing failed - log for debugging
        dbLogger.debug('Failed to extract caller info from stack trace', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
    return undefined;
}

/**
 * Create database not initialized error message
 *
 * @param type - Database connection type ('read' or 'write')
 * @returns Error with descriptive message for uninitialized database
 *
 * @internal
 */
function createNotInitializedError(type: DbConnectionType): Error
{
    return new Error(
        `Database not initialized (type: ${type}). Call initDatabase() first or set DATABASE_URL environment variable.`
    );
}

/**
 * Get global database instance
 *
 * @param type - Connection type ('read' or 'write', defaults to 'write')
 * @returns Database instance (never undefined)
 * @throws Error if database is not initialized
 *
 * @example
 * ```typescript
 * import { getDatabase } from '@spfn/core/db';
 *
 * // Always returns a valid instance or throws
 * const db = getDatabase();
 * const users = await db.select().from(usersTable);
 *
 * // For read operations (uses replica if available, falls back to primary)
 * const dbRead = getDatabase('read');
 * const posts = await dbRead.select().from(postsTable);
 * ```
 */
export function getDatabase(type?: DbConnectionType): PostgresJsDatabase<Record<string, unknown>>
{
    const writeInst = getWriteInstance();
    const readInst = getReadInstance();

    // Detailed debug logging with caller info (only if DB_DEBUG_TRACE is enabled in non-production)
    if (env.DB_DEBUG_TRACE && env.NODE_ENV !== 'production')
    {
        const caller = getCallerInfo();
        dbLogger.debug('getDatabase() called', {
            type: type ?? 'write',
            hasWrite: !!writeInst,
            hasRead: !!readInst,
            caller,
        });
    }

    if (type === 'read')
    {
        const db = readInst ?? writeInst;
        if (!db)
        {
            throw createNotInitializedError('read');
        }
        return db;
    }

    // Default: 'write' type
    if (!writeInst)
    {
        throw createNotInitializedError('write');
    }

    return writeInst;
}

/**
 * Set global database instances (for testing or manual configuration)
 *
 * This function directly sets database instances without creating connections
 * or performing validation. It's primarily intended for testing scenarios.
 *
 * @param write - Database write instance (pass undefined to clear)
 * @param read - Database read instance (optional, defaults to write, pass undefined to clear)
 *
 * @remarks
 * **Important:** To properly close database connections with cleanup, use `closeDatabase()` instead.
 * This function only updates the global instances without closing the underlying connections.
 * Setting both to undefined will clear the instances but leave connections open, which may cause resource leaks.
 *
 * @example
 * ```typescript
 * import { setDatabase } from '@spfn/core/db';
 * import { drizzle } from 'drizzle-orm/postgres-js';
 * import postgres from 'postgres';
 *
 * // Set custom database instances (testing)
 * const writeClient = postgres('postgresql://primary:5432/mydb');
 * const readClient = postgres('postgresql://replica:5432/mydb');
 * setDatabase(drizzle(writeClient), drizzle(readClient));
 *
 * // Clear instances (not recommended - use closeDatabase() instead)
 * setDatabase(undefined, undefined);
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
    // Prevent initialization during close operation
    if (isClosing)
    {
        throw new Error('Cannot initialize database while closing');
    }

    // Already initialized
    const writeInst = getWriteInstance();
    if (writeInst)
    {
        dbLogger.debug('Database already initialized');
        return { write: writeInst, read: getReadInstance() };
    }

    // Initialization in progress - wait for it to complete
    if (initPromise)
    {
        dbLogger.debug('Database initialization in progress, waiting...');
        return await initPromise;
    }

    // Start initialization with lock
    initPromise = (async () =>
    {
        try
        {
            // Auto-detect from environment
            const result = await createDatabaseFromEnv(options);

            // Test connections
            try
            {
                await testDatabaseConnections(result.write, result.read);
            }
            catch (error: unknown)
            {
                // Connection test failed - cleanup and throw
                await cleanupDatabaseConnections(result.writeClient, result.readClient);

                const message = error instanceof Error ? error.message : 'Unknown error';
                throw new Error(`Database connection test failed: ${message}`);
            }

            // Check if database was closed during initialization
            if (isClosing)
            {
                dbLogger.warn('Database closed during initialization, cleaning up...');
                await cleanupDatabaseConnections(result.writeClient, result.readClient);
                throw new Error('Database closed during initialization');
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

            return { write: getWriteInstance(), read: getReadInstance() };
        }
        finally
        {
            // Clear lock after initialization completes (success or failure)
            initPromise = null;
        }
    })();

    return await initPromise;
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
    // Prevent concurrent close operations
    if (isClosing)
    {
        dbLogger.debug('Database close already in progress');
        return;
    }

    // Set closing flag early to prevent new operations
    isClosing = true;

    // Wait for any in-progress initialization to complete before closing
    if (initPromise)
    {
        dbLogger.debug('Waiting for database initialization to complete before closing...');

        try
        {
            await initPromise;
        }
        catch (_error: unknown)
        {
            // Initialization failed, but we still need to cleanup any partial state
            dbLogger.debug('Initialization failed during close, proceeding with cleanup');
        }
    }

    const writeInst = getWriteInstance();
    const readInst = getReadInstance();
    if (!writeInst && !readInst)
    {
        dbLogger.debug('No database connections to close');
        isClosing = false;
        return;
    }

    try
    {
        // Stop health check
        stopHealthCheck();

        const closePromises: Promise<void>[] = [];

        // Close write client
        const writeC = getWriteClient();
        if (writeC)
        {
            closePromises.push(closeDatabaseClient(writeC, 'write'));
        }

        // Close read client (if different from write)
        const readC = getReadClient();
        if (readC && readC !== writeC)
        {
            closePromises.push(closeDatabaseClient(readC, 'read'));
        }

        // Wait for all connections to close (use allSettled to ensure all cleanup attempts complete)
        await Promise.allSettled(closePromises);

        dbLogger.info('All database connections closed');
    }
    finally
    {
        // Always clear instances and reset flag
        setWriteInstance(undefined);
        setReadInstance(undefined);
        setWriteClient(undefined);
        setReadClient(undefined);
        setMonitoringConfig(undefined);
        isClosing = false;
    }
}

/**
 * Get database connection info (for debugging)
 *
 * Returns the current state of database connections without throwing errors.
 * Useful for health checks, monitoring, and debugging initialization issues.
 *
 * @returns Connection status information
 * - `hasWrite`: Whether write database instance is initialized
 * - `hasRead`: Whether read database instance is initialized
 * - `isReplica`: Whether read and write are different instances (Primary + Replica setup)
 *
 * @example
 * ```typescript
 * import { getDatabaseInfo } from '@spfn/core/db';
 *
 * const info = getDatabaseInfo();
 * console.log(`Write: ${info.hasWrite}, Read: ${info.hasRead}, Replica: ${info.isReplica}`);
 *
 * // Check before using database
 * if (!info.hasWrite) {
 *   console.warn('Database not initialized');
 * }
 *
 * // Detect Primary + Replica setup
 * if (info.isReplica) {
 *   console.log('Using Primary + Replica configuration');
 * }
 * ```
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