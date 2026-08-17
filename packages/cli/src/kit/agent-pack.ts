/**
 * What the Agent Pack expanded to, recorded beside the project.
 *
 * The pack arrives as an archive and lands as a directory, which leaves drift
 * detection with a problem: the manifest declares one digest, and that digest
 * covers the archive, not any file on disk. Re-packing the directory to compare
 * archives would make drift depend on tar ordering and timestamps — the CLI
 * would report drift for a project nobody had touched.
 *
 * So the expansion writes down what it produced: one digest per file, taken at
 * the moment those bytes were proven against the manifest. Drift then asks the
 * question it can actually answer — is each of these files still the file the
 * release wrote — and a clean clone can ask it too, because the record is
 * committed alongside the lock.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const AGENT_PACK_RECORD_PATH = '.spfn/agent-pack.json';

export interface KitAgentPackRecordV1
{
    schemaVersion: 1;
    /** The release version of the pack, matching the manifest. */
    version: string;
    artifact: string;
    /** The digest the manifest declared over the archive. */
    targetDigest: string;
    /** Project-relative directory the tree was expanded into. */
    root: string;
    /** Project-relative path → digest, for every file the archive held. */
    files: Record<string, string>;
}

export function writeAgentPackRecord(projectDir: string, record: KitAgentPackRecordV1): void
{
    const file = join(projectDir, AGENT_PACK_RECORD_PATH);

    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(record, null, 4)}\n`, 'utf8');
}

/** The record this checkout holds, or null when the pack is not a tree. */
export function readAgentPackRecord(projectDir: string): KitAgentPackRecordV1 | null
{
    const file = join(projectDir, AGENT_PACK_RECORD_PATH);

    if (!existsSync(file))
    {
        return null;
    }

    try
    {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as KitAgentPackRecordV1;

        return parsed.schemaVersion === 1 && typeof parsed.files === 'object' && parsed.files !== null
            ? parsed
            : null;
    }
    catch
    {
        return null;
    }
}
