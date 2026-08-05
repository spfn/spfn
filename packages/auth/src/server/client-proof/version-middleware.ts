/**
 * The version announcement, applied to every request rather than to the proven
 * ones.
 *
 * Enrollment and login are the first calls a client makes and they carry no
 * proof — there is no key to sign with yet. A check that lives inside proof
 * admission therefore never sees the client it is meant to catch: an outdated
 * app fails at login, before it reaches anything proven. This runs ahead of all
 * of it.
 *
 * hono is imported as types only, so this module adds no runtime dependency.
 *
 * @module server/client-proof/version-middleware
 */
import type { Context, MiddlewareHandler, Next } from 'hono';

import { newHexId } from './refusal';
import { applyServerContractHeaders, judgeClientIdentity, readClientIdentity, type ClientIdentity } from './wire-version';

/** The context key the identity is left under, for a handler that wants it. */
export const CLIENT_IDENTITY_CONTEXT_KEY = 'clientIdentity';

/**
 * Announces the server's contract version on every response and refuses a
 * client whose own contract version this server does not serve.
 *
 * The announcement goes out either way. A refused client needs it most — the
 * refusal says the two ends disagree, and the range is what says how.
 *
 * Mount this before authentication, not after: the point is to answer a stale
 * client before anything else has a chance to fail confusingly.
 */
export function createClientVersionMiddleware(): MiddlewareHandler
{
    return async (c: Context, next: Next) =>
    {
        const identity = readClientIdentity(c.req.raw.headers);
        const refusal = judgeClientIdentity(identity);
        if (refusal !== null)
        {
            const bytes = refusal.envelopeBytes(newHexId());
            const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
            const response = c.newResponse(buffer, refusal.httpStatus as 409, {
                'content-type': 'application/json',
            });
            applyServerContractHeaders(response.headers);

            return response;
        }
        if (identity !== null)
        {
            c.set(CLIENT_IDENTITY_CONTEXT_KEY, identity satisfies ClientIdentity);
        }
        await next();
        applyServerContractHeaders(c.res.headers);

        return undefined;
    };
}
