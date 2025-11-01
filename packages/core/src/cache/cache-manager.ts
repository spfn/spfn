/**
 * Global cache instance manager
 * Provides singleton access to cache (Valkey/Redis) across all modules
 * Supports Master-Replica pattern with separate read/write instances
 *
 * When cache is unavailable, falls back to disabled mode gracefully
 */

import type { Redis, Cluster } from 'ioredis';

import { createCacheFromEnv } from './cache-factory.js';
import { logger } from '../logger';

const cacheLogger = logger.child('cache');

let writeInstance: Redis | Cluster | undefined;
let readInstance: Redis | Cluster | undefined;
let isDisabled = false;

/**
 * Get global cache write instance
 *
 * @returns Cache write instance or undefined if disabled/not initialized
 *
 * @example
 * ```typescript
 * import { getCache } from '@spfn/core/cache';
 *
 * const cache = getCache();
 * if (cache) {
 *   await cache.set('key', 'value');
 * } else {
 *   // Cache disabled - handle gracefully
 *   console.log('Cache unavailable, skipping...');
 * }
 * ```
 */
export function getCache(): Redis | Cluster | undefined
{
    return writeInstance;
}

/**
 * Get global cache read instance (falls back to write if no replica)
 *
 * @returns Cache read instance or write instance as fallback, undefined if disabled
 *
 * @example
 * ```typescript
 * import { getCacheRead } from '@spfn/core/cache';
 *
 * const cache = getCacheRead();
 * if (cache) {
 *   const value = await cache.get('key');
 * }
 * ```
 */
export function getCacheRead(): Redis | Cluster | undefined
{
    return readInstance ?? writeInstance;
}

/**
 * Check if cache is disabled (connection failed or not configured)
 *
 * @example
 * ```typescript
 * import { isCacheDisabled } from '@spfn/core/cache';
 *
 * if (isCacheDisabled()) {
 *   // Use alternative strategy (e.g., in-memory cache, database)
 *   return await fetchFromDatabase();
 * }
 * ```
 */
export function isCacheDisabled(): boolean
{
    return isDisabled;
}

/**
 * Set global cache instances (for testing or manual configuration)
 *
 * @param write - Cache write instance
 * @param read - Cache read instance (optional, defaults to write)
 *
 * @example
 * ```typescript
 * import { setCache } from '@spfn/core/cache';
 * import Redis from 'ioredis';
 *
 * const write = new Redis('redis://master:6379');
 * const read = new Redis('redis://replica:6379');
 * setCache(write, read);
 * ```
 */
export function setCache(
    write: Redis | Cluster | undefined,
    read?: Redis | Cluster | undefined
): void
{
    writeInstance = write;
    readInstance = read ?? write;
    isDisabled = !write;
}

/**
 * Initialize cache from environment variables
 * Automatically called by startServer()
 *
 * Supported environment variables (priority order):
 * - VALKEY_URL / CACHE_URL (single instance)
 * - VALKEY_WRITE_URL + VALKEY_READ_URL (master-replica)
 * - VALKEY_SENTINEL_HOSTS + VALKEY_MASTER_NAME (sentinel)
 * - VALKEY_CLUSTER_NODES (cluster)
 * - VALKEY_TLS_REJECT_UNAUTHORIZED (TLS config)
 * - Legacy: REDIS_* (backward compatibility)
 *
 * @returns Object with write and read instances, or undefined if disabled
 *
 * @example
 * ```typescript
 * import { initCache } from '@spfn/core/cache';
 *
 * // Manual initialization (not needed if using startServer)
 * const { write, read, disabled } = await initCache();
 * if (!disabled) {
 *   console.log('Cache available');
 * }
 * ```
 */
export async function initCache(): Promise<{
    write?: Redis | Cluster;
    read?: Redis | Cluster;
    disabled: boolean;
}>
{
    // Already initialized
    if (writeInstance)
    {
        return { write: writeInstance, read: readInstance, disabled: isDisabled };
    }

    // Auto-detect from environment
    const { write, read } = await createCacheFromEnv();

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
            isDisabled = false;

            const hasReplica = read && read !== write;
            cacheLogger.info(
                hasReplica
                    ? 'Cache connected (Master-Replica)'
                    : 'Cache connected',
                { mode: 'enabled' }
            );

            return { write: writeInstance, read: readInstance, disabled: false };
        }
        catch (error)
        {
            cacheLogger.error(
                'Cache connection failed - running in disabled mode',
                error instanceof Error ? error : new Error(String(error)),
                { mode: 'disabled' }
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

            isDisabled = true;
            return { write: undefined, read: undefined, disabled: true };
        }
    }

    // No configuration or library not installed
    isDisabled = true;
    cacheLogger.info('Cache disabled - no configuration or library not installed', { mode: 'disabled' });
    return { write: undefined, read: undefined, disabled: true };
}

/**
 * Close all cache connections and cleanup
 *
 * @example
 * ```typescript
 * import { closeCache } from '@spfn/core/cache';
 *
 * // During graceful shutdown
 * await closeCache();
 * ```
 */
export async function closeCache(): Promise<void>
{
    if (isDisabled)
    {
        cacheLogger.debug('Cache already disabled, nothing to close');
        return;
    }

    const closePromises: Promise<unknown>[] = [];

    if (writeInstance)
    {
        closePromises.push(
            writeInstance.quit().catch((err: Error) =>
            {
                cacheLogger.error('Error closing cache write instance', err);
            })
        );
    }

    if (readInstance && readInstance !== writeInstance)
    {
        closePromises.push(
            readInstance.quit().catch((err: Error) =>
            {
                cacheLogger.error('Error closing cache read instance', err);
            })
        );
    }

    await Promise.all(closePromises);

    writeInstance = undefined;
    readInstance = undefined;
    isDisabled = true;

    cacheLogger.info('Cache connections closed', { mode: 'disabled' });
}

/**
 * Get cache connection info (for debugging)
 *
 * @example
 * ```typescript
 * import { getCacheInfo } from '@spfn/core/cache';
 *
 * const info = getCacheInfo();
 * console.log(info);
 * // {
 * //   hasWrite: true,
 * //   hasRead: true,
 * //   isReplica: true,
 * //   disabled: false
 * // }
 * ```
 */
export function getCacheInfo(): {
    hasWrite: boolean;
    hasRead: boolean;
    isReplica: boolean;
    disabled: boolean;
}
{
    return {
        hasWrite: !!writeInstance,
        hasRead: !!readInstance,
        isReplica: !!(readInstance && readInstance !== writeInstance),
        disabled: isDisabled,
    };
}

// Legacy exports (backward compatibility)
/** @deprecated Use getCache() instead */
export const getRedis = getCache;

/** @deprecated Use getCacheRead() instead */
export const getRedisRead = getCacheRead;

/** @deprecated Use setCache() instead */
export const setRedis = setCache;

/** @deprecated Use initCache() instead */
export const initRedis = initCache;

/** @deprecated Use closeCache() instead */
export const closeRedis = closeCache;

/** @deprecated Use getCacheInfo() instead */
export const getRedisInfo = getCacheInfo;