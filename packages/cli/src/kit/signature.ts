/**
 * Detached signatures over the documents a Kit install trusts.
 *
 * The I0 envelopes carry no signature field — a signature that travels inside
 * the bytes it covers cannot be checked without first deciding which bytes to
 * strip. So a signed document arrives in a wrapper: the contract object as
 * `document`, and a detached signature over that object's canonical JSON. The
 * envelope inside stays byte-identical to the frozen schema, which is what lets
 * the same validator check a fetched descriptor and a fixture.
 *
 * Ed25519 only. A wrapper naming any other algorithm is refused rather than
 * dispatched, so a producer cannot pick the CLI's verification down to
 * something weaker.
 */

import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { canonicalJson } from './digest.js';

export interface SignedDocumentV1
{
    schemaVersion: 1;
    document: unknown;
    signature: {
        keyId: string;
        algorithm: 'ed25519';
        /** Base64 detached signature over the canonical JSON of `document`. */
        value: string;
    };
}

/** A public key the CLI is willing to trust, as base64 SPKI DER. */
export interface TrustedKey
{
    keyId: string;
    publicKey: string;
}

export interface SignatureCheck
{
    ok: boolean;
    /** Secret-free reason a check failed, safe to print. */
    reason?: string;
    keyId?: string;
}

const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

/**
 * Verify a signed wrapper and hand back the document it carries.
 *
 * Everything is checked before the signature is: a malformed wrapper never
 * reaches the crypto call, and an unknown key ID never turns into "verified
 * with the only key we had".
 */
export function verifySignedDocument(
    wrapper: unknown,
    trustedKeys: readonly TrustedKey[],
): SignatureCheck & { document?: unknown }
{
    if (typeof wrapper !== 'object' || wrapper === null || Array.isArray(wrapper))
    {
        return { ok: false, reason: 'signed wrapper is not an object' };
    }

    const record = wrapper as Record<string, unknown>;

    if (record.schemaVersion !== 1)
    {
        return { ok: false, reason: 'signed wrapper schemaVersion is not 1' };
    }
    if (typeof record.document !== 'object' || record.document === null)
    {
        return { ok: false, reason: 'signed wrapper carries no document object' };
    }

    const signature = record.signature;

    if (typeof signature !== 'object' || signature === null)
    {
        return { ok: false, reason: 'signed wrapper carries no signature' };
    }

    const { keyId, algorithm, value } = signature as Record<string, unknown>;

    if (typeof keyId !== 'string' || !KEY_ID_PATTERN.test(keyId))
    {
        return { ok: false, reason: 'signature key ID is missing or malformed' };
    }
    if (algorithm !== 'ed25519')
    {
        return { ok: false, reason: 'signature algorithm is not ed25519', keyId };
    }
    if (typeof value !== 'string' || value.length === 0)
    {
        return { ok: false, reason: 'signature value is missing', keyId };
    }

    const trusted = trustedKeys.find(candidate => candidate.keyId === keyId);

    if (!trusted)
    {
        return { ok: false, reason: 'signature key ID is not trusted', keyId };
    }

    let verified = false;

    try
    {
        const publicKey = createPublicKey({
            key: Buffer.from(trusted.publicKey, 'base64'),
            format: 'der',
            type: 'spki',
        });

        verified = verifySignature(
            null,
            Buffer.from(canonicalJson(record.document), 'utf8'),
            publicKey,
            Buffer.from(value, 'base64'),
        );
    }
    catch
    {
        return { ok: false, reason: 'signature could not be verified with the trusted key', keyId };
    }

    if (!verified)
    {
        return { ok: false, reason: 'signature does not match the document', keyId };
    }

    return { ok: true, keyId, document: record.document };
}
