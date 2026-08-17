/**
 * The public keys this CLI will accept a signed Kit document from.
 *
 * The list is built in rather than fetched, and that is the point: a trust root
 * that arrives over the network is not a trust root, because whoever can serve
 * the document can serve the key that vouches for it. Keys change by shipping a
 * new CLI, which is a thing customers can see happen.
 *
 * The list is empty in this build. The release signing key is not published
 * yet, so every signed document fails verification, and that is the correct
 * behaviour for a CLI that has no way to tell a real release from a forged one
 * — it fails closed, with `KIT_MANIFEST_INVALID`, rather than installing
 * whatever it was handed.
 *
 * `SPFN_KIT_TRUSTED_KEYS` exists for the runs that legitimately verify against
 * a key that is not the published one: an integration against a staging
 * control plane, or a release rehearsal. It *replaces* the built-in list rather
 * than adding to it, so a stray variable can only ever narrow what this CLI
 * trusts down to keys the person running it chose.
 */

import type { TrustedKey } from './signature.js';

/** Keys shipped with this build. Empty until the signing key is published. */
export const BUILT_IN_TRUSTED_KEYS: readonly TrustedKey[] = [];

export const TRUSTED_KEYS_ENV = 'SPFN_KIT_TRUSTED_KEYS';

const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

/**
 * The keys to verify with, and where they came from.
 *
 * A malformed override is rejected outright rather than partially honoured: a
 * trust list that silently dropped the entry someone meant to add would verify
 * with whatever was left, which is the one outcome worth avoiding here.
 */
export function resolveTrustedKeys(env: NodeJS.ProcessEnv = process.env): readonly TrustedKey[]
{
    const raw = env[TRUSTED_KEYS_ENV];

    if (typeof raw !== 'string' || raw.trim().length === 0)
    {
        return BUILT_IN_TRUSTED_KEYS;
    }

    const parsed = parseKeys(raw);

    if (parsed === null)
    {
        throw new Error(
            `${TRUSTED_KEYS_ENV} is not a JSON array of { "keyId", "publicKey" } entries with base64 SPKI keys.`,
        );
    }

    return parsed;
}

function parseKeys(raw: string): TrustedKey[] | null
{
    let value: unknown;

    try
    {
        value = JSON.parse(raw);
    }
    catch
    {
        return null;
    }

    if (!Array.isArray(value) || value.length === 0)
    {
        return null;
    }

    const keys: TrustedKey[] = [];

    for (const entry of value as Record<string, unknown>[])
    {
        if (typeof entry?.keyId !== 'string' || !KEY_ID_PATTERN.test(entry.keyId))
        {
            return null;
        }
        if (typeof entry.publicKey !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(entry.publicKey))
        {
            return null;
        }

        keys.push({ keyId: entry.keyId, publicKey: entry.publicKey });
    }

    return keys;
}
