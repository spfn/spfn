/**
 * Managed drift: has anyone edited a file the Kit owns?
 *
 * Unit 06 rule 7 — drift is caught before the first production write, not
 * after. The check is a digest comparison against what the installed lock says
 * each managed file should be, and it is deliberately one-directional: the CLI
 * reports drift and stops, it never "restores" the file. Overwriting an edit
 * someone made on purpose, without showing them first, is the failure mode this
 * exists to prevent.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Digest } from './digest.js';
import type { InstalledKitLockV1 } from './installed-state.js';

export interface ManagedDriftEntry
{
    path: string;
    expected: string;
    /** null when the managed file is gone entirely. */
    actual: string | null;
}

export function fileDigest(root: string, relativePath: string): string | null
{
    const file = join(root, relativePath);

    return existsSync(file) ? sha256Digest(readFileSync(file)) : null;
}

/** Every managed file whose bytes no longer match the installed lock. */
export function detectManagedDrift(root: string, lock: InstalledKitLockV1): ManagedDriftEntry[]
{
    const targets = [
        ...lock.managedResources.map(resource => ({ path: resource.path, expected: resource.targetDigest })),
        { path: lock.agentPack.path, expected: lock.agentPack.targetDigest },
    ];

    return targets
        .map(target => ({ ...target, actual: fileDigest(root, target.path) }))
        .filter(entry => entry.actual !== entry.expected);
}

/** The digests of every managed file right now — evidence a resume re-reads. */
export function managedDigests(root: string, lock: InstalledKitLockV1): Record<string, string | null>
{
    const digests: Record<string, string | null> = {};

    for (const resource of lock.managedResources)
    {
        digests[resource.path] = fileDigest(root, resource.path);
    }

    digests[lock.agentPack.path] = fileDigest(root, lock.agentPack.path);

    return digests;
}
