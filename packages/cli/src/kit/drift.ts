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
import { readAgentPackRecord } from './agent-pack.js';
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

/**
 * The Agent Pack's targets: one file, or every file of an expanded tree.
 *
 * A pack that expanded has no file at the manifest's `path` — the digest there
 * covers the archive, not anything on disk — so the comparison moves to the
 * record the expansion wrote. A checkout whose record is missing is reported as
 * drift on the root itself rather than passing silently: "the pack is gone" and
 * "the pack is fine" must not look the same.
 */
function agentPackTargets(root: string, lock: InstalledKitLockV1): { path: string; expected: string }[]
{
    if (lock.agentPack.root === undefined)
    {
        return [{ path: lock.agentPack.path, expected: lock.agentPack.targetDigest }];
    }

    const record = readAgentPackRecord(root);

    if (record === null)
    {
        return [{ path: lock.agentPack.root, expected: lock.agentPack.targetDigest }];
    }

    return Object.entries(record.files).map(([path, expected]) => ({ path, expected }));
}

/** Every managed file whose bytes no longer match the installed lock. */
export function detectManagedDrift(root: string, lock: InstalledKitLockV1): ManagedDriftEntry[]
{
    const targets = [
        ...lock.managedResources.map(resource => ({ path: resource.path, expected: resource.targetDigest })),
        ...agentPackTargets(root, lock),
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

    for (const target of agentPackTargets(root, lock))
    {
        digests[target.path] = fileDigest(root, target.path);
    }

    return digests;
}
