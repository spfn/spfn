/**
 * The verifier — `@spfn/signing/verify`.
 *
 * This entry point depends on `node:crypto` and nothing else, on purpose. It
 * runs inside untrusted tenant containers and in one-file scripts that have
 * no `node_modules`, so every byte it pulls in is a byte that has to be
 * shipped there and trusted there.
 *
 * ```ts
 * import { verifyJws } from '@spfn/signing/verify';
 *
 * const result = verifyJws(token, process.env.SPFN_SIGNING_PUBLIC_KEYS!);
 * if (!result.ok) return deny(result.reason);
 * ```
 *
 * `verifyJws()` never throws on token input: a malformed token is a verdict,
 * not an exception. Bad *key configuration* does throw — that is your bug,
 * not the caller's.
 */

import { verify as cryptoVerify } from 'node:crypto';
import { parseCompact, type ParsedJws } from './jws';
import { toPublicKeyMap } from './keys';
import type {
    JwsHeader,
    PublicKeyEntry,
    PublicKeySource,
    VerifyOptions,
    VerifyResult,
} from './types';

const DEFAULT_CLOCK_SKEW_SEC = 30;

export { parseCompact, decodeBase64Url, encodeBase64Url } from './jws';
export type { ParsedHeader, ParsedJws } from './jws';
export {
    algorithmOf,
    formatPublicKeyEntry,
    formatPublicKeys,
    parsePublicKeyEntry,
    parsePublicKeys,
    publicKeyToJwk,
    rawPublicKey,
    toJwks,
    toPublicKeyMap,
} from './keys';
export type {
    JwsHeader,
    JwsPayload,
    ProviderName,
    PublicKeyEntry,
    PublicKeySource,
    SigningAlgorithm,
    VerifyFailureReason,
    VerifyOptions,
    VerifyResult,
} from './types';

/**
 * Check the signature over the exact bytes received.
 *
 * The comparison is `crypto.verify`'s, not a byte compare of our own: it is
 * the one that is constant-time, and it is the one that knows the encoding.
 */
function signatureIsValid(parsed: ParsedJws, key: PublicKeyEntry): boolean
{
    try
    {
        if (key.alg === 'EdDSA')
        {
            return cryptoVerify(null, parsed.signingInput, key.public, parsed.signature);
        }

        return cryptoVerify(
            'sha256',
            parsed.signingInput,
            { key: key.public, dsaEncoding: 'ieee-p1363' },
            parsed.signature,
        );
    }
    catch
    {
        // A signature of the wrong length makes OpenSSL complain rather than
        // return false. It is still just a signature that does not verify.
        return false;
    }
}

/** A time claim: absent, a finite number, or present as something else. */
type TimeClaim = number | 'absent' | 'invalid';

/**
 * Read one time claim.
 *
 * A claim that is present but is not a finite number is `invalid`, not
 * absent: `exp: "1800000000"` is an issuer that meant to set an expiry, and
 * treating it as "no expiry given" turns a typo into an immortal token.
 * `1e999` parses to `Infinity` and lands here too. The verdict is
 * `invalid-claims`, not `malformed`: the token is structurally fine and
 * genuinely yours, and it is your issuer that needs fixing.
 */
function timeClaim(payload: Record<string, unknown>, claim: string): TimeClaim
{
    const value = payload[claim];

    if (value === undefined)
    {
        return 'absent';
    }

    return typeof value === 'number' && Number.isFinite(value) ? value : 'invalid';
}

/**
 * Apply the `maxAgeSec` policy: the lifetime the token granted itself.
 *
 * That lifetime is `exp - iat`, so both claims are needed to compute it and a
 * token missing either one cannot satisfy the policy. It is refused rather
 * than exempted — a caller sets `maxAgeSec` precisely because a token of
 * unbounded life is not acceptable here.
 */
function maxAgeFailure(
    exp: TimeClaim,
    iat: TimeClaim,
    maxAgeSec: number | undefined,
): VerifyResult | null
{
    if (maxAgeSec === undefined)
    {
        return null;
    }

    if (typeof exp !== 'number' || typeof iat !== 'number')
    {
        return { ok: false, reason: 'no-expiry' };
    }

    return exp - iat > maxAgeSec ? { ok: false, reason: 'too-old' } : null;
}

/**
 * Is the token dated later than this verifier will look?
 *
 * `nbf` says so on its own. `iat` only counts under `maxAgeSec`, and it has
 * to: the policy bounds `exp - iat`, the life the token granted itself, but
 * what a caller is buying is a bound on how long the token is *accepted*. An
 * issue date in the future moves that acceptance window with it, so a
 * sixty-second token dated thirty years ahead satisfies `exp - iat` and is
 * still accepted thirty years from now. Refusing a future `iat` pins the
 * window to the clock.
 */
function notYetValid(
    nbf: TimeClaim,
    iat: TimeClaim,
    horizonSec: number,
    maxAgeSec: number | undefined,
): boolean
{
    if (typeof nbf === 'number' && nbf > horizonSec)
    {
        return true;
    }

    return maxAgeSec !== undefined && typeof iat === 'number' && iat > horizonSec;
}

/**
 * Evaluate `exp`, `nbf` and the `maxAgeSec` policy.
 *
 * Claims the caller invented are not interpreted; the three this package does
 * interpret have to be numbers when they are present at all.
 *
 * The order is the reason a caller can act on the verdict. Claims that
 * contradict each other come first, because no clock makes them true. Then
 * the clock, `not-yet-valid` before `expired`. The `maxAgeSec` policy is
 * last, so a token that is simply dead reports `expired` rather than the
 * policy verdict its missing `iat` would otherwise earn it.
 */
function claimFailure(parsed: ParsedJws, options: VerifyOptions): VerifyResult | null
{
    const nowSec = (options.now ?? Date.now()) / 1000;
    const skew = options.clockSkewSec ?? DEFAULT_CLOCK_SKEW_SEC;
    const exp = timeClaim(parsed.payload, 'exp');
    const iat = timeClaim(parsed.payload, 'iat');
    const nbf = timeClaim(parsed.payload, 'nbf');

    if (exp === 'invalid' || iat === 'invalid' || nbf === 'invalid')
    {
        return { ok: false, reason: 'invalid-claims' };
    }

    if (typeof exp === 'number' && typeof iat === 'number' && iat > exp)
    {
        return { ok: false, reason: 'invalid-claims' };
    }

    if (notYetValid(nbf, iat, nowSec + skew, options.maxAgeSec))
    {
        return { ok: false, reason: 'not-yet-valid' };
    }

    if (typeof exp === 'number' && nowSec - skew > exp)
    {
        return { ok: false, reason: 'expired' };
    }

    return maxAgeFailure(exp, iat, options.maxAgeSec);
}

/**
 * Verify a compact JWS against a set of public keys.
 *
 * The `kid` in the header selects the key, and that key decides the
 * algorithm; the header's `alg` is only ever checked for equality against it.
 * That is what stops an attacker from choosing the algorithm — including
 * `alg: "none"`, which is simply an `alg` no key ever has.
 *
 * There is no size limit here. A caller that reads tokens off a network
 * should impose one before calling: parsing a 1 MiB payload works, and
 * doing it for every request is a decision you should make on purpose.
 */
export function verifyJws(
    token: unknown,
    keys: PublicKeySource,
    options: VerifyOptions = {},
): VerifyResult
{
    const known = toPublicKeyMap(keys);
    const parsed = parseCompact(token);

    if (!parsed)
    {
        return { ok: false, reason: 'malformed' };
    }

    const key = known.get(parsed.header.kid);

    if (!key)
    {
        return { ok: false, reason: 'unknown-kid' };
    }

    if (parsed.header.alg !== key.alg)
    {
        return { ok: false, reason: 'alg-mismatch' };
    }

    if (!signatureIsValid(parsed, key))
    {
        return { ok: false, reason: 'bad-signature' };
    }

    return claimFailure(parsed, options) ?? {
        ok: true,
        header: parsed.header as JwsHeader,
        payload: parsed.payload,
    };
}
