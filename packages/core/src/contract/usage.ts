/**
 * Usage files — who still calls an operation
 *
 * A released app is compiled and shipped; the server cannot ask it what it
 * calls. So each released client writes down the operations it uses, and those
 * files are what a removal is judged against:
 * `contracts/usage/<platform>-<appVersion>.json`.
 *
 * The one rule this file exists to hold: **an unreadable file and "nobody calls
 * it" are not the same answer.** An empty scan result reading as a pass is how
 * a removal check quietly stops checking anything. Every failure to read is a
 * refusal that names the file.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** One released client's declared call list. */
export interface UsageRecord
{
    platform: string;
    appVersion: string;
    operations: string[];

    /** File this came from, for messages. */
    file: string;
}

export type UsageReadResult =
    | { decidable: true; records: UsageRecord[] }
    | { decidable: false; reason: string };

function parseRecord(file: string, raw: string): UsageRecord
{
    const parsed = JSON.parse(raw) as Partial<UsageRecord>;

    if (typeof parsed.platform !== 'string' || parsed.platform.length === 0)
    {
        throw new Error('"platform" must be a non-empty string');
    }

    if (typeof parsed.appVersion !== 'string' || parsed.appVersion.length === 0)
    {
        throw new Error('"appVersion" must be a non-empty string');
    }

    if (!Array.isArray(parsed.operations) || parsed.operations.some(name => typeof name !== 'string'))
    {
        throw new Error('"operations" must be an array of operation names');
    }

    return {
        platform: parsed.platform,
        appVersion: parsed.appVersion,
        operations: parsed.operations,
        file,
    };
}

/**
 * Read every usage file under `usageDir`.
 *
 * Returns undecidable — never an empty pass — when the directory is missing,
 * holds no usage file, or holds one that cannot be read.
 */
export function readUsageRecords(usageDir: string): UsageReadResult
{
    let entries: string[];

    try
    {
        if (!statSync(usageDir).isDirectory())
        {
            return { decidable: false, reason: `${usageDir} is not a directory` };
        }

        entries = readdirSync(usageDir).filter(name => name.endsWith('.json')).sort();
    }
    catch
    {
        return { decidable: false, reason: `${usageDir} does not exist` };
    }

    if (entries.length === 0)
    {
        return { decidable: false, reason: `${usageDir} holds no usage file` };
    }

    const records: UsageRecord[] = [];

    for (const entry of entries)
    {
        const file = join(usageDir, entry);

        try
        {
            records.push(parseRecord(file, readFileSync(file, 'utf-8')));
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : String(error);

            return { decidable: false, reason: `${file} could not be read: ${message}` };
        }
    }

    return { decidable: true, records };
}

/** Which released clients still call `operation`. */
export function callersOf(operation: string, records: UsageRecord[]): UsageRecord[]
{
    return records.filter(record => record.operations.includes(operation));
}
