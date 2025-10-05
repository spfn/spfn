/**
 * 2-3 Tier caching system for public keys
 * L1: Memory cache (fastest, ~0.001ms)
 * L2: Redis cache (optional, fast, ~1ms)
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
    /** Redis client instance (optional) */
    redis?: Redis;

    /** Memory cache TTL in seconds */
    memoryTTL?: number;

    /** Redis cache TTL in seconds */
    redisTTL?: number;

    /** Max memory cache size (default: 1000) */
    maxMemorySize?: number;
}

/**
 * 2-3 Tier public key cache (Redis optional)
 */
export class PublicKeyCache
{
    private memory: Map<string, { publicKey: string; expiresAt: number }> = new Map();
    private redis?: Redis;
    private memoryTTL: number;
    private redisTTL: number;
    private maxMemorySize: number;
    private cleanupInterval: NodeJS.Timeout;
    private warnedAboutRedis = false;

    constructor(options: PublicKeyCacheOptions)
    {
        this.redis = options.redis;
        this.memoryTTL = options.memoryTTL ?? DEFAULT_MEMORY_CACHE_TTL;
        this.redisTTL = options.redisTTL ?? DEFAULT_REDIS_CACHE_TTL;
        this.maxMemorySize = options.maxMemorySize ?? 1000;

        // Show warning once if Redis is not provided in production
        if (!this.redis && process.env.NODE_ENV === 'production' && !this.warnedAboutRedis)
        {
            console.warn('⚠️  @spfn/auth: Using memory-only cache in production. Set REDIS_URL for better performance and distributed caching.');
            this.warnedAboutRedis = true;
        }

        this.cleanupInterval = setInterval(() => this.cleanExpired(), 60 * 1000);
    }

    /**
     * Get public key from cache (L1 → L2 if Redis available)
     *
     * @param keyId - Key ID
     * @returns Public key or null if not found
     */
    async get(keyId: string): Promise<string | null>
    {
        // L1: Check memory cache
        const memCached = this.memory.get(keyId);
        if (memCached && memCached.expiresAt > Date.now())
        {
            return memCached.publicKey;
        }

        // L2: Check Redis if available
        if (this.redis)
        {
            const redisKey = `${REDIS_PREFIXES.PUBLIC_KEY}${keyId}`;
            const redisCached = await this.redis.get(redisKey);

            if (redisCached)
            {
                this.setMemoryCache(keyId, redisCached);
                return redisCached;
            }
        }

        return null;
    }

    /**
     * Set public key in cache (L1 + L2 if Redis available)
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

        this.setMemoryCache(keyId, publicKey);

        if (this.redis)
        {
            const redisKey = `${REDIS_PREFIXES.PUBLIC_KEY}${keyId}`;
            await this.redis.setex(redisKey, this.redisTTL, publicKey);
        }
    }

    /**
     * Delete public key from cache (L1 + L2 if Redis available)
     *
     * @param keyId - Key ID
     */
    async delete(keyId: string): Promise<void>
    {
        this.memory.delete(keyId);

        if (this.redis)
        {
            const redisKey = `${REDIS_PREFIXES.PUBLIC_KEY}${keyId}`;
            await this.redis.del(redisKey);
        }
    }

    /**
     * Clear all cache (L1 + L2 if Redis available)
     */
    async clear(): Promise<void>
    {
        this.memory.clear();

        if (this.redis)
        {
            const keys = await this.redis.keys(`${REDIS_PREFIXES.PUBLIC_KEY}*`);
            if (keys.length > 0)
            {
                await this.redis.del(...keys);
            }
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
     * Set public key in memory cache with LRU eviction
     */
    private setMemoryCache(keyId: string, publicKey: string): void
    {
        // LRU eviction if max size reached
        if (this.memory.size >= this.maxMemorySize)
        {
            const firstKey = this.memory.keys().next().value;
            if (firstKey)
            {
                this.memory.delete(firstKey);
            }
        }

        this.memory.set(keyId, {
            publicKey,
            expiresAt: Date.now() + this.memoryTTL * 1000,
        });
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
 * Nonce manager for replay attack prevention (Redis optional)
 */
export class NonceManager
{
    private redis?: Redis;
    private window: number;
    private memoryNonces: Map<string, number> = new Map();
    private maxMemorySize: number;
    private warnedAboutRedis = false;

    constructor(redis?: Redis, window: number = 60, maxMemorySize: number = 10000)
    {
        this.redis = redis;
        this.window = window;
        this.maxMemorySize = maxMemorySize;

        // Show warning once if Redis is not provided in production
        if (!this.redis && process.env.NODE_ENV === 'production' && !this.warnedAboutRedis)
        {
            console.warn('⚠️  @spfn/auth: Using memory-only nonce storage. This may allow replay attacks in multi-instance deployments. Set REDIS_URL for distributed nonce tracking.');
            this.warnedAboutRedis = true;
        }
    }

    /**
     * Check if nonce exists (replay attack detection)
     *
     * @param nonce - Nonce to check
     * @returns True if nonce exists (replay attack)
     */
    async exists(nonce: string): Promise<boolean>
    {
        if (this.redis)
        {
            const key = `${REDIS_PREFIXES.NONCE}${nonce}`;
            const exists = await this.redis.exists(key);
            return exists === 1;
        }

        // Memory fallback
        const expiresAt = this.memoryNonces.get(nonce);
        return expiresAt !== undefined && expiresAt > Date.now();
    }

    /**
     * Store nonce with TTL
     *
     * @param nonce - Nonce to store
     */
    async store(nonce: string): Promise<void>
    {
        if (this.redis)
        {
            const key = `${REDIS_PREFIXES.NONCE}${nonce}`;
            await this.redis.setex(key, this.window, '1');
        }
        else
        {
            // Memory fallback with LRU eviction
            if (this.memoryNonces.size >= this.maxMemorySize)
            {
                const firstKey = this.memoryNonces.keys().next().value;
                if (firstKey)
                {
                    this.memoryNonces.delete(firstKey);
                }
            }

            this.memoryNonces.set(nonce, Date.now() + this.window * 1000);
        }
    }

    /**
     * Check and store nonce atomically
     *
     * @param nonce - Nonce to check and store
     * @returns True if nonce is new (not a replay)
     */
    async checkAndStore(nonce: string): Promise<boolean>
    {
        if (this.redis)
        {
            const key = `${REDIS_PREFIXES.NONCE}${nonce}`;
            const result = await this.redis.set(key, '1', 'EX', this.window, 'NX');
            return result === 'OK';
        }

        // Memory fallback (not atomic, but sufficient for single instance)
        const exists = await this.exists(nonce);
        if (exists)
        {
            return false;
        }

        await this.store(nonce);
        return true;
    }
}