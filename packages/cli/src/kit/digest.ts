/**
 * Canonical JSON and the `sha256:` digests every Kit contract is pinned by.
 *
 * Two producers must agree on the same bytes before they can agree on a digest,
 * so "canonical" here means exactly one spelling: object keys sorted by their
 * UTF-16 code units, no insignificant whitespace, arrays left in order. The
 * setup descriptor's `payloadDigest` in the I0 fixtures is the digest of this
 * spelling of its payload, which is what pins the convention.
 */

import { createHash } from 'node:crypto';

export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

/** The one spelling of a JSON value that a digest may be taken over. */
export function canonicalJson(value: unknown): string
{
    return JSON.stringify(toCanonical(value));
}

function toCanonical(value: unknown): JsonValue
{
    if (value === null)
    {
        return null;
    }
    if (Array.isArray(value))
    {
        return value.map(toCanonical);
    }
    if (typeof value === 'object')
    {
        const source = value as Record<string, unknown>;
        const sorted: Record<string, JsonValue> = {};

        for (const key of Object.keys(source).sort())
        {
            if (source[key] === undefined)
            {
                continue;
            }
            sorted[key] = toCanonical(source[key]);
        }

        return sorted;
    }
    if (typeof value === 'number' && !Number.isFinite(value))
    {
        throw new TypeError('A non-finite number has no canonical JSON spelling.');
    }
    if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string')
    {
        return value;
    }

    throw new TypeError(`A ${typeof value} has no canonical JSON spelling.`);
}

/** `sha256:<hex>` over raw bytes or a UTF-8 string. */
export function sha256Digest(input: string | Uint8Array): string
{
    return `sha256:${createHash('sha256').update(input).digest('hex')}`;
}

/** `sha256:<hex>` over the canonical JSON of a value. */
export function digestOfJson(value: unknown): string
{
    return sha256Digest(canonicalJson(value));
}
