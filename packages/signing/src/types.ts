/**
 * @spfn/signing — shared types.
 *
 * Everything else in the package imports from here, and nothing here imports
 * anything else: the module graph stays acyclic and the verify-only entry
 * point keeps its promise of `node:crypto` and nothing more.
 */

import type { KeyObject } from 'node:crypto';

/**
 * The algorithms this package signs and verifies.
 *
 * `EdDSA` (Ed25519) is the default; `ES256` (ECDSA P-256) is the alternative.
 * Every provider signs both — `local`, Cloud KMS and AWS KMS all have an
 * Ed25519 key spec.
 */
export type SigningAlgorithm = 'ES256' | 'EdDSA';

/** Names of the key providers `createSigner()` understands. */
export type ProviderName = 'local' | 'gcp-kms' | 'aws-kms';

/**
 * A JWS protected header (RFC 7515 §4).
 *
 * `kid` is required: the key it names decides the algorithm, and `alg` is
 * only ever checked for equality against that decision.
 */
export interface JwsHeader
{
    alg: SigningAlgorithm;
    kid: string;
    typ?: string;
    [claim: string]: unknown;
}

/** A JSON payload. Claims are the caller's business; this package adds none. */
export type JwsPayload = Record<string, unknown>;

/** One public key, addressable by `kid`. */
export interface PublicKeyEntry
{
    kid: string;
    alg: SigningAlgorithm;
    /** The key itself, as `node:crypto` sees it. */
    public: KeyObject;
    /** Which provider holds the matching private key, when it is known. */
    provider?: ProviderName;
}

/** Anything `verifyJws()` accepts in place of a prepared key map. */
export type PublicKeySource =
    | string
    | PublicKeyEntry
    | readonly PublicKeyEntry[]
    | ReadonlyMap<string, PublicKeyEntry>;

/**
 * Why a token was rejected.
 *
 * - `malformed` — not three canonical base64url segments, or the header is not
 *   a JWS header with a `kid`, or the payload is not a JSON object. Nothing
 *   about it says it was ever meant to be your token.
 * - `invalid-claims` — the signature is yours and the shape is right, but a
 *   time claim is present and is not a finite number, or `iat` is after
 *   `exp`. This one is your issuer's bug, and it is a separate reason from
 *   `malformed` so that a dashboard can tell "someone else's traffic" from
 *   "we are minting broken tokens".
 * - `unknown-kid` — the header names a key the verifier does not hold.
 * - `alg-mismatch` — the header's `alg` is not the algorithm of that key.
 * - `bad-signature` — the signature does not verify over the received bytes.
 * - `expired` / `not-yet-valid` — `exp` / `nbf`, allowing for clock skew.
 *   Under `maxAgeSec` an `iat` in the future is `not-yet-valid` too.
 * - `too-old` — the token's own lifetime (`exp - iat`) exceeds `maxAgeSec`.
 * - `no-expiry` — `maxAgeSec` was set and the token omits `exp` or `iat`, so
 *   its lifetime cannot be computed and the policy cannot be met.
 */
export type VerifyFailureReason =
    | 'malformed'
    | 'invalid-claims'
    | 'unknown-kid'
    | 'alg-mismatch'
    | 'bad-signature'
    | 'expired'
    | 'not-yet-valid'
    | 'too-old'
    | 'no-expiry';

/** The result of verifying a token. `verifyJws()` never throws instead. */
export type VerifyResult =
    | { ok: true; header: JwsHeader; payload: JwsPayload }
    | { ok: false; reason: VerifyFailureReason };

export interface VerifyOptions
{
    /** Epoch milliseconds to evaluate the time claims against. Default: now. */
    now?: number;
    /** Tolerance applied to `exp` and `nbf`. Default: 30 seconds. */
    clockSkewSec?: number;
    /**
     * Bound how long a token is accepted: at most this many seconds of life,
     * starting no later than now.
     *
     * Three things are required of the token, and each closes a way around
     * the other two: `iat` must not be in the future (`not-yet-valid`, or a
     * forward-dated token carries its own acceptance window with it), `exp`
     * must not precede `iat` (`invalid-claims`), and `exp - iat` must be at
     * most `maxAgeSec` (`too-old`). Both claims are needed to say any of
     * that, so a token without them is `no-expiry` rather than exempt.
     */
    maxAgeSec?: number;
}

export interface SignOptions
{
    /** `typ` for the protected header. Omitted from the header when unset. */
    typ?: string;
    /** Extra protected header members. `alg` and `kid` may not be overridden. */
    header?: Record<string, unknown>;
}

/**
 * A signer holds one key and turns a payload into a compact JWS.
 *
 * `sign()` is asynchronous on every provider, including `local`: a KMS round
 * trip is a network call, and one interface that changes shape per provider
 * is not one interface.
 */
export interface Signer
{
    readonly kid: string;
    readonly alg: SigningAlgorithm;
    readonly provider: ProviderName;

    /** Sign `payload` and return the compact serialization. */
    sign(payload: JwsPayload, options?: SignOptions): Promise<string>;

    /** The public half, for handing to a verifier. */
    publicKey(): Promise<PublicKeyEntry>;
}

/**
 * What a provider actually implements. The compact serialization is shared;
 * a provider only has to turn signing-input bytes into a JOSE signature.
 */
export interface RawSigner
{
    readonly kid: string;
    readonly alg: SigningAlgorithm;
    readonly provider: ProviderName;

    /**
     * Sign the exact bytes given.
     *
     * The result is a JOSE signature: for `ES256` that is `r || s`, 64 bytes,
     * never DER — the conversion belongs to the provider that produced DER.
     */
    signRaw(input: Buffer): Promise<Buffer>;

    publicKey(): Promise<PublicKeyEntry>;
}
