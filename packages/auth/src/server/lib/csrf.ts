/**
 * @spfn/auth - CSRF token derivation
 *
 * The token is an HMAC of the session's key id under a subkey derived from the
 * session secret. Two properties follow from that shape:
 *
 * - The proxy recomputes it from the session it just unsealed, so a value an
 *   attacker planted in the readable cookie (sibling-subdomain cookie tossing)
 *   never verifies. Nothing here compares a cookie against a header.
 * - It is bound to the key id, so rotating the session key invalidates it.
 *
 * No new secret: the subkey is a labelled HMAC of SPFN_AUTH_SESSION_SECRET, so
 * the key that encrypts sessions is never used verbatim as the token key.
 */

import { env } from '@spfn/auth/config';

/** Header the readable CSRF cookie is mirrored into by the client. */
export const CSRF_HEADER = 'x-spfn-csrf';

/** Domain-separation label for the CSRF subkey. */
const CSRF_SUBKEY_LABEL = 'spfn-auth-csrf-token-v1';

/**
 * Upper bound on candidate values accepted in one header.
 *
 * Deliberately generous, and must stay in step with MAX_CANDIDATES in
 * @spfn/core's client: verification recomputes the expected value once and then
 * only compares fixed-length strings, so an extra candidate costs a few hundred
 * nanoseconds, while a candidate dropped below this line is a user locked out of
 * every mutation. A low cap is not a security control either — accepting a match
 * among many is no weaker than accepting one, because every candidate still has
 * to equal a value recomputed from the session.
 */
const MAX_CANDIDATES = 32;

/**
 * Resolve the session secret, refusing to derive anything without one.
 *
 * `env` throws on a missing required variable, but returns undefined when
 * SKIP_ENV_VALIDATION is set — and hashing `undefined` would yield a token every
 * deployment could compute. Fail closed instead.
 */
function sessionSecret(): string
{
    const secret = env.SPFN_AUTH_SESSION_SECRET;

    if (!secret)
    {
        throw new Error(
            'SPFN_AUTH_SESSION_SECRET is required for CSRF protection. '
            + 'Set it (sessions need it anyway), or set SPFN_AUTH_CSRF=off.',
        );
    }

    return secret;
}

/**
 * HMAC-SHA256 over Web Crypto, so this works in the Edge runtime too.
 */
async function hmacSha256(key: Uint8Array, message: string): Promise<Uint8Array>
{
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key.buffer as ArrayBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));

    return new Uint8Array(signature);
}

function toHex(bytes: Uint8Array): string
{
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Derive the CSRF token for a session key id.
 *
 * @param keyId - Session key id (`SessionData.keyId`)
 * @returns 64-char hex token — safe to put in a readable cookie, it reveals
 *          neither the secret nor the key id
 */
export async function deriveCsrfToken(keyId: string): Promise<string>
{
    const subkey = await hmacSha256(new TextEncoder().encode(sessionSecret()), CSRF_SUBKEY_LABEL);

    return toHex(await hmacSha256(subkey, keyId));
}

/**
 * Constant-time string comparison.
 *
 * Named for the string it takes, so it does not collide with node's Buffer-based
 * `timingSafeEqual` — which this package also uses, in the OAuth providers. It is
 * not re-exported from the package barrel for the same reason.
 *
 * Length is compared first and leaks only the length, which is fixed and public.
 */
export function timingSafeEqualString(a: string, b: string): boolean
{
    if (a.length !== b.length)
    {
        return false;
    }

    let difference = 0;

    for (let i = 0; i < a.length; i++)
    {
        difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return difference === 0;
}

/**
 * Whether a presented header value carries the expected token.
 *
 * The header may carry several comma-separated candidates — a browser sees every
 * `spfn_csrf*` cookie set on the host and cannot tell which dev instance owns
 * which, nor which of two same-named cookies a sibling subdomain tossed in.
 *
 * Every candidate the client is allowed to send is checked — the cap here is the
 * one it selects against — so a genuine value is never evicted by tossed ones
 * that happen to sort ahead of it. A header longer than that can only come from a
 * client that ignored the shared bound, and its surplus is dropped. Accepting any
 * match is no weaker than accepting one: a candidate the attacker chose still has
 * to equal a value recomputed from the session.
 */
export function matchesCsrfToken(expected: string, presented: string | null | undefined): boolean
{
    if (!presented)
    {
        return false;
    }

    return presented
        .split(',', MAX_CANDIDATES)
        .some((candidate) => timingSafeEqualString(expected, candidate.trim()));
}
