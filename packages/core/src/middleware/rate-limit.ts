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
import { defineMiddleware, defineMiddlewareFactory } from '../route/define-middleware';
import type { NamedMiddleware } from '../route/define-middleware';
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

/**
 * One identity dimension to limit on. A bare string uses the top-level `limit`;
 * an object can carry its own `limit` so dimensions can differ (e.g. a loose
 * per-IP cap alongside a tight per-account cap).
 */
export type RateLimitDimension = string | { key: string; limit?: number };

export interface RateLimitOptions
{
    /** Max requests allowed per window, applied to each dimension without its own `limit`. */
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
     * separately and the strictest wins (e.g. by IP and by account). A dimension
     * may override the top-level `limit` via `{ key, limit }`. Defaults to the
     * client IP only.
     */
    by?: (c: Context) => (RateLimitDimension | null | undefined)[] | Promise<(RateLimitDimension | null | undefined)[]>;

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
 *
 * Last resort before giving up is the TCP peer address from the Node adapter
 * socket. Without it, a deployment that sets no forwarding header would collapse
 * every client onto a single `'unknown'` bucket.
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
        || socketRemoteAddress(c)
        || 'unknown';
}

/**
 * TCP peer address from the @hono/node-server adapter, when present. Mirrors the
 * adapter's own getConnInfo access path and degrades to undefined on other
 * runtimes (Bun/edge) so callers fall through to 'unknown'.
 */
function socketRemoteAddress(c: Context): string | undefined
{
    const env = c.env as {
        server?: { incoming?: { socket?: { remoteAddress?: string } } };
        incoming?: { socket?: { remoteAddress?: string } };
    } | undefined;
    const bindings = env?.server ?? env;

    return bindings?.incoming?.socket?.remoteAddress;
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
                .filter((d): d is RateLimitDimension => Boolean(d));

            const ns = scope || `${c.req.method} ${c.req.routePath || c.req.path}`;

            for (const dimension of dimensions)
            {
                const key = typeof dimension === 'string' ? dimension : dimension.key;
                if (!key)
                {
                    continue;
                }

                const dimLimit = typeof dimension === 'string' ? limit : (dimension.limit ?? limit);

                const [count, pttl] = await cache.eval(
                    FIXED_WINDOW_LUA,
                    1,
                    `ratelimit:${ns}:${key}`,
                    String(windowMs),
                ) as [number, number];

                if (count > dimLimit)
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

/**
 * Named rate-limit policies, populated once at boot from
 * `defineServerConfig().rateLimit({ policies })`. A package tags a route with
 * rateLimitPolicy() and the consuming app supplies the numbers here, so policy
 * tuning lives in one place rather than being hard-coded in each package.
 */
const policyRegistry = new Map<string, RateLimitOptions>();

/**
 * App-wide fail-closed default applied to policy tags that don't set `failClosed`
 * themselves. Set at boot from RATE_LIMIT_FAIL_CLOSED so operators can make ALL
 * limiters (including named policies on auth routes) reject on cache outage — the
 * env flag would otherwise only reach the global default limiter.
 */
let policyFailClosedDefault = false;

/** Set the fail-closed default for named policies. Called by the server at boot. */
export function setRateLimitFailClosedDefault(failClosed: boolean): void
{
    policyFailClosedDefault = failClosed;
}

/**
 * Replace the named-policy registry. Called by the server at boot; passing
 * undefined clears it (so a restart without policies doesn't keep stale ones).
 */
export function setRateLimitPolicies(policies?: Record<string, RateLimitOptions>): void
{
    policyRegistry.clear();

    if (!policies)
    {
        return;
    }

    for (const [name, options] of Object.entries(policies))
    {
        policyRegistry.set(name, options);
    }
}

/** Look up a configured policy by name — undefined when the app didn't set it. */
export function getRateLimitPolicy(name: string): RateLimitOptions | undefined
{
    return policyRegistry.get(name);
}

/**
 * Rate-limit a route under a named policy.
 *
 * A package author tags a sensitive route with a policy name plus a safe
 * fallback; the consuming app tunes the numbers centrally via
 * `defineServerConfig().rateLimit({ policies: { [name]: {...} } })`. When the
 * app configures the policy, its fields override the fallback (shallow merge);
 * otherwise the fallback applies, so the route is protected out of the box.
 *
 * LAYERS on top of the global default limiter rather than replacing it: the tag
 * has a distinct name (`rateLimit:<name>`) and does not skip the global, so a
 * route gets both the global per-IP floor (when enabled) and this policy's own
 * bucket — whichever is stricter trips first. Opt out of the global floor on a
 * route with `.skip(['rateLimit'])`.
 *
 * The counter scope defaults to the policy name, so (a) every route sharing a
 * policy shares one bucket, and (b) the key never collides with the global
 * default's per-route `${method} ${path}` scope.
 *
 * @example
 * ```typescript
 * route.post('/_auth/login')
 *     .use([rateLimitPolicy('auth-login', { limit: 5, windowMs: 60_000 })])
 *     .handler(...);
 * ```
 */
export function rateLimitPolicy(name: string, fallback: RateLimitOptions): NamedMiddleware<string>
{
    // Resolution is deferred to the first request: the registry is populated at
    // server boot, which runs after route modules are imported. Cached after the
    // first hit since the registry is static once the server is up.
    let resolved: MiddlewareHandler | undefined;

    const handler: MiddlewareHandler = (c, next) =>
    {
        if (!resolved)
        {
            const configured = getRateLimitPolicy(name);
            const merged: RateLimitOptions = configured ? { ...fallback, ...configured } : { ...fallback };

            if (merged.scope === undefined)
            {
                merged.scope = name;
            }

            if (merged.failClosed === undefined)
            {
                merged.failClosed = policyFailClosedDefault;
            }

            resolved = rateLimit(merged);
        }

        return resolved(c, next);
    };

    return defineMiddleware(`rateLimit:${name}`, handler);
}
