/**
 * Writing an archive's tree into a project, once or again.
 *
 * Two release artifacts arrive as archives rather than as single files — the
 * scaffold that becomes the project's base, and the Agent Pack that carries a
 * release's workflow — and both are written by this. One implementation,
 * because the safety rules are the same rules: an entry that would leave the
 * directory it was given, or that is a symlink or a device node, is refused by
 * the reader before a byte is written, and nothing here can undo that.
 *
 * What is *not* the same as a plain write is what happens when a file is
 * already there. A Kit operation can stop halfway — a network that dropped, a
 * machine that slept — and the resume that follows re-enters this code with
 * part of the tree already on disk. So an existing file is compared rather than
 * clobbered:
 *
 *   - the same bytes means this entry was already written by the run being
 *     resumed. It counts as done, and the resume continues past it;
 *   - different bytes means something else owns that path. It is refused, and
 *     the file is left exactly as it was found.
 *
 * The second rule is the whole reason this is a comparison and not an
 * overwrite. "Resume" and "overwrite whatever the customer put there" have to
 * be different operations, or an interrupted install becomes a way to lose
 * work.
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KitError } from './errors.js';
import { sha256Digest } from './digest.js';
import { readTar, TarFormatError, type TarEntry } from './tar.js';

export interface ExpandRequest
{
    /** The project the tree is written into. */
    targetDir: string;
    /** A project-relative directory the entries are written under. */
    root?: string;
    /** Names the archive in a refusal. Never a URL, never a credential. */
    artifact: string;
    /**
     * What to do about a file that is already there.
     *
     * `verify` (the default) is for an install and its resumes: identical
     * bytes count as done, anything else is refused with the file untouched.
     *
     * `replace` is for an update, and only after drift has been refused
     * upstream — at that point every managed file is known to hold the
     * previous release's bytes, so replacing them is applying the approved
     * plan rather than discarding somebody's edit.
     */
    existing?: 'verify' | 'replace';
}

export interface ExpandResult
{
    /** Project-relative path → digest, for every file the archive holds. */
    files: Record<string, string>;
    /** How many files this call created. */
    written: number;
    /** How many were already there with exactly these bytes. */
    matched: number;
}

/**
 * Expand a verified archive, and report what was already true.
 *
 * The bytes are expected to have been checked against the digest or integrity
 * the signed manifest declared *before* this is called. Nothing here decides
 * whether an archive is the right one; it decides only where its entries may
 * go and what to do about the ones already on disk.
 */
export function expandArchive(bytes: Uint8Array, request: ExpandRequest): ExpandResult
{
    const entries = readEntries(bytes, request.artifact);
    const files: Record<string, string> = {};
    let written = 0;
    let matched = 0;

    for (const entry of entries)
    {
        const relative = request.root === undefined || request.root.length === 0
            ? entry.path
            : `${request.root.replace(/\/+$/, '')}/${entry.path}`;
        const destination = join(request.targetDir, relative);

        if (entry.kind === 'directory')
        {
            mkdirSync(destination, { recursive: true });

            continue;
        }

        const digest = sha256Digest(entry.bytes);

        files[relative] = digest;

        if (existsSync(destination) && request.existing !== 'replace')
        {
            assertSameBytes(destination, relative, digest);
            matched += 1;

            continue;
        }

        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, entry.bytes, { mode: entry.mode === 0 ? 0o644 : entry.mode });
        written += 1;
    }

    return { files, written, matched };
}

/**
 * Whether the file already there is the file this entry would have written.
 *
 * A digest comparison rather than a byte comparison for the same reason every
 * other check in this CLI is one: the answer is the same, and the failure
 * report can carry it without carrying the file.
 */
function assertSameBytes(destination: string, relative: string, expected: string): void
{
    const actual = sha256Digest(readFileSync(destination));

    if (actual === expected)
    {
        return;
    }

    throw new KitError('KIT_TARGET_NOT_EMPTY', 'A file the release would write is already there with different contents.', {
        evidence: { path: relative, expected, actual },
        next: { command: 'spfn kit status --json', requiresHumanApproval: false },
    });
}

/** The archive's entries, or a refusal naming the entry that caused it. */
function readEntries(bytes: Uint8Array, artifact: string): TarEntry[]
{
    try
    {
        return readTar(bytes);
    }
    catch (error)
    {
        if (!(error instanceof TarFormatError))
        {
            throw error;
        }

        throw new KitError('KIT_MANIFEST_INVALID', 'A release archive cannot be expanded.', {
            evidence: { reason: error.reason, artifact, entryPath: error.entryPath },
        });
    }
}

/**
 * One digest over a whole expanded tree.
 *
 * Taken over the entries rather than over the archive, so two archives that
 * expand to the same files agree — what is recorded is what the project got,
 * not how it was packed.
 */
export function treeDigestOf(files: Record<string, string>): string
{
    return sha256Digest(Object.keys(files).sort().map(path => `${path} ${files[path]}`).join('\n'));
}
