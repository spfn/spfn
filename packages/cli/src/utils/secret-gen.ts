/**
 * Cryptographically-random secret value generation.
 *
 * Used by `spfn key` (clipboard-style output) and `spfn secret generate/rotate`
 * (schema-driven minting via the `generate` strategy).
 *
 * These are random values, not hashes — a fresh secret must come from a CSPRNG
 * (`crypto.randomBytes` / `randomUUID`), never a hash of existing data.
 */

import { randomBytes, randomUUID } from 'crypto';
import type { GenerateSpec } from './env-schema.js';

/**
 * `bytes` random bytes encoded as URL-safe base64 (A-Z a-z 0-9 - _), no padding.
 *
 * Higher character diversity than hex, which satisfies entropy checks that require
 * a minimum number of unique characters.
 */
export function randomBase64Url(bytes: number): string
{
    return randomBytes(bytes)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

/**
 * Produce a value for a schema's declared `generate` strategy.
 */
export function generateSecretValue(spec: GenerateSpec): string
{
    switch (spec)
    {
        case 'hex32':
            return randomBytes(32).toString('hex');
        case 'hex64':
            return randomBytes(64).toString('hex');
        case 'base64url32':
            return randomBase64Url(32);
        case 'uuid':
            return randomUUID();
        default:
            throw new Error(`Unknown generate strategy: ${spec}`);
    }
}
