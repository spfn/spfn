/**
 * `spfn kit plan` and `spfn kit update` — unit 06 sections 4.6 and 4.7.
 *
 * Everything that can refuse an update refuses it before the first write: a
 * dirty worktree, a drifted managed file, an expired entitlement, a missing
 * signed edge chain, an unapproved plan. That ordering is the point of the
 * preflight — once packages are installed and migrations applied, "stop" is a
 * much more expensive word.
 *
 * Approval is exact. A breaking release or an external effect makes the plan
 * require a human, and the only thing that satisfies that requirement is the
 * digest of the very plan being run. There is no blanket `--yes`, so an agent
 * cannot pre-authorise "whatever the update turns out to be".
 */

import { KitError, KIT_EXIT } from './../errors.js';
import { createEventSink, type KitOperationResult } from './../events.js';
import { detectManagedDrift, fileDigest } from './../drift.js';
import { JournalStore } from './../journal.js';
import { acquireOperationLock } from './../lock.js';
import { kitPaths } from './../paths.js';
import { writeOperationContext } from './../operation-context.js';
import { buildPlan, checkApproval, planDigest, type KitPlanV1 } from './../plan.js';
import { resolveUpdateEdges, type KitUpdateEdge } from './../manifest.js';
import { lockFromManifest, readLicenseFile, requireInstalledLock, writeInstalledLock } from './../installed-state.js';
import { executeOperation, type OperationStep, type StepOutcome } from './../runner.js';
import type { KitAdapters } from './../ports.js';
import {
    installFrozenGraph,
    materializeTargets,
    newOperationId,
    requireCredential,
    resolveRelease,
    runLocalGates,
} from './shared.js';

export interface UpdateRequest
{
    projectDir: string;
    /** An exact entitled release, or undefined for the newest entitled stable. */
    toRelease?: string;
    /** Produce the plan and write nothing. */
    planOnly?: boolean;
    approvedPlanDigest?: string;
    json: boolean;
    write?: (line: string) => void;
    resuming?: boolean;
}

export interface UpdatePlanResult extends KitOperationResult
{
    plan?: KitPlanV1;
    planDigest?: string;
}

export async function runUpdate(request: UpdateRequest, adapters: KitAdapters): Promise<UpdatePlanResult>
{
    const paths = kitPaths(request.projectDir);
    const journalStore = new JournalStore(request.projectDir, { now: () => adapters.clock.now() });
    const existing = journalStore.readActive();
    const secrets: string[] = [];
    const sink = createEventSink({ json: request.json, write: request.write, knownSecrets: secrets });
    const installed = requireInstalledLock(paths.lockFile);

    if (existing !== null && existing.type !== 'update')
    {
        throw new KitError('KIT_OPERATION_ACTIVE', 'This project has a different operation open.', {
            evidence: { operationId: existing.operationId, type: existing.type },
            next: { command: `spfn kit resume ${existing.operationId} --json`, requiresHumanApproval: false },
        });
    }

    // Drift and a dirty worktree are *start* gates. An update already under way
    // has passed them, and by then the managed files are meant to differ from
    // the installed lock — re-asking would refuse every resume. What guards a
    // resume instead is the checkpoint verification in the step engine.
    const starting = existing === null && request.resuming !== true;

    if (starting && !request.planOnly)
    {
        const drift = detectManagedDrift(request.projectDir, installed);

        if (drift.length > 0)
        {
            throw new KitError('KIT_MANAGED_DRIFT', 'A managed file has been edited, so this update cannot start.', {
                evidence: { firstPath: drift[0].path, files: drift.length },
                next: { command: 'spfn kit check --json', requiresHumanApproval: false },
            });
        }
        if (!(await adapters.git.isClean({ cwd: request.projectDir })))
        {
            throw new KitError('KIT_WORKTREE_DIRTY', 'The Git worktree has uncommitted changes.', {
                next: { command: 'spfn kit plan --json', requiresHumanApproval: false },
            });
        }
    }

    const { manifest, manifestUrl } = await resolveRelease(adapters, installed.catalogUrl, {
        release: request.toRelease,
    });

    if (manifest.version === installed.release)
    {
        return idempotent(sink, installed.release);
    }

    const entitlement = await adapters.license.entitlement({
        activationId: activationIdOf(paths.licenseFile),
        kitId: installed.kitId,
        release: manifest.version,
    });

    if (!entitlement.entitled)
    {
        throw new KitError('KIT_ENTITLEMENT_EXPIRED', 'This license does not currently cover that release.', {
            evidence: { release: manifest.version, reason: entitlement.reason ?? 'not-entitled' },
        });
    }

    const edges = resolveUpdateEdges(manifest.updateEdges, installed.release, manifest.version);
    const plan = buildPlan({
        operation: 'update',
        manifest,
        fromRelease: installed.release,
        installedPackages: installed.packages,
        installedManaged: [
            ...installed.managedResources.map(resource => ({ path: resource.path, targetDigest: resource.targetDigest })),
            { path: installed.agentPack.path, targetDigest: installed.agentPack.targetDigest },
        ],
        edges,
    });
    const digest = planDigest(plan);

    if (request.planOnly)
    {
        return planResult(sink, plan, digest);
    }

    const operationId = existing?.operationId
        ?? newOperationId('update', adapters.clock.now(), manifest.version.replace(/[^a-z0-9]/gi, ''));

    // Taken before the journal is written, so a project that is already busy is
    // refused without gaining a second operation record.
    const handle = acquireOperationLock({
        root: request.projectDir,
        operationId,
        command: 'kit update',
        now: adapters.clock.now(),
        activeJournal: existing,
        resuming: request.resuming === true,
    });
    // The lock is already held, so every refusal from here on gives it back.
    let journal;

    try
    {
        journal = existing ?? journalStore.create({
            operationId,
            type: 'update',
            kitId: manifest.kitId,
            sourceRelease: installed.release,
            targetRelease: manifest.version,
            manifestDigest: manifest.manifestDigest,
            planDigest: digest,
            phase: 'plan-approval',
            status: 'active',
            checkpoints: [{ id: 'catalog-verified', status: 'completed', completedAt: adapters.clock.now() }],
            externalRefs: {},
        });

        if (journal.planDigest !== digest)
        {
            throw new KitError('KIT_RESUME_MISMATCH', 'The open update was planned against a different plan.', {
                evidence: { journalPlan: journal.planDigest, currentPlan: digest },
                operationId: journal.operationId,
            });
        }

        writeOperationContext(request.projectDir, {
            schemaVersion: 1,
            operationId: journal.operationId,
            catalogUrl: installed.catalogUrl,
            manifestUrl,
            approvedPlanDigest: request.approvedPlanDigest,
        });
    }
    catch (error)
    {
        handle.release();

        throw error;
    }

    return executeOperation({
        journalStore,
        journal,
        lock: handle,
        sink,
        resuming: existing !== null,
        steps: updateSteps({ request, adapters, plan, digest, edges, manifest, manifestUrl, installed, secrets }),
        completedCode: 'KIT_UPDATE_COMPLETE',
        completedSummary: `The project is updated to ${manifest.version}. `
            + 'No deployment was configured, so nothing outside this machine changed.',
    });
}

interface UpdateStepOptions
{
    request: UpdateRequest;
    adapters: KitAdapters;
    plan: KitPlanV1;
    digest: string;
    edges: KitUpdateEdge[];
    manifest: Awaited<ReturnType<typeof resolveRelease>>['manifest'];
    manifestUrl: string;
    installed: ReturnType<typeof requireInstalledLock>;
    secrets: string[];
}

function updateSteps(options: UpdateStepOptions): OperationStep[]
{
    const { request, adapters, manifest, installed } = options;
    const projectDir = request.projectDir;
    const paths = kitPaths(projectDir);

    return [
        {
            checkpoint: 'plan-approved',
            phase: 'plan-approval',
            summary: 'Checking the approval this plan needs',
            async run(): Promise<StepOutcome>
            {
                const approval = checkApproval(options.plan, request.approvedPlanDigest);

                if (approval.satisfied)
                {
                    return { kind: 'done', evidence: { planDigest: approval.digest } };
                }

                return {
                    kind: 'waiting',
                    status: 'waiting-approval',
                    code: 'KIT_APPROVAL_REQUIRED',
                    summary: approval.reason === 'approval-mismatch'
                        ? 'The approval given is for a different plan than the one this update would run.'
                        : 'This update changes something a person has to approve.',
                    evidence: { reason: approval.reason ?? 'approval-required', releaseClass: options.plan.releaseClass },
                    next: {
                        command: `spfn kit update --to ${manifest.version} --approve-plan ${approval.digest} --json`,
                        requiresHumanApproval: true,
                        approvalDigest: approval.digest,
                    },
                };
            },
        },
        {
            checkpoint: 'materialize-complete',
            phase: 'materialize',
            summary: 'Applying the release\'s managed file changes',
            async run(): Promise<StepOutcome>
            {
                for (const change of options.plan.managedChanges)
                {
                    if (change.expectedFromDigest === null)
                    {
                        continue;
                    }

                    const actual = fileDigest(projectDir, change.path);

                    // The edge says which bytes it was authored against. If the
                    // file is not those bytes, the transform is being applied to
                    // something nobody tested it on.
                    if (actual !== change.expectedFromDigest)
                    {
                        throw new KitError('KIT_MANAGED_DRIFT', 'A managed file is not the version this update edge expects.', {
                            evidence: { path: change.path, expected: change.expectedFromDigest, actual: actual ?? 'missing' },
                        });
                    }
                }

                const changed = new Set(options.plan.managedChanges.map(change => change.path));
                const written = await materializeTargets(adapters, projectDir, [
                    ...manifest.managedResources,
                    manifest.agentPack,
                ]
                    .filter(resource => changed.has(resource.path))
                    .map(resource => ({
                        path: resource.path,
                        artifact: resource.artifact,
                        targetDigest: resource.targetDigest,
                    })));

                return { kind: 'done', evidence: written };
            },
            async verify()
            {
                // Only the files this plan touches, so the evidence compared on
                // a resume has the same shape as the evidence recorded.
                const digests: Record<string, string | null> = {};

                for (const change of options.plan.managedChanges)
                {
                    digests[change.path] = fileDigest(projectDir, change.path);
                }

                return { ok: true, evidence: digests };
            },
        },
        {
            checkpoint: 'install-frozen',
            phase: 'dependencies',
            summary: 'Installing the target release\'s exact dependency graph',
            async run(): Promise<StepOutcome>
            {
                const credential = await requireCredential(adapters, manifest.kitId, paths.licenseFile);

                options.secrets.push(credential.record.credential);

                const evidence = await installFrozenGraph(adapters, {
                    projectDir,
                    kitId: manifest.kitId,
                    activationId: credential.license.activationId,
                    localClientId: credential.license.localClientId,
                    credential: credential.record.credential,
                });

                return { kind: 'done', evidence: { attempts: evidence.attempts } };
            },
        },
        {
            checkpoint: 'migration-applied',
            phase: 'migration',
            summary: 'Applying the expand migrations this release needs',
            async run(context): Promise<StepOutcome>
            {
                const status = await adapters.database.status({ cwd: projectDir });

                if (!status.configured || !status.reachable)
                {
                    return {
                        kind: 'waiting',
                        status: 'waiting-cloud',
                        code: 'KIT_WAITING_DATABASE',
                        summary: 'The database this project migrates is not reachable right now.',
                        evidence: { configured: status.configured, reachable: status.reachable },
                        next: {
                            command: `spfn kit resume ${context.journal.operationId} --json`,
                            requiresHumanApproval: false,
                        },
                    };
                }
                if (status.pending.length === 0)
                {
                    return { kind: 'done', evidence: { applied: status.applied, pending: 0 } };
                }

                const result = await adapters.database.migrate({ cwd: projectDir, withBackup: true });

                if (!result.ok || result.pending.length > 0)
                {
                    throw new KitError('KIT_MIGRATION_FAILED', 'A package migration did not finish.', {
                        evidence: { pending: result.pending.length, detail: result.failure ?? null },
                        next: {
                            command: `spfn kit resume ${context.journal.operationId} --json`,
                            requiresHumanApproval: false,
                        },
                    });
                }

                return {
                    kind: 'done',
                    evidence: { applied: result.applied, pending: 0 },
                    externalRefs: result.backupId === undefined ? undefined : { backupId: result.backupId },
                };
            },
            async verify()
            {
                const status = await adapters.database.status({ cwd: projectDir });

                return status.pending.length === 0
                    ? { ok: true, evidence: { applied: status.applied, pending: 0 } }
                    : { ok: false, reason: 'database-has-pending-migrations' };
            },
        },
        {
            checkpoint: 'local-gates-passed',
            phase: 'gates',
            summary: 'Running the release gates and committing the update',
            async run(): Promise<StepOutcome>
            {
                const gates = await runLocalGates(adapters, projectDir, manifest.gates);

                writeInstalledLock(paths.lockFile, lockFromManifest(manifest, {
                    manifestUrl: options.manifestUrl,
                    catalogUrl: installed.catalogUrl,
                    cliVersion: adapters.cliVersion,
                    installedAt: adapters.clock.now(),
                }));

                const committed = await adapters.git.commit({
                    cwd: projectDir,
                    message: `chore: update ${manifest.kitId} to ${manifest.version}`,
                });

                return {
                    kind: 'done',
                    evidence: { gates, commit: committed.commit },
                    externalRefs: { sourceCommit: committed.commit },
                };
            },
        },
    ];
}

/**
 * An entitlement question needs the activation to ask about. A checkout with no
 * license file asks with an empty one and is told "not entitled", which is the
 * honest answer — the credential step names the missing file a moment later.
 */
function activationIdOf(licenseFile: string): string
{
    return readLicenseFile(licenseFile)?.activationId ?? '';
}

function idempotent(sink: ReturnType<typeof createEventSink>, release: string): UpdatePlanResult
{
    const summary = `Already on ${release}. Nothing to update.`;

    sink.emit({
        schemaVersion: 1,
        phase: 'preflight',
        status: 'completed',
        code: 'KIT_UPDATE_NOT_NEEDED',
        summary,
    });

    return {
        status: 'completed',
        exitCode: KIT_EXIT.OK,
        code: 'KIT_UPDATE_NOT_NEEDED',
        summary,
        phase: 'preflight',
        events: sink.events,
    };
}

function planResult(
    sink: ReturnType<typeof createEventSink>,
    plan: KitPlanV1,
    digest: string,
): UpdatePlanResult
{
    const summary = `Plan for ${plan.fromRelease ?? 'a new install'} → ${plan.toRelease}.`;

    sink.emit({
        schemaVersion: 1,
        phase: 'plan',
        status: 'completed',
        code: 'KIT_PLAN_READY',
        summary,
        evidence: {
            planDigest: digest,
            packageChanges: plan.packageChanges.length,
            managedChanges: plan.managedChanges.length,
            customerWrites: plan.customerWrites,
            requiresHumanApproval: plan.requiresHumanApproval,
        },
        next: plan.requiresHumanApproval
            ? {
                command: `spfn kit update --to ${plan.toRelease} --approve-plan ${digest} --json`,
                requiresHumanApproval: true,
                approvalDigest: digest,
            }
            : { command: `spfn kit update --to ${plan.toRelease} --json`, requiresHumanApproval: false },
    });

    return {
        status: 'completed',
        exitCode: KIT_EXIT.OK,
        code: 'KIT_PLAN_READY',
        summary,
        phase: 'plan',
        plan,
        planDigest: digest,
        events: sink.events,
    };
}
