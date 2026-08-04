/**
 * The rate limiter's fixed-window counter as a pluggable store — the same
 * pattern the clientProofV1 replay ledger and the SSE token manager already
 * use: an in-memory default, a Redis/Valkey store on top of `getCache()`, and
 * the cache's presence deciding which one a request gets.
 *
 * Why the memory default exists: without it, "no cache configured" and "cache
 * down" both meant the limiter had nowhere to count, so the only choices were
 * letting every request through or refusing every request. Neither is what a
 * limiter is for. Counting in the process is worse than counting in Redis and
 * far better than not counting.
 *
 * What the memory store cannot do is span processes. Behind N instances each
 * keeps its own counters, so the effective limit is N times the configured one.
 * That is the cost of the fallback and the reason a real deployment still
 * points `CACHE_URL` at Redis.
 *
 * @module middleware/rate-limit-store
 */
import type { Redis, Cluster } from 'ioredis';

/** One window's state for a key: how many hits, and how long the window has left. */
export interface RateLimitHit
{
    count: number;
    /** Milliseconds until the window resets. */
    pttl: number;
}

/** What the limiter needs from wherever the counters live. */
export interface RateLimitStore
{
    /** Records one hit against `key` and answers the window's state after it. */
    hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

/**
 * Atomic fixed-window counter: increment, set the window expiry on the first
 * hit, and return [count, pttlMs]. Keeping incr+expire in one round trip avoids
 * a leaked key that never expires when a process dies between the two calls.
 */
const FIXED_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return { count, redis.call('PTTL', KEYS[1]) }
`;

/**
 * Counters in Redis — shared by every instance, so the configured limit is the
 * limit no matter how many processes serve the traffic.
 */
export class CacheRateLimitStore implements RateLimitStore
{
    constructor(private readonly cache: Redis | Cluster)
    {}

    async hit(key: string, windowMs: number): Promise<RateLimitHit>
    {
        const [count, pttl] = await this.cache.eval(
            FIXED_WINDOW_LUA,
            1,
            key,
            String(windowMs),
        ) as [number, number];

        return { count, pttl };
    }
}

/**
 * Counters in this process.
 *
 * Entries are pruned lazily — a key past its window resets on its next hit, so
 * the common path stays O(1). Keys nobody touches again would otherwise sit
 * there forever, so a full sweep runs once the map crosses `maxKeys`; that
 * bound is what keeps a limiter keyed by client IP from growing without end.
 */
export class MemoryRateLimitStore implements RateLimitStore
{
    private readonly windows = new Map<string, { count: number; expiresAt: number }>();

    /** How many live windows were dropped to stay under `maxKeys`. */
    private evicted = 0;

    constructor(private readonly maxKeys: number = 10_000)
    {}

    async hit(key: string, windowMs: number): Promise<RateLimitHit>
    {
        const now = Date.now();
        const existing = this.windows.get(key);

        if (existing !== undefined && existing.expiresAt > now)
        {
            existing.count += 1;

            return { count: existing.count, pttl: existing.expiresAt - now };
        }

        if (this.windows.size >= this.maxKeys)
        {
            this.makeRoom(now);
        }

        this.windows.set(key, { count: 1, expiresAt: now + windowMs });

        return { count: 1, pttl: windowMs };
    }

    /** Drops every window that has already reset. */
    prune(nowMillis: number): void
    {
        for (const [key, window] of this.windows)
        {
            if (window.expiresAt <= nowMillis)
            {
                this.windows.delete(key);
            }
        }
    }

    /**
     * Frees a slot for a new key.
     *
     * Expired windows go first. If every window is still live the oldest one is
     * dropped, because a hard bound is the only thing standing between a
     * per-IP limiter and unbounded memory. A dropped window loses its count,
     * so a caller who can mint `maxKeys` distinct identities can push another
     * one out — which is why `evictionCount` is worth watching: it says this
     * process is past what an in-memory limiter should be asked to hold, and
     * the deployment wants a real cache.
     */
    private makeRoom(nowMillis: number): void
    {
        this.prune(nowMillis);

        if (this.windows.size < this.maxKeys)
        {
            return;
        }

        // Map iterates in insertion order, so the first entry is the oldest window.
        const oldest = this.windows.keys().next();
        if (!oldest.done)
        {
            this.windows.delete(oldest.value);
            this.evicted += 1;
        }
    }

    get size(): number
    {
        return this.windows.size;
    }

    /** Live windows dropped for capacity — nonzero means the bound is binding. */
    get evictionCount(): number
    {
        return this.evicted;
    }

    clear(): void
    {
        this.windows.clear();
        this.evicted = 0;
    }
}
