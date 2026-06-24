/**
 * Proxy-guard middleware
 *
 * Verifies that an inbound request came through a trusted Next.js RPC proxy
 * (HMAC signature) and/or from an allowed browser origin, then tags the request
 * with a `clientType`. Lets the backend reject direct-to-backend calls that
 * bypass the proxy.
 *
 * This does NOT replace user authentication (JWT) — it answers "what kind of
 * client is this?", not "who is the user?". It also cannot stop a client from
 * calling the proxy itself; that is the web's inherent limit (see
 * PROXY-BACKEND-AUTH-SPEC.md). Mobile clients call the backend directly and are
 * handled by a future attestation path, OR'd into this same check.
 *
 * @module middleware/proxy-guard
 */
import type { Context, MiddlewareHandler, Next } from 'hono';

import { env } from '@spfn/core/config';
import { logger } from '@spfn/core/logger';

import {
    verifyProxyRequest,
    parseProxyKey,
    parseProxyKeySet,
    PROXY_SIGNATURE_HEADER,
    PROXY_TIMESTAMP_HEADER,
    PROXY_NONCE_HEADER,
    PROXY_KEY_ID_HEADER,
    type VerifyFailureReason,
} from '../security/proxy-signature';

const guardLogger = logger.child('@spfn/core:proxy-guard');

// ============================================================================
// Types
// ============================================================================

/**
 * How the request reached the backend.
 * - `web`: verified via a trusted proxy signature
 * - `untrusted`: could not be verified (only reached handlers in `tag` mode)
 * - future: `ios` | `android` once attestation lands
 */
export type ClientType = 'web' | 'untrusted' | (string & {});

/**
 * Enforcement mode.
 * - `off`: middleware is a no-op (default — keeps existing apps working).
 * - `tag`: verify and set `clientType`, but never reject (observe first).
 * - `strict`: reject requests that fail verification.
 */
export type ProxyGuardMode = 'off' | 'tag' | 'strict';

/**
 * Optional replay store. Returns `true` when the nonce is fresh (and records it),
 * `false` when it has been seen before. Backed by Redis in multi-instance setups.
 */
export interface NonceStore
{
    checkAndSet(nonce: string, ttlMs: number): Promise<boolean>;
}

export interface ProxyGuardConfig
{
    /**
     * Active shared HMAC secret, as `<keyId>:<secret>` (or a bare secret).
     * Defaults to `env.SPFN_PROXY_SECRET`. Without it (and no previous keys),
     * signatures cannot be verified and every request is tagged `untrusted`.
     */
    secret?: string;

    /**
     * Previous (grace) keys still accepted for verification during rotation, as a
     * comma-separated list of `<keyId>:<secret>`. The proxy never signs with
     * these — they exist only so in-flight requests signed with the prior key
     * keep verifying until the rollout settles. Defaults to
     * `env.SPFN_PROXY_SECRET_PREVIOUS`. Backend-only, so it can live in
     * `.env.server` (never exposed to the Next.js process).
     */
    previousSecrets?: string;

    /** Enforcement mode. @default 'off' */
    mode?: ProxyGuardMode;

    /** Allowed clock skew / replay window in ms. @default 30000 */
    windowMs?: number;

    /**
     * Browser origin allowlist. When set, a request carrying an `Origin` header
     * not in this list is rejected (strict) / tagged (tag). Requests without an
     * `Origin` (server-to-server, mobile) skip this check and fall back to the
     * signature.
     */
    allowedOrigins?: string[];

    /** Optional Redis-backed nonce store for hard replay rejection. */
    nonceStore?: NonceStore;

    /** Paths to skip entirely (e.g. health checks). */
    skipPaths?: string[];
}

// ============================================================================
// Hono context augmentation
// ============================================================================

declare module 'hono'
{
    interface ContextVariableMap
    {
        clientType?: ClientType;
    }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Read the raw request body without consuming it for downstream handlers.
 * Bound for ANY non-multipart content-type (not just application/json) so the
 * backend hashes exactly what the proxy signed — otherwise the body could be
 * tampered by flipping content-type. Multipart uploads are excluded on both
 * sides (their large bodies are never hashed).
 */
async function readRawBody(c: Context): Promise<string | undefined>
{
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD')
    {
        return undefined;
    }

    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('multipart/form-data'))
    {
        return undefined;
    }

    try
    {
        return await c.req.raw.clone().text();
    }
    catch
    {
        return undefined;
    }
}

function isOriginAllowed(c: Context, allowedOrigins: string[] | undefined): boolean
{
    if (!allowedOrigins || allowedOrigins.length === 0)
    {
        return true;
    }

    const origin = c.req.header('origin');
    if (!origin)
    {
        // No browser Origin (server-to-server / mobile) — defer to signature.
        return true;
    }

    return allowedOrigins.includes(origin);
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Create the proxy-guard middleware.
 *
 * @example
 * ```typescript
 * export default defineServerConfig()
 *     .proxyGuard({ mode: 'strict', allowedOrigins: ['https://app.example.com'] })
 *     .routes(appRouter)
 *     .build();
 * ```
 */
export function createProxyGuard(config: ProxyGuardConfig = {}): MiddlewareHandler
{
    const mode = config.mode ?? 'off';
    const windowMs = config.windowMs ?? 30_000;
    const allowedOrigins = config.allowedOrigins;
    const nonceStore = config.nonceStore;
    const skipPaths = new Set(config.skipPaths ?? []);

    // Accepted key set: active secret first (wins on keyId collision), then grace keys.
    const activeRaw = config.secret ?? env.SPFN_PROXY_SECRET;
    const previousRaw = config.previousSecrets ?? env.SPFN_PROXY_SECRET_PREVIOUS;
    const keys = parseProxyKeySet([activeRaw, previousRaw]);

    // Fail CLOSED on misconfiguration: strict with no key would otherwise let every
    // request (including direct-to-backend) through. Refuse to start instead.
    if (mode === 'strict' && keys.length === 0)
    {
        throw new Error(
            '[proxy-guard] mode "strict" requires a proxy key but none is configured '
            + '(SPFN_PROXY_SECRET is empty/unset). Refusing to start with the guard open — '
            + 'set the secret, or use mode "tag" / "off".',
        );
    }

    // Warn when rotation can't work: bare secrets (no "keyId:" prefix) on both active
    // and previous collapse to the same keyId, so the grace key is silently dropped.
    if (activeRaw && previousRaw)
    {
        const activeId = parseProxyKey(activeRaw).keyId;
        const collides = previousRaw.split(',').some(p => p.trim() && parseProxyKey(p.trim()).keyId === activeId);
        if (collides)
        {
            guardLogger.warn(
                'Previous proxy key shares keyId with the active key (likely bare secrets without a '
                + '"keyId:" prefix) — grace key ignored, rotation will drop in-flight requests. '
                + 'Use "<keyId>:<secret>" on both keys.',
                { keyId: activeId },
            );
        }
    }

    return async (c: Context, next: Next) =>
    {
        // OPTIONS (CORS preflight) carries no signature and is non-mutating — never block it.
        if (mode === 'off' || c.req.method === 'OPTIONS' || skipPaths.has(c.req.path))
        {
            return next();
        }

        // 1. Origin allowlist (browser cross-origin guard)
        if (!isOriginAllowed(c, allowedOrigins))
        {
            return reject(c, mode, next, 'origin-not-allowed');
        }

        // 2. No accepted key — only reachable in tag mode (strict throws at construction).
        if (keys.length === 0)
        {
            c.set('clientType', 'untrusted');

            return next();
        }

        // 3. HMAC over the wire request-target (raw path + query) and body. Use the raw
        //    URL, NOT the decoded c.req.path, so it matches the bytes the proxy signed.
        const url = new URL(c.req.url);
        const body = await readRawBody(c);
        const result = verifyProxyRequest({
            keys,
            method: c.req.method,
            path: url.pathname,
            query: url.search,
            body,
            signature: c.req.header(PROXY_SIGNATURE_HEADER),
            timestamp: c.req.header(PROXY_TIMESTAMP_HEADER),
            nonce: c.req.header(PROXY_NONCE_HEADER),
            keyId: c.req.header(PROXY_KEY_ID_HEADER),
            windowMs,
        });

        if (!result.valid)
        {
            return reject(c, mode, next, result.reason);
        }

        // 4. Optional hard replay rejection via nonce store
        if (nonceStore && result.nonce)
        {
            const fresh = await nonceStore.checkAndSet(result.nonce, windowMs * 2);
            if (!fresh)
            {
                return reject(c, mode, next, 'nonce-replay');
            }
        }

        c.set('clientType', 'web');

        return next();
    };
}

// ============================================================================
// Redis-backed nonce store (optional)
// ============================================================================

/** Minimal cache client (compatible with ioredis Redis | Cluster). */
type CacheClient = {
    set(key: string, value: string, ...args: any[]): Promise<any>;
};

/**
 * Build a Redis-backed nonce store for hard replay rejection.
 *
 * Uses `SET key 1 PX ttl NX` — an atomic "set if absent". A fresh nonce returns
 * 'OK'; a replayed one returns null. TTL keeps the key set bounded (only nonces
 * within the replay window matter).
 */
export function createCacheNonceStore(cache: CacheClient, prefix = 'spfn:proxy-nonce:'): NonceStore
{
    return {
        async checkAndSet(nonce: string, ttlMs: number): Promise<boolean>
        {
            const res = await cache.set(`${prefix}${nonce}`, '1', 'PX', Math.ceil(ttlMs), 'NX');

            return res === 'OK';
        },
    };
}

/**
 * Reject (strict) or tag-and-continue (tag). Keeps the rejection response generic
 * so it leaks no detail about why verification failed.
 */
function reject(
    c: Context,
    mode: ProxyGuardMode,
    next: Next,
    reason: VerifyFailureReason | 'origin-not-allowed' | 'nonce-replay' | undefined,
)
{
    if (mode === 'strict')
    {
        guardLogger.warn('Rejected unverified request', { reason, path: c.req.path, method: c.req.method });

        return c.json({ error: 'Forbidden', message: 'Request origin could not be verified' }, 403);
    }

    // tag mode — observe only, never block
    guardLogger.debug('Unverified request (would reject in strict mode)', { reason, path: c.req.path });
    c.set('clientType', 'untrusted');

    return next();
}
