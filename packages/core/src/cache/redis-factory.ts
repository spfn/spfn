/**
 * Redis factory with automatic environment variable detection
 * Supports: Single, Master-Replica, Sentinel, Cluster
 */

import type { Redis, Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { logger } from '../logger/index.js';

const cacheLogger = logger.child('cache');

export interface RedisClients {
    /** Primary Redis for writes (or both read/write if no replica) */
    write?: Redis | Cluster;
    /** Replica Redis for reads (optional, falls back to write) */
    read?: Redis | Cluster;
}

/**
 * Check if any Redis configuration exists in environment
 */
function hasRedisConfig(): boolean
{
    return !!(
        process.env.REDIS_URL ||
        process.env.REDIS_WRITE_URL ||
        process.env.REDIS_READ_URL ||
        process.env.REDIS_SENTINEL_HOSTS ||
        process.env.REDIS_CLUSTER_NODES
    );
}

/**
 * Create Redis client with TLS support
 */
function createClient(
    RedisClient: new (url: string, options?: RedisOptions) => Redis,
    url: string
): Redis
{
    const options: RedisOptions = {};

    // TLS support for rediss://
    if (url.startsWith('rediss://'))
    {
        options.tls = {
            rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
        };
    }

    return new RedisClient(url, options);
}

/**
 * Create Redis client(s) from environment variables
 *
 * Supported patterns (priority order):
 * 1. Single instance: REDIS_URL
 * 2. Master-Replica: REDIS_WRITE_URL + REDIS_READ_URL
 * 3. Sentinel: REDIS_SENTINEL_HOSTS + REDIS_MASTER_NAME
 * 4. Cluster: REDIS_CLUSTER_NODES
 *
 * @returns Redis client(s) or undefined if no configuration found
 *
 * @example
 * ```bash
 * # Single (most common)
 * REDIS_URL=redis://localhost:6379
 * REDIS_URL=rediss://secure.redis.com:6380  # TLS
 *
 * # Master-Replica
 * REDIS_WRITE_URL=redis://master:6379
 * REDIS_READ_URL=redis://replica:6379
 *
 * # Sentinel
 * REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379
 * REDIS_MASTER_NAME=mymaster
 * REDIS_PASSWORD=secret
 *
 * # Cluster
 * REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
 * REDIS_PASSWORD=secret
 * ```
 */
export async function createRedisFromEnv(): Promise<RedisClients>
{
    // Quick exit if no Redis config
    if (!hasRedisConfig())
    {
        return { write: undefined, read: undefined };
    }

    try
    {
        // Dynamic import to avoid bundling if not used
        const ioredis = await import('ioredis');
        const RedisClient = ioredis.default;

        // 1. Single instance (most common - highest priority)
        if (
            process.env.REDIS_URL &&
            !process.env.REDIS_WRITE_URL &&
            !process.env.REDIS_READ_URL &&
            !process.env.REDIS_CLUSTER_NODES
        )
        {
            const client = createClient(RedisClient, process.env.REDIS_URL);
            return { write: client, read: client };
        }

        // 2. Master-Replica pattern (both URLs required)
        if (process.env.REDIS_WRITE_URL && process.env.REDIS_READ_URL)
        {
            const write = createClient(RedisClient, process.env.REDIS_WRITE_URL);
            const read = createClient(RedisClient, process.env.REDIS_READ_URL);
            return { write, read };
        }

        // 3. Sentinel pattern
        if (process.env.REDIS_SENTINEL_HOSTS && process.env.REDIS_MASTER_NAME)
        {
            const sentinels = process.env.REDIS_SENTINEL_HOSTS.split(',').map((host) =>
            {
                const [hostname, port] = host.trim().split(':');
                return { host: hostname, port: Number(port) || 26379 };
            });

            const options: RedisOptions = {
                sentinels,
                name: process.env.REDIS_MASTER_NAME,
                password: process.env.REDIS_PASSWORD,
            };

            const client = new RedisClient(options);
            return { write: client, read: client };
        }

        // 4. Cluster pattern
        if (process.env.REDIS_CLUSTER_NODES)
        {
            const nodes = process.env.REDIS_CLUSTER_NODES.split(',').map((node) =>
            {
                const [host, port] = node.trim().split(':');
                return { host, port: Number(port) || 6379 };
            });

            const clusterOptions: ClusterOptions = {
                redisOptions: {
                    password: process.env.REDIS_PASSWORD,
                },
            };

            const cluster = new RedisClient.Cluster(nodes, clusterOptions);
            return { write: cluster, read: cluster };
        }

        // 5. Fallback: Single URL with other configs present
        if (process.env.REDIS_URL)
        {
            const client = createClient(RedisClient, process.env.REDIS_URL);
            return { write: client, read: client };
        }

        // No valid configuration
        return { write: undefined, read: undefined };
    }
    catch (error)
    {
        cacheLogger.warn(
            'Failed to create Redis client',
            error instanceof Error ? error : undefined,
            { suggestion: 'Using memory-only cache. Install ioredis: npm install ioredis' }
        );
        return { write: undefined, read: undefined };
    }
}

/**
 * Create single Redis client (backward compatibility)
 * Only returns write instance
 */
export async function createSingleRedisFromEnv(): Promise<Redis | Cluster | undefined>
{
    const { write } = await createRedisFromEnv();
    return write;
}