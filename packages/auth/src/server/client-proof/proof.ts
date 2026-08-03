/**
 * SPFN-PROOF-INPUT-1 — proof-input assembly and verification for clientProofV1.
 *
 * The proof input is 8 fields joined by `\n` in fixed order: profile, method,
 * path, clientId, keyId, nonce, issuedAtMillis, bodySha256. Any C0 control
 * character in any field is a hard refusal (the separator would otherwise be
 * ambiguous), never something to escape. The proof is an ECDSA P-256 signature
 * with SHA-256 over the canonical input's UTF-8 bytes, wire-encoded as the raw
 * `r ‖ s` 64 bytes in base16-lower (128 hex characters). DER is never accepted
 * on the wire: a platform signer that emits DER (Java `Signature`) converts to
 * raw before sending. Low-S normalization is not required — uniqueness is owned
 * by the nonce and replay window, so signature malleability cannot replay.
 *
 * @module server/client-proof/proof
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

/** The only auth profile this module implements. */
export const CLIENT_PROOF_PROFILE = 'clientProofV1';

/** `bodySha256` when an operation carries no body: 64 zero characters. */
export const ABSENT_BODY_SHA256 = '0'.repeat(64);

/** The contract's `clientProofV1.replayWindowMillis`. */
export const DEFAULT_REPLAY_WINDOW_MILLIS = 300_000;

/** The eight proof-input fields, in the order the signature is taken over. */
export const PROOF_INPUT_FIELDS = [
    'profile',
    'method',
    'path',
    'clientId',
    'keyId',
    'nonce',
    'issuedAtMillis',
    'bodySha256',
] as const;

/** What joins the proof-input fields. */
export const PROOF_INPUT_SEPARATOR = '\n';

/** Raw `r ‖ s`: two 32-byte big-endian integers, always exactly this long. */
export const PROOF_SIGNATURE_BYTES = 64;

/** The wire form is base16-lower of the raw signature: 128 hex characters. */
export const PROOF_SIGNATURE_HEX_LENGTH = PROOF_SIGNATURE_BYTES * 2;

/**
 * Exactly 128 lowercase hex characters — anything else (DER, uppercase,
 * truncated, padded) is not a proof this contract describes.
 */
const PROOF_SIGNATURE_PATTERN = /^[0-9a-f]{128}$/;

/**
 * Node's name for the fixed-width raw `r ‖ s` signature encoding. Both signing
 * and verification pin it, so the r/s padding rules (a 32-byte length is
 * guaranteed, a would-be 33-byte DER integer is trimmed) live inside
 * node:crypto rather than in a hand-rolled DER converter.
 */
const RAW_SIGNATURE_ENCODING = 'ieee-p1363';

type ProofInputField = (typeof PROOF_INPUT_FIELDS)[number];

export interface ClientProofInput
{
    method: string;
    path: string;
    clientId: string;
    keyId: string;
    nonce: string;
    issuedAtMillis: bigint;
    bodySha256: string;
}

/** A C0 control character appeared in a proof field. */
export class ProofInputError extends Error
{
    constructor()
    {
        super('proof input field contains a C0 control character');
        this.name = 'ProofInputError';
    }
}

/**
 * The canonical proof-input string the signature is taken over.
 *
 * @throws ProofInputError when any field contains a C0 control character.
 */
export function canonicalProofInput(input: ClientProofInput): string
{
    const values: Record<ProofInputField, string> = {
        profile: CLIENT_PROOF_PROFILE,
        method: input.method,
        path: input.path,
        clientId: input.clientId,
        keyId: input.keyId,
        nonce: input.nonce,
        issuedAtMillis: input.issuedAtMillis.toString(),
        bodySha256: input.bodySha256,
    };
    const fields = PROOF_INPUT_FIELDS.map((name) => values[name]);
    for (const field of fields)
    {
        for (const ch of field)
        {
            if (ch.codePointAt(0)! < 0x20)
            {
                throw new ProofInputError();
            }
        }
    }

    return fields.join(PROOF_INPUT_SEPARATOR);
}

/**
 * The contract's public-key representation — SPKI DER, base64 (the same
 * representation `user_public_keys` and the web ES256 path store) — as a key
 * object. Anything that is not a P-256 EC key is refused at parse time, so a
 * key that could never verify a proof is never registered.
 *
 * @throws when the input is not base64 SPKI DER naming a P-256 key.
 */
export function parseClientProofPublicKey(spkiDerBase64: string): KeyObject
{
    const key = createPublicKey({
        key: Buffer.from(spkiDerBase64, 'base64'),
        format: 'der',
        type: 'spki',
    });
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
    {
        throw new Error('a clientProofV1 public key must be an ECDSA P-256 key');
    }

    return key;
}

/**
 * Verifies a presented proof against `input` and a registered public key.
 *
 * The input is assembled first, so a C0 control character throws no matter
 * what was presented — an unassemblable input is a contract violation, never
 * a proof answer. Then the wire-format gate: a value that is not exactly 128
 * lowercase hex characters — a DER signature, a truncated one, uppercase hex —
 * is invalid before any cryptography happens.
 *
 * @throws ProofInputError when an input field contains a C0 control character.
 */
export function verifyClientProof(input: ClientProofInput, presentedProof: string, publicKey: KeyObject): boolean
{
    const data = Buffer.from(canonicalProofInput(input), 'utf8');
    if (!PROOF_SIGNATURE_PATTERN.test(presentedProof))
    {
        return false;
    }

    return verify(
        'sha256',
        data,
        { key: publicKey, dsaEncoding: RAW_SIGNATURE_ENCODING },
        Buffer.from(presentedProof, 'hex'),
    );
}

/**
 * Signs `input` with a PKCS#8 DER base64 private key, producing the wire form
 * (raw `r ‖ s`, base16-lower).
 *
 * The verifying half's counterpart, here for tests and dev clients — a
 * production signer lives in the mobile SDKs against hardware-held keys.
 */
export function signClientProof(input: ClientProofInput, privateKeyPkcs8DerBase64: string): string
{
    const key = createPrivateKey({
        key: Buffer.from(privateKeyPkcs8DerBase64, 'base64'),
        format: 'der',
        type: 'pkcs8',
    });

    return sign(
        'sha256',
        Buffer.from(canonicalProofInput(input), 'utf8'),
        { key, dsaEncoding: RAW_SIGNATURE_ENCODING },
    ).toString('hex');
}

/** Lowercase base16 SHA-256 of `bytes`. */
export function sha256Hex(bytes: Uint8Array): string
{
    return createHash('sha256').update(bytes).digest('hex');
}
