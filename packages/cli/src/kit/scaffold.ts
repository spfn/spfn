/**
 * Turning a release's scaffold archive into a project on disk.
 *
 * The archive is one artifact and it is verified as one: the manifest declares
 * an integrity for it, and nothing is expanded until the bytes that arrived
 * match. That ordering is the whole safety property — a half-expanded archive
 * that turns out to be wrong leaves files a later step has to guess about,
 * while an archive rejected before expansion leaves the directory exactly as it
 * was found.
 *
 * Two things the expansion will not do. It will not write outside the directory
 * it was given, which `readTar` enforces by refusing the paths that could. And
 * it will not overwrite a file that is already there: by the time the scaffold
 * runs, activation has already written the licence file, and an archive that
 * claims a path something else owns is a release bug, not a merge to resolve.
 *
 * The seed is the small, customer-owned part: the project's own name. It is
 * written after expansion rather than baked into the archive so that one
 * archive serves every project, and it is the only file this module edits
 * rather than creates.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KitError } from './errors.js';
import { expandArchive, treeDigestOf } from './expand.js';
import { assertIntegrity } from './http/registry.js';
import type { ArtifactPort, ScaffoldPort } from './ports.js';

/** What the manifest says about the release's scaffold. */
export interface KitScaffoldDescriptor
{
    recipeVersion: string;
    artifact: string;
    integrity: string;
}

/** Recorded beside the project so `check` can tell what produced the base. */
export interface KitScaffoldRecordV1
{
    schemaVersion: 1;
    recipeVersion: string;
    artifact: string;
    integrity: string;
    /** Digest over the expanded entry list — path and content, in order. */
    treeDigest: string;
    files: number;
}

export const SCAFFOLD_RECORD_PATH = '.spfn/scaffold.json';

export interface ScaffoldMaterializerOptions
{
    artifacts: ArtifactPort;
}

/**
 * The real `ScaffoldPort`: fetch, verify, expand, seed.
 *
 * `spfn create` is not shelled out to. A scaffold that came from a signed
 * release has to be the *release's* scaffold, and a locally installed CLI
 * generating its own approximation of one is how a project ends up subtly
 * unlike the release it claims to be.
 */
export class ArtifactScaffoldPort implements ScaffoldPort
{
    private readonly artifacts: ArtifactPort;

    constructor(options: ScaffoldMaterializerOptions)
    {
        this.artifacts = options.artifacts;
    }

    async createBase(request: { targetDir: string; name: string; scaffold?: KitScaffoldDescriptor }): Promise<void>
    {
        if (request.scaffold === undefined)
        {
            throw new KitError('KIT_MANIFEST_INVALID', 'The release declares no scaffold to create the project from.', {
                evidence: { targetDir: request.targetDir },
            });
        }

        const bytes = await this.artifacts.fetch(request.scaffold.artifact);

        assertIntegrity(bytes, request.scaffold.integrity, `scaffold ${request.scaffold.recipeVersion}`);

        // Re-entrant on purpose: an install that stopped after part of the
        // scaffold was written resumes through here, and the files already on
        // disk are compared rather than written again.
        const expanded = expandArchive(bytes, {
            targetDir: request.targetDir,
            artifact: request.scaffold.artifact,
        });

        seedProjectName(request.targetDir, request.name);
        writeScaffoldRecord(request.targetDir, {
            schemaVersion: 1,
            recipeVersion: request.scaffold.recipeVersion,
            artifact: request.scaffold.artifact,
            integrity: request.scaffold.integrity,
            treeDigest: treeDigestOf(expanded.files),
            files: Object.keys(expanded.files).length,
        });
    }
}

/**
 * The project's own name, written into the scaffold's `package.json`.
 *
 * Only the name. A scaffold whose `package.json` the CLI rewrote further would
 * stop being the release's scaffold, and every later digest check would be
 * comparing against something no release ever published.
 */
function seedProjectName(targetDir: string, name: string): void
{
    const file = join(targetDir, 'package.json');

    if (!existsSync(file))
    {
        return;
    }

    let parsed: Record<string, unknown>;

    try
    {
        parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    }
    catch
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'The release scaffold\'s package.json is not readable JSON.', {
            evidence: { path: 'package.json' },
        });
    }

    parsed.name = packageNameOf(name);
    writeFileSync(file, `${JSON.stringify(parsed, null, 4)}\n`, 'utf8');
}

/** A directory name as npm would accept it. */
export function packageNameOf(name: string): string
{
    const cleaned = name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .slice(0, 214);

    return cleaned.length === 0 ? 'kit-project' : cleaned;
}

function writeScaffoldRecord(targetDir: string, record: KitScaffoldRecordV1): void
{
    const file = join(targetDir, SCAFFOLD_RECORD_PATH);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(record, null, 4)}\n`, 'utf8');
}

/** Read back what produced this project's base, or null when unrecorded. */
export function readScaffoldRecord(targetDir: string): KitScaffoldRecordV1 | null
{
    const file = join(targetDir, SCAFFOLD_RECORD_PATH);

    if (!existsSync(file))
    {
        return null;
    }

    try
    {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as KitScaffoldRecordV1;

        return parsed.schemaVersion === 1 ? parsed : null;
    }
    catch
    {
        return null;
    }
}
