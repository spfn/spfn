/**
 * Database Health Check
 *
 * Periodic health checks for database connections with automatic reconnection.
 * Monitors both write and read database instances and attempts recovery on failure.
 *
 * Key design decisions:
 * - Atomic swap: new connections are created and tested BEFORE replacing global state
 * - Health check interval survives reconnection attempts (never stopped during reconnect)
 * - isReconnecting flag prevents concurrent reconnection attempts
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';

import { logger } from '@spfn/core/logger';
import { createDatabaseFromEnv } from './factory';
import type { DatabaseOptions, HealthCheckConfig } from './config';
import { buildMonitoringConfig } from './config';
import {
    getHealthCheckInterval,
    setHealthCheckInterval,
    getWriteClient,
    getReadClient,
    setWriteInstance,
    setReadInstance,
    setWriteClient,
    setReadClient,
    setMonitoringConfig,
} from './global-state';
import type { GetDatabaseFn } from './types';

const dbLogger = logger.child('@spfn/core:database');

/**
 * Connection close timeout in seconds
 */
const CLIENT_CLOSE_TIMEOUT = 5;

/**
 * Flag to prevent concurrent reconnection attempts
 */
let isReconnecting = false;

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
 * Close a raw postgres client with timeout
 *
 * Ignores errors to prevent cleanup failures from blocking reconnection.
 *
 * @param client - Raw postgres client to close
 * @internal
 */
async function closeClient(client: Sql): Promise<void>
{
    try
    {
        await client.end({ timeout: CLIENT_CLOSE_TIMEOUT });
    }
    catch
    {
        // Ignore cleanup errors (client may already be closed)
    }
}

/**
 * Reconnect database using atomic swap
 *
 * Creates new connections first, tests them, then swaps global state.
 * Old clients are closed after the swap. If creation fails, old state is preserved.
 *
 * @param options - Optional database configuration
 * @returns true if reconnection successful, false otherwise
 * @internal
 */
async function reconnectAndRestore(
    options: DatabaseOptions | undefined
): Promise<boolean>
{
    // Create new connections (old instances remain in place)
    const result = await createDatabaseFromEnv(options);

    if (!result.write)
    {
        return false;
    }

    // Test new connections before swapping
    await testDatabaseConnection(result.write);
    if (result.read && result.read !== result.write)
    {
        await testDatabaseConnection(result.read);
    }

    // Capture old clients for cleanup
    const oldWriteClient = getWriteClient();
    const oldReadClient = getReadClient();

    // Atomic swap: replace global state with new instances
    setWriteInstance(result.write);
    setReadInstance(result.read);
    setWriteClient(result.writeClient);
    setReadClient(result.readClient);

    // Restore monitoring configuration
    const monConfig = buildMonitoringConfig(options?.monitoring);
    setMonitoringConfig(monConfig);

    // Close old clients after swap (fire and forget)
    if (oldWriteClient)
    {
        closeClient(oldWriteClient);
    }
    if (oldReadClient && oldReadClient !== oldWriteClient)
    {
        closeClient(oldReadClient);
    }

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
 * The health check interval survives reconnection attempts - it is never stopped
 * during reconnection, ensuring continuous monitoring even after failures.
 *
 * @param config - Health check configuration
 * @param options - Optional database configuration (pool settings, etc.)
 * @param getDatabase - Function to get database instance (to avoid circular dependency)
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
 *   getDatabase
 * );
 * ```
 */
export function startHealthCheck(
    config: HealthCheckConfig,
    options: DatabaseOptions | undefined,
    getDatabase: GetDatabaseFn
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
        // Skip if reconnection is in progress
        if (isReconnecting)
        {
            dbLogger.debug('Health check skipped: reconnection in progress');
            return;
        }

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
                await attemptReconnection(config, options);
            }
        }
    }, config.interval);

    setHealthCheckInterval(interval);
}

/**
 * Attempt database reconnection with retry logic
 *
 * Uses atomic swap to replace connections without clearing global state.
 * Old instances remain available until new connections are verified.
 * The health check interval continues running throughout the process.
 *
 * @param config - Health check configuration
 * @param options - Optional database configuration (pool settings, etc.)
 */
async function attemptReconnection(
    config: HealthCheckConfig,
    options: DatabaseOptions | undefined
): Promise<void>
{
    isReconnecting = true;

    dbLogger.warn('Attempting database reconnection', {
        maxRetries: config.maxRetries,
        retryInterval: `${config.retryInterval}ms`,
    });

    try
    {
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

                // Attempt reconnection with atomic swap
                const success = await reconnectAndRestore(options);

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
                dbLogger.error('Max reconnection attempts reached, will retry on next health check');
            }
        }
    }
    finally
    {
        isReconnecting = false;
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

    isReconnecting = false;
}
