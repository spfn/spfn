/**
 * Cache factory with automatic environment variable detection
 * Supports Valkey and Redis with multiple deployment patterns
 *
 * Valkey is a Redis fork (7.2.4 base) with 100% protocol compatibility
 * https://valkey.io
 */

import type { Redis, Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { logger } from '../logger';

const cacheLogger = logger.child('cache');

export interface CacheClients {
    /** Primary cache for writes (or both read/write if no replica) */
    write?: Redis | Cluster;
    /** Replica cache for reads (optional, falls back to write) */
    read?: Redis | Cluster;
}

/**
 * Check if any cache configuration exists in environment
 *
 * Priority:
 * 1. VALKEY_* / CACHE_* (modern)
 * 2. REDIS_* (backward compatibility)
 */
function hasCacheConfig(): boolean
{
    return !!(
        // Modern (Valkey/Cache)
        process.env.VALKEY_URL ||
        process.env.CACHE_URL ||
        process.env.VALKEY_WRITE_URL ||
        process.env.VALKEY_READ_URL ||
        process.env.CACHE_WRITE_URL ||
        process.env.CACHE_READ_URL ||
        process.env.VALKEY_SENTINEL_HOSTS ||
        process.env.VALKEY_CLUSTER_NODES ||
        // Legacy (Redis - backward compatibility)
        process.env.REDIS_URL ||
        process.env.REDIS_WRITE_URL ||
        process.env.REDIS_READ_URL ||
        process.env.REDIS_SENTINEL_HOSTS ||
        process.env.REDIS_CLUSTER_NODES
    );
}

/**
 * Get environment variable with priority fallback
 * Valkey/Cache takes precedence over Redis (legacy)
 */
function getEnv(valkeyKey: string, cacheKey: string, redisKey: string): string | undefined
{
    return process.env[valkeyKey] || process.env[cacheKey] || process.env[redisKey];
}

/**
 * Create cache client with TLS support
 * Supports both valkey:// and redis:// protocols
 */
function createClient(
    RedisClient: new (url: string, options?: RedisOptions) => Redis,
    url: string
): Redis
{
    const options: RedisOptions = {};

    // TLS support for secure connections
    if (url.startsWith('rediss://') || url.startsWith('valkeys://'))
    {
        const rejectUnauthorized = getEnv(
            'VALKEY_TLS_REJECT_UNAUTHORIZED',
            'CACHE_TLS_REJECT_UNAUTHORIZED',
            'REDIS_TLS_REJECT_UNAUTHORIZED'
        );

        options.tls = {
            rejectUnauthorized: rejectUnauthorized !== 'false',
        };
    }

    return new RedisClient(url, options);
}

/**
 * Create cache client(s) from environment variables
 *
 * Supported patterns (priority order):
 * 1. Single instance: VALKEY_URL or CACHE_URL or REDIS_URL
 * 2. Master-Replica: VALKEY_WRITE_URL + VALKEY_READ_URL (or CACHE_*, REDIS_*)
 * 3. Sentinel: VALKEY_SENTINEL_HOSTS + VALKEY_MASTER_NAME (or REDIS_*)
 * 4. Cluster: VALKEY_CLUSTER_NODES (or REDIS_*)
 *
 * @returns Cache client(s) or undefined if no configuration found
 *
 * @example
 * ```bash
 * # Single (most common)
 * VALKEY_URL=valkey://localhost:6379
 * CACHE_URL=redis://localhost:6379
 *
 * # Legacy (still supported)
 * REDIS_URL=redis://localhost:6379
 * REDIS_URL=rediss://secure.redis.com:6380  # TLS
 *
 * # Master-Replica
 * VALKEY_WRITE_URL=valkey://master:6379
 * VALKEY_READ_URL=valkey://replica:6379
 *
 * # Sentinel
 * VALKEY_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379
 * VALKEY_MASTER_NAME=mymaster
 * VALKEY_PASSWORD=secret
 *
 * # Cluster
 * VALKEY_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
 * VALKEY_PASSWORD=secret
 * ```
 */
export async function createCacheFromEnv(): Promise<CacheClients>
{
    // Quick exit if no cache config
    if (!hasCacheConfig())
    {
        cacheLogger.info('No cache configuration found - running without cache');
        return { write: undefined, read: undefined };
    }

    try
    {
        // Dynamic import to avoid bundling if not used
        const ioredis = await import('ioredis');
        const RedisClient = ioredis.default;

        // Get URLs with priority fallback
        const singleUrl = getEnv('VALKEY_URL', 'CACHE_URL', 'REDIS_URL');
        const writeUrl = getEnv('VALKEY_WRITE_URL', 'CACHE_WRITE_URL', 'REDIS_WRITE_URL');
        const readUrl = getEnv('VALKEY_READ_URL', 'CACHE_READ_URL', 'REDIS_READ_URL');
        const clusterNodes = getEnv('VALKEY_CLUSTER_NODES', 'CACHE_CLUSTER_NODES', 'REDIS_CLUSTER_NODES');
        const sentinelHosts = getEnv('VALKEY_SENTINEL_HOSTS', 'CACHE_SENTINEL_HOSTS', 'REDIS_SENTINEL_HOSTS');
        const masterName = getEnv('VALKEY_MASTER_NAME', 'CACHE_MASTER_NAME', 'REDIS_MASTER_NAME');
        const password = getEnv('VALKEY_PASSWORD', 'CACHE_PASSWORD', 'REDIS_PASSWORD');

        // 1. Single instance (most common - highest priority)
        if (singleUrl && !writeUrl && !readUrl && !clusterNodes)
        {
            const client = createClient(RedisClient, singleUrl);
            cacheLogger.debug('Created single cache instance', { url: singleUrl.replace(/:[^:@]+@/, ':***@') });
            return { write: client, read: client };
        }

        // 2. Master-Replica pattern (both URLs required)
        if (writeUrl && readUrl)
        {
            const write = createClient(RedisClient, writeUrl);
            const read = createClient(RedisClient, readUrl);
            cacheLogger.debug('Created master-replica cache instances');
            return { write, read };
        }

        // 3. Sentinel pattern
        if (sentinelHosts && masterName)
        {
            const sentinels = sentinelHosts.split(',').map((host) =>
            {
                const [hostname, port] = host.trim().split(':');
                return { host: hostname, port: Number(port) || 26379 };
            });

            const options: RedisOptions = {
                sentinels,
                name: masterName,
                password,
            };

            const client = new RedisClient(options);
            cacheLogger.debug('Created sentinel cache instance', { masterName, sentinels: sentinels.length });
            return { write: client, read: client };
        }

        // 4. Cluster pattern
        if (clusterNodes)
        {
            const nodes = clusterNodes.split(',').map((node) =>
            {
                const [host, port] = node.trim().split(':');
                return { host, port: Number(port) || 6379 };
            });

            const clusterOptions: ClusterOptions = {
                redisOptions: {
                    password,
                },
            };

            const cluster = new RedisClient.Cluster(nodes, clusterOptions);
            cacheLogger.debug('Created cluster cache instance', { nodes: nodes.length });
            return { write: cluster, read: cluster };
        }

        // 5. Fallback: Single URL with other configs present
        if (singleUrl)
        {
            const client = createClient(RedisClient, singleUrl);
            cacheLogger.debug('Created cache instance (fallback)', { url: singleUrl.replace(/:[^:@]+@/, ':***@') });
            return { write: client, read: client };
        }

        // No valid configuration
        cacheLogger.info('No valid cache configuration found - running without cache');
        return { write: undefined, read: undefined };
    }
    catch (error)
    {
        if (error instanceof Error)
        {
            // Check if it's a missing dependency error
            if (error.message.includes('Cannot find module'))
            {
                cacheLogger.warn(
                    'Cache client library not installed',
                    error,
                    {
                        suggestion: 'Install ioredis to enable cache: pnpm install ioredis',
                        mode: 'disabled'
                    }
                );
            }
            else
            {
                cacheLogger.warn(
                    'Failed to create cache client',
                    error,
                    { mode: 'disabled' }
                );
            }
        }
        else
        {
            cacheLogger.warn(
                'Failed to create cache client',
                { error: String(error), mode: 'disabled' }
            );
        }
        return { write: undefined, read: undefined };
    }
}

/**
 * Create single cache client (backward compatibility)
 * Only returns write instance
 */
export async function createSingleCacheFromEnv(): Promise<Redis | Cluster | undefined>
{
    const { write } = await createCacheFromEnv();
    return write;
}