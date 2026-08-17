/**
 * The two committed files that make a clean clone restorable (unit 06
 * sections 4.2 and 5.1).
 *
 *   `.spfn/license.json`  — which activation this checkout belongs to, and
 *                           where its registry lives. Public IDs only: enough
 *                           to find the keychain item, never enough to be one.
 *   `.spfn/kit-lock.json` — exactly which release is installed, with the
 *                           digests a restore or a drift check compares against.
 *
 * Both are committed, so both are read by strangers — a reviewer, a CI job, the
 * next developer. That is the reason for the split with the keychain: a file
 * that travels in a repository can hold an identifier, never a credential.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { KitError } from './errors.js';
import { PATTERNS } from './validate.js';
import type { KitPackageEntry, KitManagedResource, KitReleaseManifestView } from './manifest.js';

export interface KitLicenseFileV1
{
    schemaVersion: 1;
    kitId: string;
    /** Public activation ID. Names the keychain item; is not a secret itself. */
    activationId: string;
    localClientId: string;
    installationId: string;
    controlPlaneUrl: string;
    registryUrl: string;
}

export interface InstalledKitLockV1
{
    schemaVersion: 1;
    kitId: string;
    release: string;
    sequence: number;
    releaseClass: string;
    manifestDigest: string;
    manifestUrl: string;
    catalogUrl: string;
    cliVersion: string;
    packages: KitPackageEntry[];
    managedResources: KitManagedResource[];
    agentPack: { path: string; version: string; targetDigest: string };
    installedAt: string;
}

export function readLicenseFile(file: string): KitLicenseFileV1 | null
{
    const parsed = readJson(file);

    if (parsed === null)
    {
        return null;
    }

    const record = parsed as Record<string, unknown>;
    const ids = ['kitId', 'activationId', 'localClientId', 'installationId'] as const;

    if (record.schemaVersion !== 1 || !ids.every(key => typeof record[key] === 'string'))
    {
        return null;
    }

    return record as unknown as KitLicenseFileV1;
}

export function writeLicenseFile(file: string, value: KitLicenseFileV1): void
{
    // Belt and braces around the rule this file exists to keep: a committed
    // file gets exactly the fields the contract names, so a future edit cannot
    // quietly park a credential in it.
    const allowed: (keyof KitLicenseFileV1)[] = [
        'schemaVersion', 'kitId', 'activationId', 'localClientId',
        'installationId', 'controlPlaneUrl', 'registryUrl',
    ];
    const extra = Object.keys(value).filter(key => !allowed.includes(key as keyof KitLicenseFileV1));

    if (extra.length > 0)
    {
        throw new Error(`Refusing to commit unknown fields to license.json: ${extra.join(', ')}`);
    }

    writeJsonAtomically(file, value);
}

export function readInstalledLock(file: string): InstalledKitLockV1 | null
{
    const parsed = readJson(file);

    if (parsed === null)
    {
        return null;
    }

    const record = parsed as Record<string, unknown>;
    const wellFormed = record.schemaVersion === 1
        && typeof record.kitId === 'string'
        && typeof record.release === 'string'
        && PATTERNS.digest.test(String(record.manifestDigest ?? ''))
        && Array.isArray(record.packages);

    return wellFormed ? record as unknown as InstalledKitLockV1 : null;
}

/** Read the lock, or refuse: a restore may not guess which release to fetch. */
export function requireInstalledLock(file: string): InstalledKitLockV1
{
    const lock = readInstalledLock(file);

    if (lock === null)
    {
        throw new KitError('KIT_LOCK_INVALID', 'This project has no readable .spfn/kit-lock.json.', {
            evidence: { file, exists: existsSync(file) },
            next: { command: 'spfn kit recover --json', requiresHumanApproval: false },
        });
    }

    return lock;
}

export function writeInstalledLock(file: string, value: InstalledKitLockV1): void
{
    writeJsonAtomically(file, value);
}

export function lockFromManifest(
    manifest: KitReleaseManifestView,
    context: { manifestUrl: string; catalogUrl: string; cliVersion: string; installedAt: string },
): InstalledKitLockV1
{
    return {
        schemaVersion: 1,
        kitId: manifest.kitId,
        release: manifest.version,
        sequence: manifest.sequence,
        releaseClass: manifest.releaseClass,
        manifestDigest: manifest.manifestDigest,
        manifestUrl: context.manifestUrl,
        catalogUrl: context.catalogUrl,
        cliVersion: context.cliVersion,
        packages: manifest.packages,
        managedResources: manifest.managedResources,
        agentPack: {
            path: manifest.agentPack.path,
            version: manifest.agentPack.version,
            targetDigest: manifest.agentPack.targetDigest,
        },
        installedAt: context.installedAt,
    };
}

function readJson(file: string): unknown
{
    if (!existsSync(file))
    {
        return null;
    }

    try
    {
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    catch
    {
        return null;
    }
}

function writeJsonAtomically(file: string, value: unknown): void
{
    mkdirSync(dirname(file), { recursive: true });

    const temporary = `${file}.tmp`;

    writeFileSync(temporary, `${JSON.stringify(value, null, 4)}\n`, 'utf8');
    renameSync(temporary, file);
}
