/**
 * @spfn/core - Rate limit middleware
 *
 * Redis-backed fixed-window rate limiter, registered under the named
 * 'rateLimit' middleware so routes can opt out with `.skip(['rateLimit'])`.
 *
 * Storage is the shared cache (ioredis). The counter is incremented and given
 * its window expiry in a single atomic Lua call, so concurrent requests cannot
 * race between INCR and PEXPIRE. When no cache is configured the limiter fails
 * OPEN by default (logs a warning) — matching the proxy-guard nonce store's
 * graceful degradation — so development without Redis still works. Set
 * `failClosed` to reject instead.
 */

import type { Context, MiddlewareHandler } from 'hono';
import { PROXY_CLIENT_IP_HEADER } from '../security/proxy-signature';
import { defineMiddlewareFactory } from '../route/define-middleware';
import { getCache, isCacheDisabled } from '../cache';
import { TooManyRequestsError } from '../errors';
import { logger } from '../logger';

const rateLimitLogger = logger.child('@spfn/core:rate-limit');

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

export interface RateLimitOptions
{
    /** Max requests allowed per window, applied to each identity dimension. */
    limit: number;

    /** Window length in milliseconds. */
    windowMs: number;

    /**
     * Namespace for the counter keys. Defaults to `${method} ${routePath}` so
     * each route is limited independently.
     */
    scope?: string;

    /**
     * Identity dimensions to limit on. Each non-empty value is counted
     * separately and the strictest wins (e.g. by IP and by account). Defaults
     * to the client IP only.
     */
    by?: (c: Context) => (string | null | undefined)[] | Promise<(string | null | undefined)[]>;

    /** Reject with 429 instead of allowing through when the cache is unavailable. */
    failClosed?: boolean;

    /** Message for the 429 response. */
    message?: string;
}

/**
 * Best-effort client IP for rate-limit keying.
 *
 * Prefers the proxy-forwarded real client IP, but ONLY when proxy-guard verified
 * the request came through our proxy (`clientType` set and not 'untrusted') — on a
 * verified request the proxy is the sole hop, so the value is the true client and
 * isn't client-spoofable. Otherwise (no proxy-guard, or unverified/direct request)
 * the forwarded header is attacker-settable, so fall back to the raw chain — whose
 * leftmost hop is itself spoofable, so still pair with an account/target dimension
 * for anything security-sensitive.
 */
export function getClientIp(c: Context): string
{
    const clientType = c.get('clientType');
    if (clientType && clientType !== 'untrusted')
    {
        const forwarded = c.req.header(PROXY_CLIENT_IP_HEADER);
        if (forwarded)
        {
            return forwarded;
        }
    }

    const forwardedFor = c.req.header('x-forwarded-for');

    return forwardedFor?.split(',')[0]?.trim()
        || c.req.header('x-real-ip')
        || 'unknown';
}

/**
 * Redis-backed fixed-window rate limiter.
 *
 * @example
 * ```typescript
 * route.post('/_auth/login')
 *     .use([rateLimit({ limit: 10, windowMs: 60_000 })])
 *     .handler(...);
 * ```
 */
export const rateLimit = defineMiddlewareFactory(
    'rateLimit',
    (options: RateLimitOptions): MiddlewareHandler =>
    {
        const { limit, windowMs, scope, by, failClosed = false, message } = options;

        return async (c, next) =>
        {
            const cache = getCache();

            if (!cache || isCacheDisabled())
            {
                if (failClosed)
                {
                    throw new TooManyRequestsError({ message: message || 'Rate limiter unavailable' });
                }

                rateLimitLogger.warn('Cache unavailable — rate limit not enforced (fail-open)', {
                    path: c.req.path,
                });

                return next();
            }

            const dimensions = (by ? await by(c) : [getClientIp(c)])
                .filter((d): d is string => Boolean(d));

            const ns = scope || `${c.req.method} ${c.req.routePath || c.req.path}`;

            for (const dimension of dimensions)
            {
                const [count, pttl] = await cache.eval(
                    FIXED_WINDOW_LUA,
                    1,
                    `ratelimit:${ns}:${dimension}`,
                    String(windowMs),
                ) as [number, number];

                if (count > limit)
                {
                    const retryAfter = Math.max(1, Math.ceil((pttl > 0 ? pttl : windowMs) / 1000));
                    c.header('Retry-After', String(retryAfter));

                    throw new TooManyRequestsError({
                        message: message || 'Too many requests, please try again later',
                        retryAfter,
                    });
                }
            }

            return next();
        };
    },
);
