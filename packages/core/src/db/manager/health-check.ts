/**
 * Database Health Check
 *
 * Periodic health checks for database connections with automatic reconnection.
 * Monitors both write and read database instances and attempts recovery on failure.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { logger } from '../../logger';
import { createDatabaseFromEnv } from './factory.js';
import type { DatabaseOptions, HealthCheckConfig } from './config.js';
import {
    getHealthCheckInterval,
    setHealthCheckInterval,
    setWriteInstance,
    setReadInstance,
    setWriteClient,
    setReadClient,
} from './global-state.js';

const dbLogger = logger.child('database');

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
    getDatabase: (type?: 'read' | 'write') => PostgresJsDatabase | undefined,
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

            // Close existing connections
            await closeDatabase();

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, config.retryInterval));

            // Reinitialize database
            const result = await createDatabaseFromEnv(options);

            if (result.write)
            {
                // Test connection
                await result.write.execute('SELECT 1');

                // Store instances
                setWriteInstance(result.write);
                setReadInstance(result.read);
                setWriteClient(result.writeClient);
                setReadClient(result.readClient);

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