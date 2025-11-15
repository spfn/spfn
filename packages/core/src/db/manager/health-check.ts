/**
 * Database Health Check
 *
 * Periodic health checks for database connections with automatic reconnection.
 * Monitors both write and read database instances and attempts recovery on failure.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { logger } from '../../logger';
import { createDatabaseFromEnv } from './factory';
import type { DatabaseOptions, HealthCheckConfig } from './config';
import { buildMonitoringConfig } from './config';
import {
    getHealthCheckInterval,
    setHealthCheckInterval,
    setWriteInstance,
    setReadInstance,
    setWriteClient,
    setReadClient,
    setMonitoringConfig,
} from './global-state';
import type { GetDatabaseFn } from './manager';

const dbLogger = logger.child('@spfn/core:database');

// ============================================================================
// Helper Functions (Private)
// ============================================================================

/**
 * Test a single database connection
 *
 * @param db - Database instance to test
 * @throws Error if connection test fails
 * @internal
 */
async function testDatabaseConnection(
    db: PostgresJsDatabase<Record<string, unknown>>
): Promise<void>
{
    await db.execute('SELECT 1');
}

/**
 * Perform health check on database connections
 *
 * Tests both write and read connections.
 *
 * @param getDatabase - Function to get database instance
 * @throws Error if health check fails
 * @internal
 */
async function performHealthCheck(getDatabase: GetDatabaseFn): Promise<void>
{
    const write = getDatabase('write');
    const read = getDatabase('read');

    await testDatabaseConnection(write);

    // Check read connection if different from write
    if (read !== write)
    {
        await testDatabaseConnection(read);
    }
}

/**
 * Reconnect database and restore instances
 *
 * Closes existing connections, creates new ones, tests them, and restores global state.
 *
 * @param options - Optional database configuration
 * @param closeDatabase - Function to close existing connections
 * @returns true if reconnection successful, false otherwise
 * @internal
 */
async function reconnectAndRestore(
    options: DatabaseOptions | undefined,
    closeDatabase: () => Promise<void>
): Promise<boolean>
{
    // Close existing connections
    await closeDatabase();

    // Create new connections
    const result = await createDatabaseFromEnv(options);

    if (!result.write)
    {
        return false;
    }

    // Test both connections before restoring
    await testDatabaseConnection(result.write);
    if (result.read && result.read !== result.write)
    {
        await testDatabaseConnection(result.read);
    }

    // Store instances
    setWriteInstance(result.write);
    setReadInstance(result.read);
    setWriteClient(result.writeClient);
    setReadClient(result.readClient);

    // Restore monitoring configuration
    const monConfig = buildMonitoringConfig(options?.monitoring);
    setMonitoringConfig(monConfig);

    return true;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start database health check
 *
 * Periodically checks database connection health and attempts reconnection if enabled.
 * Automatically started by initDatabase() when health check is enabled.
 *
 * @param config - Health check configuration
 * @param options - Optional database configuration (pool settings, etc.)
 * @param getDatabase - Function to get database instance (to avoid circular dependency)
 * @param closeDatabase - Function to close database (for reconnection)
 *
 * @example
 * ```typescript
 * import { startHealthCheck } from '@spfn/core/db/manager/health-check';
 *
 * startHealthCheck(
 *   {
 *     enabled: true,
 *     interval: 30000,      // 30 seconds
 *     reconnect: true,
 *     maxRetries: 5,
 *     retryInterval: 10000, // 10 seconds
 *   },
 *   undefined,
 *   getDatabase,
 *   closeDatabase
 * );
 * ```
 */
export function startHealthCheck(
    config: HealthCheckConfig,
    options: DatabaseOptions | undefined,
    getDatabase: GetDatabaseFn,
    closeDatabase: () => Promise<void>
): void
{
    const healthCheck = getHealthCheckInterval();
    if (healthCheck)
    {
        dbLogger.debug('Health check already running');
        return;
    }

    dbLogger.info('Starting database health check', {
        interval: `${config.interval}ms`,
        reconnect: config.reconnect,
    });

    const interval = setInterval(async () =>
    {
        try
        {
            await performHealthCheck(getDatabase);
            // Health check passed - no need to log (only log failures)
        }
        catch (error: unknown)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error('Database health check failed', { error: message });

            // Attempt reconnection if enabled
            if (config.reconnect)
            {
                await attemptReconnection(config, options, closeDatabase);
            }
        }
    }, config.interval);

    setHealthCheckInterval(interval);
}

/**
 * Attempt database reconnection with retry logic
 *
 * Closes existing connections and attempts to reinitialize the database.
 * Retries multiple times with configurable delay between attempts.
 *
 * @param config - Health check configuration
 * @param options - Optional database configuration (pool settings, etc.)
 * @param closeDatabase - Function to close existing database connections
 */
async function attemptReconnection(
    config: HealthCheckConfig,
    options: DatabaseOptions | undefined,
    closeDatabase: () => Promise<void>
): Promise<void>
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

            // Wait before retry (skip for first attempt)
            if (attempt > 1)
            {
                await new Promise(resolve => setTimeout(resolve, config.retryInterval));
            }

            // Attempt reconnection
            const success = await reconnectAndRestore(options, closeDatabase);

            if (success)
            {
                dbLogger.info('Database reconnection successful', { attempt });
                return;
            }
            else
            {
                dbLogger.error(`Reconnection attempt ${attempt} failed: No write database instance created`);
            }
        }
        catch (error: unknown)
        {
            const message = error instanceof Error ? error.message : 'Unknown error';
            dbLogger.error(`Reconnection attempt ${attempt} failed`, {
                error: message,
                attempt,
                maxRetries: config.maxRetries,
            });
        }

        if (attempt === config.maxRetries)
        {
            dbLogger.error('Max reconnection attempts reached, giving up');
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
 * import { stopHealthCheck } from '@spfn/core/db/manager/health-check';
 *
 * stopHealthCheck();
 * ```
 */
export function stopHealthCheck(): void
{
    const healthCheck = getHealthCheckInterval();
    if (healthCheck)
    {
        clearInterval(healthCheck);
        setHealthCheckInterval(undefined);
        dbLogger.info('Database health check stopped');
    }
}