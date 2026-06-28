/**
 * @spfn/auth - Rate-limit key builders
 *
 * `by` functions for rateLimitPolicy that add an account/target dimension on top
 * of the client IP, so brute force and abuse are limited by the thing being
 * attacked — not only by source IP (which an attacker rotates).
 *
 * The body is read via `c.req.json()`, which Hono caches: reading it here does
 * not consume the stream, so the route handler's own validation still sees it.
 * The IP dimension is given its own (looser) limit so a shared NAT isn't
 * throttled as one user, while the per-account/target limit stays tight.
 */

import type { Context } from 'hono';
import { getClientIp, type RateLimitDimension } from '@spfn/core/middleware';

interface KeyOptions
{
    /** Limit for the per-IP dimension. Omit to use the policy's top-level limit. */
    ipLimit?: number;
}

async function readJsonBody(c: Context): Promise<Record<string, unknown>>
{
    try
    {
        return await c.req.json();
    }
    catch
    {
        return {};
    }
}

function accountKey(body: Record<string, unknown>): string | undefined
{
    if (typeof body.email === 'string' && body.email.trim())
    {
        return `email:${body.email.trim().toLowerCase()}`;
    }
    if (typeof body.phone === 'string' && body.phone.trim())
    {
        return `phone:${body.phone.trim()}`;
    }

    return undefined;
}

function targetKey(body: Record<string, unknown>): string | undefined
{
    if (typeof body.target !== 'string' || !body.target.trim())
    {
        return undefined;
    }

    const type = typeof body.targetType === 'string' ? body.targetType : 'target';
    const value = type === 'email' ? body.target.trim().toLowerCase() : body.target.trim();

    return `${type}:${value}`;
}

/**
 * Limit by client IP (loose) AND the account in the request body — `email` or
 * `phone` (tight, uses the policy limit). Use on login/register so a distributed
 * attacker can't brute-force one account by rotating IPs.
 */
export function byIpAndAccount(options: KeyOptions = {})
{
    return async (c: Context): Promise<(RateLimitDimension | undefined)[]> =>
    {
        const body = await readJsonBody(c);
        const account = accountKey(body);

        return [
            { key: `ip:${getClientIp(c)}`, limit: options.ipLimit },
            account ? `acct:${account}` : undefined,
        ];
    };
}

/**
 * Limit by client IP (loose) AND the verification target in the body —
 * `targetType:target` (tight, uses the policy limit). Use on code send/verify so
 * a victim's phone/email can't be flooded (SMS-bombing) or an OTP brute-forced
 * regardless of how many source IPs the attacker uses.
 */
export function byIpAndTarget(options: KeyOptions = {})
{
    return async (c: Context): Promise<(RateLimitDimension | undefined)[]> =>
    {
        const body = await readJsonBody(c);
        const target = targetKey(body);

        return [
            { key: `ip:${getClientIp(c)}`, limit: options.ipLimit },
            target ? `tgt:${target}` : undefined,
        ];
    };
}
