/**
 * SPFN-PROOF-INPUT-1 — proof-input assembly and verification for clientProofV1.
 *
 * The proof input is 8 fields joined by `\n` in fixed order: profile, method,
 * path, clientId, keyId, nonce, issuedAtMillis, bodySha256. Any C0 control
 * character in any field is a hard refusal (the separator would otherwise be
 * ambiguous), never something to escape. The MAC is HMAC-SHA-256 over the
 * canonical input's UTF-8 bytes, encoded base16-lower.
 *
 * @module server/client-proof/proof
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** The only auth profile this module implements. */
export const CLIENT_PROOF_PROFILE = 'clientProofV1';

/** `bodySha256` when an operation carries no body: 64 zero characters. */
export const ABSENT_BODY_SHA256 = '0'.repeat(64);

/** The contract's `clientProofV1.replayWindowMillis`. */
export const DEFAULT_REPLAY_WINDOW_MILLIS = 300_000;

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
 * The canonical proof-input string the MAC is taken over.
 *
 * @throws ProofInputError when any field contains a C0 control character.
 */
export function canonicalProofInput(input: ClientProofInput): string
{
    const fields = [
        CLIENT_PROOF_PROFILE,
        input.method,
        input.path,
        input.clientId,
        input.keyId,
        input.nonce,
        input.issuedAtMillis.toString(),
        input.bodySha256,
    ];
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

    return fields.join('\n');
}

/** The base16-lower HMAC-SHA-256 proof for `input` under `key`. */
export function computeClientProof(input: ClientProofInput, key: Uint8Array): string
{
    return createHmac('sha256', key).update(canonicalProofInput(input), 'utf8').digest('hex');
}

/** Lowercase base16 SHA-256 of `bytes`. */
export function sha256Hex(bytes: Uint8Array): string
{
    return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Constant-time comparison of two proof strings.
 *
 * Length is checked first (its leak reveals nothing — the expected length is
 * public), then the bytes are compared with `timingSafeEqual`.
 */
export function constantTimeEqualsProof(expected: string, presented: string): boolean
{
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(presented, 'utf8');
    if (a.length !== b.length)
    {
        return false;
    }

    return timingSafeEqual(a, b);
}
