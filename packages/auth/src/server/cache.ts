/**
 * 3-Tier caching system for public keys
 * L1: Memory cache (fastest, ~0.001ms)
 * L2: Redis cache (fast, ~1ms)
 * L3: Database (slowest, ~10ms)
 */

import type { Redis } from 'ioredis';

import { isValidPublicKey } from './crypto.js';
import {
    DEFAULT_MEMORY_CACHE_TTL,
    DEFAULT_REDIS_CACHE_TTL,
    REDIS_PREFIXES,
} from '../shared/constants.js';

export interface PublicKeyCacheOptions
{
    /** Redis client instance */
    redis: Redis;

    /** Memory cache TTL in seconds */
    memoryTTL?: number;

    /** Redis cache TTL in seconds */
    redisTTL?: number;
}

/**
 * 3-Tier public key cache
 */
export class PublicKeyCache
{
    private memory: Map<string, { publicKey: string; expiresAt: number }> = new Map();
    private redis: Redis;
    private memoryTTL: number;
    private redisTTL: number;
    private cleanupInterval: NodeJS.Timeout;

    constructor(options: PublicKeyCacheOptions)
    {
        this.redis = options.redis;
        this.memoryTTL = options.memoryTTL ?? DEFAULT_MEMORY_CACHE_TTL;
        this.redisTTL = options.redisTTL ?? DEFAULT_REDIS_CACHE_TTL;

        this.cleanupInterval = setInterval(() => this.cleanExpired(), 60 * 1000);
    }

    /**
     * Get public key from cache (L1 → L2)
     *
     * @param keyId - Key ID
     * @returns Public key or null if not found
     */
    async get(keyId: string): Promise<string | null>
    {
        const memCached = this.memory.get(keyId);
        if (memCached && memCached.expiresAt > Date.now())
        {
            return memCached.publicKey;
        }

        const redisKey = `${REDIS_PREFIXES.PUBLIC_KEY}${keyId}`;
        const redisCached = await this.redis.get(redisKey);

        if (redisCached)
        {
            this.memory.set(keyId, {
                publicKey: redisCached,
                expiresAt: Date.now() + this.memoryTTL * 1000,
            });
            return redisCached;
        }

        return null;
    }

    /**
     * Set public key in cache (L1 + L2)
     *
     * @param keyId - Key ID
     * @param publicKey - Public key in DER format (base64 encoded)
     * @throws Error if public key format is invalid
     */
    async set(keyId: string, publicKey: string): Promise<void>
    {
        if (!isValidPublicKey(publicKey))
        {
            throw new Error('Invalid public key format');
        }

        this.memory.set(keyId, {
            publicKey,
            expiresAt: Date.now() + this.memoryTTL * 1000,
        });

        const redisKey = `${REDIS_PREFIXES.PUBLIC_KEY}${keyId}`;
        await this.redis.setex(redisKey, this.redisTTL, publicKey);
    }

    /**
     * Delete public key from cache (L1 + L2)
     *
     * @param keyId - Key ID
     */
    async delete(keyId: string): Promise<void>
    {
        this.memory.delete(keyId);

        const redisKey = `${REDIS_PREFIXES.PUBLIC_KEY}${keyId}`;
        await this.redis.del(redisKey);
    }

    /**
     * Clear all cache (L1 + L2)
     */
    async clear(): Promise<void>
    {
        this.memory.clear();

        const keys = await this.redis.keys(`${REDIS_PREFIXES.PUBLIC_KEY}*`);
        if (keys.length > 0)
        {
            await this.redis.del(...keys);
        }
    }

    /**
     * Get cache stats
     */
    getStats(): { memorySize: number; memoryKeys: string[] }
    {
        return {
            memorySize: this.memory.size,
            memoryKeys: Array.from(this.memory.keys()),
        };
    }

    /**
     * Clean expired entries from memory cache
     */
    private cleanExpired(): void
    {
        const now = Date.now();
        for (const [keyId, cached] of this.memory.entries())
        {
            if (cached.expiresAt <= now)
            {
                this.memory.delete(keyId);
            }
        }
    }

    /**
     * Destroy cache and cleanup resources
     */
    destroy(): void
    {
        clearInterval(this.cleanupInterval);
        this.memory.clear();
    }
}

/**
 * Nonce manager for replay attack prevention
 */
export class NonceManager
{
    private redis: Redis;
    private window: number;

    constructor(redis: Redis, window: number = 60)
    {
        this.redis = redis;
        this.window = window;
    }

    /**
     * Check if nonce exists (replay attack detection)
     *
     * @param nonce - Nonce to check
     * @returns True if nonce exists (replay attack)
     */
    async exists(nonce: string): Promise<boolean>
    {
        const key = `${REDIS_PREFIXES.NONCE}${nonce}`;
        const exists = await this.redis.exists(key);
        return exists === 1;
    }

    /**
     * Store nonce with TTL
     *
     * @param nonce - Nonce to store
     */
    async store(nonce: string): Promise<void>
    {
        const key = `${REDIS_PREFIXES.NONCE}${nonce}`;
        await this.redis.setex(key, this.window, '1');
    }

    /**
     * Check and store nonce atomically
     *
     * @param nonce - Nonce to check and store
     * @returns True if nonce is new (not a replay)
     */
    async checkAndStore(nonce: string): Promise<boolean>
    {
        const key = `${REDIS_PREFIXES.NONCE}${nonce}`;

        const result = await this.redis.set(key, '1', 'EX', this.window, 'NX');

        return result === 'OK';
    }
}