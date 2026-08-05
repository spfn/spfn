/**
 * SSE Token Manager
 *
 * Auth-agnostic token issuance and verification for SSE connections.
 * Issues one-time-use tokens with TTL for Token Exchange pattern.
 *
 * @example
 * ```typescript
 * const manager = new SSETokenManager({ ttl: 30000 });
 *
 * // Issue token for authenticated user
 * const token = await manager.issue('user-123');
 *
 * // Verify and consume token (one-time use)
 * const subject = await manager.verify(token); // 'user-123'
 * const again = await manager.verify(token);   // null (already consumed)
 *
 * // Cleanup on shutdown
 * manager.destroy();
 * ```
 */

import { randomBytes, createHash } from 'crypto';

/**
 * Hash a token for storage. The raw token is a bearer secret — storing it at rest
 * (e.g. as a Redis key/value) means a store dump hands out live tokens. We persist
 * only sha256(token) and look up by the same hash; the raw token exists only in
 * transit and in the issue() return value.
 */
function hashToken(token: string): string
{
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Minimal cache client interface (compatible with ioredis Redis | Cluster)
 */
type CacheClient = {
    set(key: string, value: string, ...args: any[]): Promise<any>;
    getdel?(key: string): Promise<string | null>;
    get(key: string): Promise<string | null>;
    del(...keys: string[]): Promise<number>;
};

// ============================================================================
// Types
// ============================================================================

/**
 * Stored SSE token data
 */
export interface SSEToken
{
    subject: string;
    expiresAt: number;
}

/**
 * Token storage interface
 *
 * Implement this for custom storage backends (e.g., Redis for multi-instance).
 */
export interface SSETokenStore
{
    /** Store a token */
    set(token: string, data: SSEToken): Promise<void>;

    /** Get and delete a token (one-time use) */
    consume(token: string): Promise<SSEToken | null>;

    /** Remove expired tokens */
    cleanup(): Promise<void>;
}

/**
 * SSETokenManager configuration
 */
export interface SSETokenManagerConfig
{
    /**
     * Token time-to-live in milliseconds
     * @default 30000
     */
    ttl?: number;

    /**
     * Custom token store (default: in-memory Map)
     */
    store?: SSETokenStore;

    /**
     * Cleanup interval in milliseconds
     * @default 60000
     */
    cleanupInterval?: number;
}

// ============================================================================
// InMemoryTokenStore
// ============================================================================

class InMemoryTokenStore implements SSETokenStore
{
    private tokens = new Map<string, SSEToken>();

    async set(token: string, data: SSEToken): Promise<void>
    {
        this.tokens.set(hashToken(token), data);
    }

    async consume(token: string): Promise<SSEToken | null>
    {
        const key = hashToken(token);
        const data = this.tokens.get(key);
        if (!data)
        {
            return null;
        }

        this.tokens.delete(key);

        return data;
    }

    async cleanup(): Promise<void>
    {
        const now = Date.now();

        for (const [key, data] of this.tokens)
        {
            if (data.expiresAt <= now)
            {
                this.tokens.delete(key);
            }
        }
    }
}

// ============================================================================
// CacheTokenStore (Redis/Valkey)
// ============================================================================

/**
 * Redis/Valkey-backed token store for multi-instance deployments.
 *
 * Uses SET EX for automatic TTL expiry and GETDEL for atomic one-time consumption.
 * No cleanup needed — Redis handles expiration automatically.
 *
 * @example
 * ```typescript
 * import { getCache } from '@spfn/core/cache';
 *
 * const cache = getCache();
 * if (cache) {
 *     const store = new CacheTokenStore(cache);
 *     const manager = new SSETokenManager({ store });
 * }
 * ```
 */
export class CacheTokenStore implements SSETokenStore
{
    private prefix = 'sse:token:';

    constructor(private cache: CacheClient) 
    {}

    async set(token: string, data: SSEToken): Promise<void>
    {
        const ttlSeconds = Math.max(1, Math.ceil((data.expiresAt - Date.now()) / 1000));
        await this.cache.set(
            this.prefix + hashToken(token),
            JSON.stringify(data),
            'EX',
            ttlSeconds,
        );
    }

    async consume(token: string): Promise<SSEToken | null>
    {
        const key = this.prefix + hashToken(token);

        // GETDEL (Redis 6.2+) for atomic consume, fallback to GET+DEL
        let raw: string | null = null;

        if (this.cache.getdel)
        {
            raw = await this.cache.getdel(key);
        }
        else
        {
            raw = await this.cache.get(key);
            if (raw)
            {
                await this.cache.del(key);
            }
        }

        if (!raw)
        {
            return null;
        }

        return JSON.parse(raw) as SSEToken;
    }

    async cleanup(): Promise<void>
    {
        // No-op: Redis TTL handles expiration automatically
    }
}

// ============================================================================
// SSETokenManager
// ============================================================================

export class SSETokenManager
{
    private store: SSETokenStore;
    private ttl: number;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(config?: SSETokenManagerConfig)
    {
        this.ttl = config?.ttl ?? 30000;
        this.store = config?.store ?? new InMemoryTokenStore();

        const cleanupInterval = config?.cleanupInterval ?? 60000;
        this.cleanupTimer = setInterval(() => void this.store.cleanup(), cleanupInterval);
        this.cleanupTimer.unref();
    }

    /**
     * How long an issued token stays valid, in milliseconds.
     *
     * Exposed so a caller that has to report an expiry to its client computes the same
     * number this manager stamps on the token, instead of assuming the default.
     */
    get ttlMs(): number
    {
        return this.ttl;
    }

    /**
     * Issue a new one-time-use token for the given subject
     */
    async issue(subject: string): Promise<string>
    {
        const token = randomBytes(32).toString('hex');

        // The store keys by sha256(token); the raw token is never persisted.
        await this.store.set(token, {
            subject,
            expiresAt: Date.now() + this.ttl,
        });

        return token;
    }

    /**
     * Verify and consume a token
     * @returns subject string if valid, null if invalid/expired/already consumed
     */
    async verify(token: string): Promise<string | null>
    {
        const data = await this.store.consume(token);

        if (!data || data.expiresAt <= Date.now())
        {
            return null;
        }

        return data.subject;
    }

    /**
     * Cleanup timer and resources
     */
    destroy(): void
    {
        if (this.cleanupTimer)
        {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }
}
