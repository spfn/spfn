/**
 * One write operation per project at a time (unit 06 section 5.3).
 *
 * The lock is a directory, because `mkdir` is the one filesystem call that
 * both creates and tests for existence in a single atomic step — two CLI
 * processes racing cannot both win it.
 *
 * The interesting part is not taking the lock, it is deciding what a lock left
 * behind by a dead process means. Section 5.3 forbids the usual shortcut of
 * deleting a lock because its PID is gone: the process may be gone while its
 * operation is still owed a resume, and silently stealing the lock would let a
 * second operation start on top of the first one's half-finished state. So a
 * stale lock is reconciled against the journal, and it is reclaimed only when
 * the journal agrees the work is over, or when the caller is resuming exactly
 * the operation the lock belongs to.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { KitError } from './errors.js';
import { kitPaths, type KitPaths } from './paths.js';
import { RESUMABLE_STATUSES, TERMINAL_STATUSES, type KitOperationJournalV1 } from './journal.js';

export interface KitLockOwner
{
    pid: number;
    hostname: string;
    operationId: string;
    command: string;
    acquiredAt: string;
}

export interface KitLockHandle
{
    owner: KitLockOwner;
    /** Whether a stale lock was reconciled and taken over. */
    reclaimed: boolean;
    release(): void;
}

export interface AcquireLockOptions
{
    root: string;
    operationId: string;
    /** The command taking the lock, e.g. `kit install`. Printed, never parsed. */
    command: string;
    now: string;
    /** The active journal, already read by the caller. */
    activeJournal: KitOperationJournalV1 | null;
    /** Whether a PID is a live process. Injected so tests need no real process. */
    isProcessAlive?: (pid: number) => boolean;
    /** True when the caller is resuming the operation the lock names. */
    resuming?: boolean;
    pid?: number;
    host?: string;
}

export function defaultIsProcessAlive(pid: number): boolean
{
    try
    {
        // Signal 0 tests for the process without touching it.
        process.kill(pid, 0);

        return true;
    }
    catch (error)
    {
        // EPERM means it exists and belongs to someone else.
        return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
}

export function acquireOperationLock(options: AcquireLockOptions): KitLockHandle
{
    const paths = kitPaths(options.root);
    const owner: KitLockOwner = {
        pid: options.pid ?? process.pid,
        hostname: options.host ?? hostname(),
        operationId: options.operationId,
        command: options.command,
        acquiredAt: options.now,
    };

    if (tryCreateLockDir(paths))
    {
        writeOwner(paths, owner);

        return handle(paths, owner, false);
    }

    reconcileStaleLock(options);
    rmSync(paths.lockDir, { recursive: true, force: true });

    if (!tryCreateLockDir(paths))
    {
        throw new KitError('KIT_OPERATION_ACTIVE', 'Another spfn kit operation took the project lock first.', {
            evidence: { lockDir: paths.lockDir },
            next: { command: 'spfn kit status --json', requiresHumanApproval: false },
        });
    }

    writeOwner(paths, owner);

    return handle(paths, owner, true);
}

/** Whoever holds the lock right now, or null when it is free. */
export function readLockOwner(root: string): KitLockOwner | null
{
    const paths = kitPaths(root);

    if (!existsSync(paths.lockOwnerFile))
    {
        return null;
    }

    try
    {
        const parsed = JSON.parse(readFileSync(paths.lockOwnerFile, 'utf8'));

        return typeof parsed?.pid === 'number' && typeof parsed?.operationId === 'string'
            ? parsed as KitLockOwner
            : null;
    }
    catch
    {
        return null;
    }
}

function reconcileStaleLock(options: AcquireLockOptions): void
{
    const existing = readLockOwner(options.root);
    const isAlive = options.isProcessAlive ?? defaultIsProcessAlive;
    const journal = options.activeJournal;
    const refuse = (reason: string, summary: string, next: string): never =>
    {
        throw new KitError('KIT_OPERATION_ACTIVE', summary, {
            evidence: {
                reason,
                heldBy: existing?.command ?? null,
                operationId: existing?.operationId ?? journal?.operationId ?? null,
            },
            next: { command: next, requiresHumanApproval: false },
        });
    };

    if (existing === null)
    {
        // An unreadable lock with no operation left to protect is debris.
        if (journal !== null && RESUMABLE_STATUSES.includes(journal.status))
        {
            refuse(
                'unreadable-lock-with-live-operation',
                'The project lock is unreadable and an operation is still open.',
                `spfn kit resume ${journal.operationId} --json`,
            );
        }

        return;
    }

    if (existing.hostname !== (options.host ?? hostname()))
    {
        // Another machine's PID says nothing about that machine's processes.
        refuse(
            'held-by-another-machine',
            'The project lock is held by another machine.',
            'spfn kit status --json',
        );
    }
    if (isAlive(existing.pid))
    {
        refuse(
            'operation-running',
            'Another spfn kit operation is running on this project.',
            'spfn kit status --json',
        );
    }
    if (journal === null || TERMINAL_STATUSES.includes(journal.status))
    {
        return;
    }
    if (options.resuming === true && journal.operationId === options.operationId)
    {
        return;
    }

    refuse(
        'operation-open',
        'A previous operation stopped without finishing and still owns this project.',
        `spfn kit resume ${journal.operationId} --json`,
    );
}

function tryCreateLockDir(paths: KitPaths): boolean
{
    try
    {
        mkdirSync(paths.operationsDir, { recursive: true });
        mkdirSync(paths.lockDir);

        return true;
    }
    catch (error)
    {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        {
            return false;
        }

        throw error;
    }
}

function writeOwner(paths: KitPaths, owner: KitLockOwner): void
{
    writeFileSync(paths.lockOwnerFile, `${JSON.stringify(owner, null, 4)}\n`, 'utf8');
}

function handle(paths: KitPaths, owner: KitLockOwner, reclaimed: boolean): KitLockHandle
{
    return {
        owner,
        reclaimed,
        release()
        {
            rmSync(paths.lockDir, { recursive: true, force: true });
        },
    };
}
