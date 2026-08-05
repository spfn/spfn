/**
 * Released snapshots
 *
 * `contracts/released/<version>.json` is what a version actually promised. It is
 * written once, at release, and never touched again — the gate compares against
 * the newest one.
 *
 * Comparing against the newest one alone is only sound if no release is missing
 * a snapshot: compatibility is transitive through the chain, and a gap in the
 * chain silently widens what passes. That is why cutting a release writes a
 * snapshot rather than offering to.
 *
 * Each snapshot carries the SHA-256 of its own document, so a hand-edited
 * snapshot fails the gate instead of quietly moving the baseline.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stableDigest, stableStringifyPretty } from './stable-json';
import type { ContractDocument, ContractSnapshot } from './types';

export class ContractSnapshotError extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = 'ContractSnapshotError';
    }
}

export const CURRENT_FILENAME = 'current.json';
export const RELEASED_DIRNAME = 'released';
export const USAGE_DIRNAME = 'usage';

export function currentPath(contractsDir: string): string
{
    return join(contractsDir, CURRENT_FILENAME);
}

export function releasedDir(contractsDir: string): string
{
    return join(contractsDir, RELEASED_DIRNAME);
}

export function usageDir(contractsDir: string): string
{
    return join(contractsDir, USAGE_DIRNAME);
}

/**
 * Order two versions the way a release line runs.
 *
 * Numeric identifiers compare numerically (so 1.10.0 follows 1.9.0), and a
 * pre-release sorts before the release it leads to.
 */
export function compareVersions(a: string, b: string): number
{
    const [aCore, aPre] = splitVersion(a);
    const [bCore, bPre] = splitVersion(b);

    for (let i = 0; i < 3; i++)
    {
        if (aCore[i] !== bCore[i])
        {
            return aCore[i] - bCore[i];
        }
    }

    if (aPre === bPre)
    {
        return 0;
    }

    if (aPre === undefined)
    {
        return 1;
    }

    if (bPre === undefined)
    {
        return -1;
    }

    return comparePreRelease(aPre, bPre);
}

function splitVersion(version: string): [number[], string | undefined]
{
    const [core, ...rest] = version.split('-');
    const parts = core.split('.').map(part => Number.parseInt(part, 10));

    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part) || part < 0))
    {
        throw new ContractSnapshotError(`"${version}" is not a version of the form major.minor.patch`);
    }

    return [parts, rest.length > 0 ? rest.join('-') : undefined];
}

function comparePreRelease(a: string, b: string): number
{
    const aParts = a.split('.');
    const bParts = b.split('.');

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++)
    {
        const left = aParts[i];
        const right = bParts[i];

        if (left === undefined)
        {
            return -1;
        }

        if (right === undefined)
        {
            return 1;
        }

        if (left === right)
        {
            continue;
        }

        const leftNumeric = /^\d+$/.test(left);
        const rightNumeric = /^\d+$/.test(right);

        if (leftNumeric && rightNumeric)
        {
            return Number(left) - Number(right);
        }

        if (leftNumeric !== rightNumeric)
        {
            return leftNumeric ? -1 : 1;
        }

        return left < right ? -1 : 1;
    }

    return 0;
}

export interface SnapshotFile
{
    version: string;
    file: string;
}

/** Every released snapshot, oldest first. */
export function listSnapshots(contractsDir: string): SnapshotFile[]
{
    const dir = releasedDir(contractsDir);

    if (!existsSync(dir))
    {
        return [];
    }

    return readdirSync(dir)
        .filter(name => name.endsWith('.json'))
        .map(name => ({ version: name.slice(0, -'.json'.length), file: join(dir, name) }))
        .sort((a, b) => compareVersions(a.version, b.version));
}

/** The snapshot the gate compares against, or undefined when nothing is released yet. */
export function newestSnapshot(contractsDir: string): SnapshotFile | undefined
{
    const snapshots = listSnapshots(contractsDir);

    return snapshots[snapshots.length - 1];
}

/**
 * Read a snapshot and check its digest.
 *
 * A mismatch means the file was edited after release. The baseline is the whole
 * point of the gate, so an edited baseline is refused rather than trusted.
 */
export function readSnapshot(file: string): ContractSnapshot
{
    let parsed: Partial<ContractSnapshot>;

    try
    {
        parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<ContractSnapshot>;
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);

        throw new ContractSnapshotError(`${file} could not be read: ${message}`);
    }

    if (typeof parsed.version !== 'string' || typeof parsed.sha256 !== 'string' || !parsed.document)
    {
        throw new ContractSnapshotError(`${file} is not a contract snapshot: expected version, sha256 and document`);
    }

    const digest = stableDigest(parsed.document);

    if (digest !== parsed.sha256)
    {
        throw new ContractSnapshotError(
            `${file} was edited after release: it records sha256 ${parsed.sha256} but its document hashes to ${digest}`,
        );
    }

    return { version: parsed.version, sha256: parsed.sha256, document: parsed.document as ContractDocument };
}

/**
 * Write the snapshot for a release.
 *
 * The version comes from the document, which took it from `.contractVersion()`
 * on the router. The filename follows the declaration rather than being told
 * separately what to say — a second place to state the version is a second place
 * for it to be wrong.
 *
 * Refuses to overwrite: a published version's promise does not change, a
 * mistake becomes a new version.
 */
export function writeSnapshot(contractsDir: string, document: ContractDocument): string
{
    const version = document.contractVersion;

    if (!version)
    {
        throw new ContractSnapshotError(
            'The contract declares no version, so a release cannot be named. '
            + 'Add .contractVersion("x.y.z") to the router before cutting one.',
        );
    }
    compareVersions(version, version);

    const dir = releasedDir(contractsDir);
    const file = join(dir, `${version}.json`);

    if (existsSync(file))
    {
        throw new ContractSnapshotError(
            `${file} already exists. A released version's contract is never rewritten — cut a new version instead.`,
        );
    }

    // Releases have to reach the newest snapshot in order. The gate compares
    // against the newest one alone, which is only sound while the chain has no
    // gaps — a snapshot filled in behind the newest one is never compared to
    // anything, and quietly widens what passes.
    const newest = newestSnapshot(contractsDir);

    if (newest && compareVersions(version, newest.version) <= 0)
    {
        throw new ContractSnapshotError(
            `${version} is not newer than the released ${newest.version}. `
            + 'The gate compares against the newest snapshot, so filling one in behind it would never be checked.',
        );
    }

    mkdirSync(dir, { recursive: true });

    const snapshot: ContractSnapshot = { version, sha256: stableDigest(document), document };
    writeFileSync(file, stableStringifyPretty(snapshot), 'utf-8');

    return file;
}

/** Read `contracts/current.json`. */
export function readCurrentDocument(contractsDir: string): ContractDocument
{
    const file = currentPath(contractsDir);

    try
    {
        return JSON.parse(readFileSync(file, 'utf-8')) as ContractDocument;
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);

        throw new ContractSnapshotError(
            `${file} could not be read: ${message}. Run the @spfn/core:contract generator first.`,
        );
    }
}

/** Write `contracts/current.json`. Returns true when the file changed. */
export function writeCurrentDocument(contractsDir: string, document: ContractDocument): boolean
{
    const file = currentPath(contractsDir);
    const content = stableStringifyPretty(document);
    const existing = existsSync(file) ? readFileSync(file, 'utf-8') : undefined;

    if (existing === content)
    {
        return false;
    }

    mkdirSync(contractsDir, { recursive: true });
    writeFileSync(file, content, 'utf-8');

    return true;
}
