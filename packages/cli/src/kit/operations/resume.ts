/**
 * `spfn kit resume` and `spfn kit abandon` — unit 06 sections 4.8 and 4.9.
 *
 * Resume dispatches back into the operation that stopped, with `resuming` set,
 * and from there the step engine does the real work: every completed checkpoint
 * is re-verified against the project as it is now, and the first one that no
 * longer holds ends the run with `KIT_RESUME_MISMATCH`.
 *
 * Abandon is the opposite promise. It records that nobody will finish this
 * operation and stops there: no file is deleted, no migration is reversed, no
 * commit is undone. What was already done outside this machine is *reported*,
 * because the person now has to decide what to do about it — silently
 * releasing a project slot would decide it for them.
 */

import { KitError, KIT_EXIT } from './../errors.js';
import { createEventSink, type KitOperationResult } from './../events.js';
import { JournalStore, TERMINAL_STATUSES } from './../journal.js';
import { acquireOperationLock } from './../lock.js';
import { clearOperationContext, readOperationContext } from './../operation-context.js';
import type { KitAdapters } from './../ports.js';
import { runInstall } from './install.js';
import { runRestore } from './restore.js';
import { runUpdate } from './update.js';

export interface ResumeRequest
{
    projectDir: string;
    operationId?: string;
    approvedPlanDigest?: string;
    /** Reads the license key without echoing it, if the resume needs one. */
    readLicenseKey: () => Promise<string>;
    json: boolean;
    write?: (line: string) => void;
}

export async function runResume(request: ResumeRequest, adapters: KitAdapters): Promise<KitOperationResult>
{
    const journalStore = new JournalStore(request.projectDir, { now: () => adapters.clock.now() });
    const journal = journalStore.readActive();
    const sink = createEventSink({ json: request.json, write: request.write });

    if (journal === null)
    {
        const summary = 'There is no operation to resume in this project.';

        sink.emit({
            schemaVersion: 1,
            phase: 'resume',
            status: 'completed',
            code: 'KIT_NOTHING_TO_RESUME',
            summary,
        });

        return {
            status: 'completed',
            exitCode: KIT_EXIT.OK,
            code: 'KIT_NOTHING_TO_RESUME',
            summary,
            phase: 'resume',
            events: sink.events,
        };
    }
    if (request.operationId !== undefined && request.operationId !== journal.operationId)
    {
        throw new KitError('KIT_RESUME_MISMATCH', 'That operation is not the one this project has open.', {
            evidence: { requested: request.operationId, open: journal.operationId },
        });
    }

    const context = readOperationContext(request.projectDir);

    if (journal.type === 'install')
    {
        if (context?.setupUrl === undefined)
        {
            throw new KitError('KIT_RESUME_MISMATCH', 'The open install did not record which setup link it started from.', {
                evidence: { operationId: journal.operationId },
            });
        }

        return runInstall({
            setupUrl: context.setupUrl,
            targetDir: request.projectDir,
            readLicenseKey: request.readLicenseKey,
            json: request.json,
            write: request.write,
            resuming: true,
        }, adapters);
    }
    if (journal.type === 'restore')
    {
        return runRestore({
            projectDir: request.projectDir,
            json: request.json,
            write: request.write,
            resuming: true,
        }, adapters);
    }
    if (journal.type === 'update')
    {
        return runUpdate({
            projectDir: request.projectDir,
            toRelease: journal.targetRelease,
            approvedPlanDigest: request.approvedPlanDigest ?? context?.approvedPlanDigest,
            json: request.json,
            write: request.write,
            resuming: true,
        }, adapters);
    }

    throw new KitError('KIT_RESUME_MISMATCH', `A ${journal.type} operation cannot be resumed by this build.`, {
        evidence: { operationId: journal.operationId, type: journal.type },
    });
}

export interface AbandonRequest
{
    projectDir: string;
    operationId?: string;
    json: boolean;
    write?: (line: string) => void;
}

export async function runAbandon(request: AbandonRequest, adapters: KitAdapters): Promise<KitOperationResult>
{
    const journalStore = new JournalStore(request.projectDir, { now: () => adapters.clock.now() });
    const journal = journalStore.readActive();
    const sink = createEventSink({ json: request.json, write: request.write });

    if (journal === null || TERMINAL_STATUSES.includes(journal.status))
    {
        const summary = 'There is no open operation to abandon.';

        sink.emit({ schemaVersion: 1, phase: 'abandon', status: 'completed', code: 'KIT_NOTHING_TO_ABANDON', summary });

        return {
            status: 'completed',
            exitCode: KIT_EXIT.OK,
            code: 'KIT_NOTHING_TO_ABANDON',
            summary,
            phase: 'abandon',
            events: sink.events,
        };
    }
    if (request.operationId !== undefined && request.operationId !== journal.operationId)
    {
        throw new KitError('KIT_RESUME_MISMATCH', 'That operation is not the one this project has open.', {
            evidence: { requested: request.operationId, open: journal.operationId },
        });
    }

    // Taking the lock first is what makes abandon safe: a live process still
    // working on this operation refuses it, and a lock left by a dead one is
    // reconciled and released here rather than outliving the journal.
    const handle = acquireOperationLock({
        root: request.projectDir,
        operationId: journal.operationId,
        command: 'kit abandon',
        now: adapters.clock.now(),
        activeJournal: journal,
        resuming: true,
    });
    const abandoned = journalStore.update(journal, { status: 'abandoned', phase: 'abandoned' });

    journalStore.archive(abandoned);
    clearOperationContext(request.projectDir);
    handle.release();

    // What survives this command, spelled out. An activation that exists still
    // exists; a commit that was made is still made.
    const residual = {
        activationId: abandoned.externalRefs.activationId ?? null,
        sourceCommit: abandoned.externalRefs.sourceCommit ?? null,
        pushedCommit: abandoned.externalRefs.pushedCommit ?? null,
        deploymentId: abandoned.externalRefs.deploymentId ?? null,
        backupId: abandoned.externalRefs.backupId ?? null,
    };
    const summary = 'The operation is recorded as abandoned. Nothing was deleted or rolled back.';
    // An activation that outlives its install is a decision left to a person:
    // the slot is still held, and only they can say whether to give it back.
    const next = residual.activationId === null
        ? undefined
        : { command: 'spfn kit deactivate --json', requiresHumanApproval: true };

    sink.emit({
        schemaVersion: 1,
        operationId: abandoned.operationId,
        phase: 'abandon',
        status: 'completed',
        code: 'KIT_OPERATION_ABANDONED',
        summary,
        evidence: residual,
        next,
    });

    return {
        status: 'completed',
        exitCode: KIT_EXIT.OK,
        code: 'KIT_OPERATION_ABANDONED',
        summary,
        operationId: abandoned.operationId,
        phase: 'abandon',
        evidence: residual,
        next,
        events: sink.events,
    };
}
