/**
 * Global Redis instance manager
 * Provides singleton access to Redis across all modules
 * Supports Master-Replica pattern with separate read/write instances
 */

import type { Redis, Cluster } from 'ioredis';

import { createRedisFromEnv } from './redis-factory.js';
import { logger } from '../logger';

const cacheLogger = logger.child('cache');

let writeInstance: Redis | Cluster | undefined;
let readInstance: Redis | Cluster | undefined;

/**
 * Get global Redis write instance
 *
 * @returns Redis write instance or undefined if not initialized
 *
 * @example
 * ```typescript
 * import { getRedis } from '@spfn/core/cache';
 *
 * const redis = getRedis();
 * if (redis) {
 *   await redis.set('key', 'value');
 * }
 * ```
 */
export function getRedis(): Redis | Cluster | undefined
{
    return writeInstance;
}

/**
 * Get global Redis read instance (falls back to write if no replica)
 *
 * @returns Redis read instance or write instance as fallback
 *
 * @example
 * ```typescript
 * import { getRedisRead } from '@spfn/core/cache';
 *
 * const redis = getRedisRead();
 * if (redis) {
 *   const value = await redis.get('key');
 * }
 * ```
 */
export function getRedisRead(): Redis | Cluster | undefined
{
    return readInstance ?? writeInstance;
}

/**
 * Set global Redis instances (for testing or manual configuration)
 *
 * @param write - Redis write instance
 * @param read - Redis read instance (optional, defaults to write)
 *
 * @example
 * ```typescript
 * import { setRedis } from '@spfn/core/cache';
 * import Redis from 'ioredis';
 *
 * const write = new Redis('redis://master:6379');
 * const read = new Redis('redis://replica:6379');
 * setRedis(write, read);
 * ```
 */
export function setRedis(
    write: Redis | Cluster | undefined,
    read?: Redis | Cluster | undefined
): void
{
    writeInstance = write;
    readInstance = read ?? write;
}

/**
 * Initialize Redis from environment variables
 * Automatically called by startServer()
 *
 * Supported environment variables:
 * - REDIS_URL (single instance)
 * - REDIS_WRITE_URL + REDIS_READ_URL (master-replica)
 * - REDIS_SENTINEL_HOSTS + REDIS_MASTER_NAME (sentinel)
 * - REDIS_CLUSTER_NODES (cluster)
 * - REDIS_TLS_REJECT_UNAUTHORIZED (TLS config)
 *
 * @returns Object with write and read instances
 *
 * @example
 * ```typescript
 * import { initRedis } from '@spfn/core/cache';
 *
 * // Manual initialization (not needed if using startServer)
 * const { write, read } = await initRedis();
 * ```
 */
export async function initRedis(): Promise<{ write?: Redis | Cluster; read?: Redis | Cluster }>
{
    // Already initialized
    if (writeInstance)
    {
        return { write: writeInstance, read: readInstance };
    }

    // Auto-detect from environment
    const { write, read } = await createRedisFromEnv();

    if (write)
    {
        try
        {
            // Test connection
            await write.ping();

            // Test read instance if different
            if (read && read !== write)
            {
                await read.ping();
            }

            writeInstance = write;
            readInstance = read;

            const hasReplica = read && read !== write;
            cacheLogger.info(
                hasReplica
                    ? 'Redis connected (Master-Replica)'
                    : 'Redis connected'
            );
        }
        catch (error)
        {
            cacheLogger.error(
                'Redis connection failed',
                error instanceof Error ? error : new Error(String(error))
            );

            // Clean up failed connections
            try
            {
                await write.quit();
                if (read && read !== write)
                {
                    await read.quit();
                }
            }
            catch
            {
                // Ignore cleanup errors
            }

            return { write: undefined, read: undefined };
        }
    }

    return { write: writeInstance, read: readInstance };
}

/**
 * Close all Redis connections and cleanup
 *
 * @example
 * ```typescript
 * import { closeRedis } from '@spfn/core/cache';
 *
 * // During graceful shutdown
 * await closeRedis();
 * ```
 */
export async function closeRedis(): Promise<void>
{
    const closePromises: Promise<unknown>[] = [];

    if (writeInstance)
    {
        closePromises.push(
            writeInstance.quit().catch((err: Error) =>
            {
                cacheLogger.error('Error closing Redis write instance', err);
            })
        );
    }

    if (readInstance && readInstance !== writeInstance)
    {
        closePromises.push(
            readInstance.quit().catch((err: Error) =>
            {
                cacheLogger.error('Error closing Redis read instance', err);
            })
        );
    }

    await Promise.all(closePromises);

    writeInstance = undefined;
    readInstance = undefined;

    cacheLogger.info('Redis connections closed');
}

/**
 * Get Redis connection info (for debugging)
 */
export function getRedisInfo(): {
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