/**
 * The operation journal — how a `spfn kit` operation survives a crash, a
 * closed laptop or an unanswered browser approval, and is picked up again.
 *
 * Unit 06 section 5.2 and the frozen `kit-operation-journal` contract. Two
 * rules do most of the work:
 *
 *   - Nothing is written that is not in the contract. Every write is validated
 *     first, and `additionalProperties: false` in the schema is what makes
 *     "the journal holds no secret" a property of the format rather than a
 *     habit of the code that writes it.
 *   - A checkpoint is a *hint*, not an authority. Section 4.8: a resume
 *     re-reads the real world and only then accepts the recorded phase.
 */

import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { digestOfJson } from './digest.js';
import { kitPaths, type KitPaths } from './paths.js';
import {
    validateOperationJournal,
    type KitCheckpointId,
    type KitOperationStatus,
    type KitOperationType,
} from './validate.js';

export interface KitCheckpoint
{
    id: KitCheckpointId;
    status: 'pending' | 'completed' | 'failed';
    evidenceDigest?: string;
    completedAt?: string;
    resumeAfter?: string;
}

export interface KitExternalRefs
{
    activationId?: string;
    backupId?: string;
    sourceCommit?: string;
    pushedCommit?: string;
    deploymentId?: string;
}

export interface KitOperationJournalV1
{
    schemaVersion: 1;
    operationId: string;
    type: KitOperationType;
    kitId: string;
    sourceRelease: string | null;
    targetRelease: string;
    manifestDigest: string;
    planDigest: string;
    phase: string;
    status: KitOperationStatus;
    checkpoints: KitCheckpoint[];
    externalRefs: KitExternalRefs;
    createdAt: string;
    updatedAt: string;
}

/**
 * Statuses that mean the operation is over and its lock may be reclaimed.
 *
 * `failed` is deliberately not one of them. Unit 06 table A keeps a failed
 * install resumable — its activation is real and its files are on disk — so a
 * failed journal still owns the project until someone resumes or abandons it.
 */
export const TERMINAL_STATUSES: readonly KitOperationStatus[] = ['completed', 'abandoned'];

/** Statuses that mean an operation is still owed something. */
export const RESUMABLE_STATUSES: readonly KitOperationStatus[] = [
    'active',
    'waiting-approval',
    'waiting-cloud',
    'waiting-settlement',
    'failed',
];

/** How many finished operations a project keeps on disk. */
export const HISTORY_LIMIT = 20;

export interface JournalStoreOptions
{
    now: () => string;
    historyLimit?: number;
}

/**
 * Reads and writes one project's journal.
 *
 * Every write goes through a temporary file and a rename, so a process killed
 * mid-write leaves the previous journal intact rather than a half-written one
 * that no resume could read.
 */
export class JournalStore
{
    private readonly paths: KitPaths;
    private readonly now: () => string;
    private readonly historyLimit: number;

    constructor(root: string, options: JournalStoreOptions)
    {
        this.paths = kitPaths(root);
        this.now = options.now;
        this.historyLimit = options.historyLimit ?? HISTORY_LIMIT;
    }

    readActive(): KitOperationJournalV1 | null
    {
        return readJournalFile(this.paths.activeJournal);
    }

    readHistory(operationId: string): KitOperationJournalV1 | null
    {
        return readJournalFile(join(this.paths.historyDir, `${operationId}.json`));
    }

    /** Every journal this project still has, newest update first. */
    listHistory(): KitOperationJournalV1[]
    {
        if (!existsSync(this.paths.historyDir))
        {
            return [];
        }

        return readdirSync(this.paths.historyDir)
            .filter(name => name.endsWith('.json'))
            .map(name => readJournalFile(join(this.paths.historyDir, name)))
            .filter((journal): journal is KitOperationJournalV1 => journal !== null)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }

    create(init: Omit<KitOperationJournalV1, 'schemaVersion' | 'createdAt' | 'updatedAt' | 'checkpoints'>
        & { checkpoints: KitCheckpoint[] }): KitOperationJournalV1
    {
        const timestamp = this.now();
        const journal: KitOperationJournalV1 = {
            schemaVersion: 1,
            ...init,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        this.write(journal);

        return journal;
    }

    /** Validate, then replace the active journal atomically. */
    write(journal: KitOperationJournalV1): void
    {
        const validation = validateOperationJournal(journal);

        if (!validation.valid)
        {
            // A journal the contract rejects must never reach disk: another
            // repository reads this file, and a field nobody agreed on is how a
            // secret would get in.
            const issue = validation.issues[0];

            throw new Error(`Refusing to write an operation journal that fails its contract at ${issue.pointer || '/'}: ${issue.message}`);
        }

        writeJsonAtomically(this.paths.activeJournal, journal);
    }

    /** Apply a change and stamp `updatedAt`. */
    update(
        journal: KitOperationJournalV1,
        change: Partial<Pick<KitOperationJournalV1, 'phase' | 'status' | 'externalRefs'>>,
    ): KitOperationJournalV1
    {
        const next: KitOperationJournalV1 = {
            ...journal,
            ...change,
            externalRefs: { ...journal.externalRefs, ...(change.externalRefs ?? {}) },
            updatedAt: this.now(),
        };

        this.write(next);

        return next;
    }

    /** Mark a checkpoint complete and pin the evidence it was completed on. */
    completeCheckpoint(
        journal: KitOperationJournalV1,
        id: KitCheckpointId,
        evidence?: unknown,
    ): KitOperationJournalV1
    {
        const completedAt = this.now();
        const checkpoints = upsertCheckpoint(journal.checkpoints, {
            id,
            status: 'completed',
            completedAt,
            ...(evidence === undefined ? {} : { evidenceDigest: digestOfJson(evidence) }),
        });
        const next: KitOperationJournalV1 = { ...journal, checkpoints, updatedAt: completedAt };

        this.write(next);

        return next;
    }

    failCheckpoint(journal: KitOperationJournalV1, id: KitCheckpointId): KitOperationJournalV1
    {
        const checkpoints = upsertCheckpoint(journal.checkpoints, { id, status: 'failed' });
        const next: KitOperationJournalV1 = {
            ...journal,
            checkpoints,
            status: 'failed',
            updatedAt: this.now(),
        };

        this.write(next);

        return next;
    }

    /** Move a finished operation into history and clear the active slot. */
    archive(journal: KitOperationJournalV1): void
    {
        writeJsonAtomically(join(this.paths.historyDir, `${journal.operationId}.json`), journal);
        rmSync(this.paths.activeJournal, { force: true });
        this.pruneHistory();
    }

    private pruneHistory(): void
    {
        if (!existsSync(this.paths.historyDir))
        {
            return;
        }

        const files = readdirSync(this.paths.historyDir)
            .filter(name => name.endsWith('.json'))
            .map(name => join(this.paths.historyDir, name))
            .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);

        for (const file of files.slice(this.historyLimit))
        {
            rmSync(file, { force: true });
        }
    }
}

export function checkpoint(journal: KitOperationJournalV1, id: KitCheckpointId): KitCheckpoint | undefined
{
    return journal.checkpoints.find(entry => entry.id === id);
}

export function isCheckpointComplete(journal: KitOperationJournalV1, id: KitCheckpointId): boolean
{
    return checkpoint(journal, id)?.status === 'completed';
}

function upsertCheckpoint(checkpoints: readonly KitCheckpoint[], entry: KitCheckpoint): KitCheckpoint[]
{
    const index = checkpoints.findIndex(candidate => candidate.id === entry.id);

    if (index === -1)
    {
        return [...checkpoints, entry];
    }

    const next = [...checkpoints];

    next[index] = { ...next[index], ...entry };

    return next;
}

function readJournalFile(file: string): KitOperationJournalV1 | null
{
    if (!existsSync(file))
    {
        return null;
    }

    try
    {
        const parsed = JSON.parse(readFileSync(file, 'utf8'));

        return validateOperationJournal(parsed).valid ? parsed as KitOperationJournalV1 : null;
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

    writeFileSync(temporary, `${JSON.stringify(value, null, 4)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporary, file);
}
