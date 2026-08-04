/**
 * Deterministic JSON
 *
 * The generated contract is committed and compared against what the generator
 * produces. If key order moved between runs, "the committed file differs from
 * the generated one" would flicker and the check would train people to ignore
 * it. So every emitted document is written with its object keys sorted, and the
 * digest that pins a released snapshot is taken over the same ordering with no
 * whitespace — formatting choices never move a digest.
 */

import { createHash } from 'node:crypto';

/** Recursively sort object keys and drop `undefined` members. */
export function canonicalize(value: unknown): unknown
{
    if (Array.isArray(value))
    {
        return value.map(canonicalize);
    }

    if (value === null || typeof value !== 'object')
    {
        return value;
    }

    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(source).sort())
    {
        if (source[key] === undefined)
        {
            continue;
        }

        sorted[key] = canonicalize(source[key]);
    }

    return sorted;
}

/** Compact canonical encoding — what a digest is taken over. */
export function stableStringify(value: unknown): string
{
    return JSON.stringify(canonicalize(value));
}

/** Indented canonical encoding — what gets written to disk and reviewed. */
export function stableStringifyPretty(value: unknown): string
{
    return `${JSON.stringify(canonicalize(value), null, 4)}\n`;
}

/** SHA-256 of the compact canonical encoding, lowercase hex. */
export function stableDigest(value: unknown): string
{
    return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}
