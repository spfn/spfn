/**
 * The ordered set of things a Kit deployment does to the outside world, and
 * the checkpoints it may be resumed from.
 *
 * Unit 09 section 6.2 gives the order and it is not negotiable: a repository
 * before a push, a database before a migration, an environment before a build,
 * a verified staged build before any traffic moves. Each step becomes one
 * provider envelope, and the envelope is what the journal records — identity,
 * approval and outcome, never a token, a password or a connection string.
 *
 * Two rules run through every step here:
 *
 *   - **nothing external happens without an approval digest.** The plan is
 *     presented, the digest is recorded, and every write carries it. A step
 *     that reaches a provider with `approvalDigest: null` is refused by the
 *     envelope gate before the adapter is called;
 *   - **a resume re-reads the provider.** The journal says what this machine
 *     believed; the provider says what is true. Where they disagree the
 *     provider wins, which is why every `create` in the adapters looks first
 *     and why a resumed run makes no second repository.
 *
 * Promotion is the one place the order exists for safety rather than for
 * dependency: a staged build is reachable and is not what visitors get, and it
 * only becomes production once every gate in section 9.3 has passed.
 */

import { digestOfJson } from '../digest.js';
import { KitError } from '../errors.js';
import { executeProviderOperation, type ProviderOperationEnvelopeV1 } from '../provider.js';
import type { ProviderPort } from '../ports.js';
import type { KitProviderId } from '../validate.js';
import { checkCloudApproval, type CloudPlanV1 } from './approval.js';

/** A journal checkpoint id from the frozen operation-journal contract. */
export type CloudCheckpointId =
    | 'plan-approved'
    | 'provider-provisioned'
    | 'migration-applied'
    | 'deploy-bootstrapped'
    | 'staged-verified'
    | 'promoted';

export interface CloudStep
{
    id: string;
    provider: KitProviderId;
    action: ProviderOperationEnvelopeV1['action'];
    effect: ProviderOperationEnvelopeV1['effect'];
    checkpoint: CloudCheckpointId;
    summary: string;
}

/**
 * Unit 09 section 6.2, as the steps this CLI performs.
 *
 * The browser authorization steps of that list are not here: they are the
 * relay's, and the CLI's part in them is holding the grant, not making it.
 * What is left is every write, in the order the document gives them.
 */
export const CLOUD_STEPS: readonly CloudStep[] = [
    {
        id: 'repository-create',
        provider: 'github',
        action: 'create',
        effect: 'external-write',
        checkpoint: 'provider-provisioned',
        summary: 'Creating the private repository, or binding the one already there',
    },
    {
        id: 'database-create',
        provider: 'supabase',
        action: 'create',
        effect: 'external-write',
        checkpoint: 'provider-provisioned',
        summary: 'Provisioning the database project on the approved plan and region',
    },
    {
        id: 'hosting-create',
        provider: 'vercel',
        action: 'create',
        effect: 'external-write',
        checkpoint: 'provider-provisioned',
        summary: 'Creating the hosting project on the approved plan and region',
    },
    {
        id: 'environment-configure',
        provider: 'vercel',
        action: 'configure',
        effect: 'external-write',
        checkpoint: 'provider-provisioned',
        summary: 'Writing the production environment this release needs',
    },
    {
        id: 'migration-apply',
        provider: 'supabase',
        action: 'configure',
        effect: 'external-write',
        checkpoint: 'migration-applied',
        summary: 'Backing the database up and applying the release\'s migrations',
    },
    {
        id: 'source-push',
        provider: 'github',
        action: 'deploy',
        effect: 'external-write',
        checkpoint: 'deploy-bootstrapped',
        summary: 'Pushing the exact source commit the local gates passed on',
    },
    {
        id: 'staged-build',
        provider: 'vercel',
        action: 'deploy',
        effect: 'external-write',
        checkpoint: 'deploy-bootstrapped',
        summary: 'Building the staged production deployment, which no visitor gets yet',
    },
    {
        id: 'staged-verify',
        provider: 'vercel',
        action: 'bind',
        effect: 'external-write',
        checkpoint: 'staged-verified',
        summary: 'Checking the staged build answers before any traffic moves',
    },
    {
        id: 'promote',
        provider: 'vercel',
        action: 'promote',
        effect: 'external-write',
        checkpoint: 'promoted',
        summary: 'Making the verified build the deployment visitors get',
    },
] as const;

export interface CloudTargetIdentity
{
    accountId: string;
    accountLabel?: string;
    resourceId: string;
    resourceLabel?: string;
    region?: string;
}

export interface CloudRunRequest
{
    operationId: string;
    activationId: string;
    plan: CloudPlanV1;
    /** The digest a person actually approved, if they have. */
    approvedDigest?: string;
    now: () => string;
    /** Stable identity per provider, as discovery established it. */
    targets: Record<KitProviderId, CloudTargetIdentity>;
    /** The commit the local gates passed on. Every write is against this. */
    sourceCommit: string;
    /** Scopes, per provider, exactly as the plan listed them. */
    scopes: Record<KitProviderId, readonly string[]>;
    /** Checkpoints a previous run already completed. */
    completed?: readonly string[];
    adapters: Record<KitProviderId, ProviderPort>;
    /** Answers the gates that decide whether a staged build may be promoted. */
    gates: StagedGates;
}

export interface CloudRunResult
{
    status: 'completed' | 'waiting-approval' | 'refused' | 'failed';
    code: string;
    /** Every envelope this run produced, in order, for the journal. */
    envelopes: ProviderOperationEnvelopeV1[];
    /** Steps skipped because a previous run had already completed them. */
    resumed: string[];
    evidence: Record<string, string | number | boolean | null>;
}

/**
 * The six checks section 9.3 puts between a staged build and production.
 *
 * Answered by the caller rather than computed here, because each one belongs
 * to something that already knows: the migration state to the database port,
 * the route inventory to the project, the canary to the deployed app.
 */
export interface StagedGates
{
    /** The commit the remote actually has. Compared, never assumed. */
    remoteCommit(): Promise<string | null>;
    /** How many migrations are still waiting. Promotion needs zero. */
    pendingMigrations(): Promise<number>;
    /** The protected detailed health probe of the staged deployment. */
    detailedHealth(): Promise<{ ok: boolean; reason?: string }>;
    /** Routes, primary action wiring and the data-quality canary. */
    routesAndCanary(): Promise<{ ok: boolean; reason?: string }>;
}

/** What each gate refusal is called, so a report can name the one that failed. */
export const GATE_FAILURE_CODES = {
    commitMismatch: 'CLOUD_COMMIT_MISMATCH',
    migrationsPending: 'CLOUD_MIGRATIONS_PENDING',
    detailedHealth: 'CLOUD_HEALTH_FAILED',
    routesOrCanary: 'CLOUD_VERIFY_FAILED',
} as const;

export interface GateOutcome
{
    ok: boolean;
    failureCode?: string;
    reason?: string;
}

/**
 * Whether a staged deployment has earned production traffic.
 *
 * Ordered cheapest-first and stopping at the first refusal: a build for the
 * wrong commit does not need its routes checked, and the report is clearer for
 * naming one reason rather than four.
 */
export async function verifyStagedGates(gates: StagedGates, sourceCommit: string): Promise<GateOutcome>
{
    const remote = await gates.remoteCommit();

    if (remote !== sourceCommit)
    {
        return { ok: false, failureCode: GATE_FAILURE_CODES.commitMismatch, reason: 'remote-commit-differs' };
    }

    const pending = await gates.pendingMigrations();

    if (pending > 0)
    {
        return { ok: false, failureCode: GATE_FAILURE_CODES.migrationsPending, reason: `${pending}-pending` };
    }

    const health = await gates.detailedHealth();

    if (!health.ok)
    {
        return { ok: false, failureCode: GATE_FAILURE_CODES.detailedHealth, reason: health.reason ?? 'unhealthy' };
    }

    const verified = await gates.routesAndCanary();

    if (!verified.ok)
    {
        return { ok: false, failureCode: GATE_FAILURE_CODES.routesOrCanary, reason: verified.reason ?? 'verify-failed' };
    }

    return { ok: true };
}

/**
 * Run the deployment, or stop at the first thing that says no.
 *
 * The approval is checked once, before anything: an operation that would be
 * refused at its first write is refused before it opens a connection. After
 * that every step is attempted in order, and the first non-`applied` envelope
 * ends the run with that envelope's own outcome — a drift is not a failure, an
 * expired approval is not a denial, and flattening them would lose the one
 * fact that says what to do next.
 */
export async function runCloudOperation(request: CloudRunRequest): Promise<CloudRunResult>
{
    const approval = checkCloudApproval(request.plan, request.approvedDigest, request.now());

    if (!approval.satisfied)
    {
        return {
            status: approval.reason === 'approval-expired' ? 'refused' : 'waiting-approval',
            code: approval.reason === 'approval-required' ? 'CLOUD_APPROVAL_REQUIRED' : approval.reason as string,
            envelopes: [],
            resumed: [],
            evidence: { approvalDigest: approval.digest, reason: approval.reason ?? null },
        };
    }

    const done = new Set(request.completed ?? []);
    const envelopes: ProviderOperationEnvelopeV1[] = [];
    const resumed: string[] = [];
    // Identity is what the provider returned, not what the plan called it.
    // Unit 09 section 1.4: a display name or a URL slug is not identity, so as
    // soon as a create hands back a stable ID the later steps address that.
    const targets: Record<KitProviderId, CloudTargetIdentity> = { ...request.targets };
    let evidence: Record<string, unknown> = {
        planDigest: request.plan.sourceTreeDigest,
        approvalDigest: approval.digest,
        sourceCommit: request.sourceCommit,
    };

    for (const step of CLOUD_STEPS)
    {
        if (done.has(step.id))
        {
            // Skipped, but never assumed: the adapter for the step that comes
            // next reads the provider, so a wrongly recorded checkpoint shows
            // up as a missing resource rather than as a silent success.
            resumed.push(step.id);

            continue;
        }
        if (step.id === 'promote')
        {
            const gate = await verifyStagedGates(request.gates, request.sourceCommit);

            if (!gate.ok)
            {
                return {
                    status: 'refused',
                    code: gate.failureCode as string,
                    envelopes,
                    resumed,
                    evidence: { step: step.id, reason: gate.reason ?? null },
                };
            }
        }

        const answered = await executeProviderOperation(
            request.adapters[step.provider],
            buildEnvelope(step, { ...request, targets }, approval.digest, evidence),
        );

        envelopes.push(answered);

        if (answered.status !== 'applied')
        {
            return {
                status: answered.status === 'target-drift' ? 'refused' : 'failed',
                code: answered.failureCode ?? answered.status,
                envelopes,
                resumed,
                evidence: { step: step.id, provider: step.provider, status: answered.status },
            };
        }

        evidence = { ...evidence, ...(answered.evidence ?? {}) };
        adoptStableIds(targets, evidence);
    }

    return {
        status: 'completed',
        code: 'CLOUD_DEPLOY_COMPLETE',
        envelopes,
        resumed,
        evidence: readableEvidence(evidence),
    };
}

/**
 * Replace each target's resource ID with the stable one the provider gave.
 *
 * The plan names a project the way a person would — by its name — because that
 * is what an approval has to be readable as. Every step after the create
 * addresses the ID instead, so a later rename cannot move the target and a
 * lookup cannot land on somebody else's project of the same name.
 */
function adoptStableIds(
    targets: Record<KitProviderId, CloudTargetIdentity>,
    evidence: Record<string, unknown>,
): void
{
    const learned: [KitProviderId, unknown][] = [
        ['github', evidence.repositoryId],
        ['supabase', evidence.supabaseProjectRef],
        ['vercel', evidence.vercelProjectId],
    ];

    for (const [provider, id] of learned)
    {
        if (typeof id === 'string' && id.length > 0)
        {
            targets[provider] = { ...targets[provider], resourceId: id };
        }
    }
}

/** One step, as the envelope the contract validates and the journal keeps. */
export function buildEnvelope(
    step: CloudStep,
    request: CloudRunRequest,
    approvalDigest: string,
    evidence: Record<string, unknown>,
): ProviderOperationEnvelopeV1
{
    const target = request.targets[step.provider];

    if (target === undefined)
    {
        throw new KitError('KIT_MANIFEST_INVALID', 'A deployment step has no target for its provider.', {
            evidence: { step: step.id, provider: step.provider },
        });
    }

    return {
        schemaVersion: 1,
        operationId: request.operationId,
        activationId: request.activationId,
        provider: step.provider,
        action: step.action,
        effect: step.effect,
        target: {
            provider: step.provider,
            accountId: target.accountId,
            ...(target.accountLabel === undefined ? {} : { accountLabel: target.accountLabel }),
            resourceId: target.resourceId,
            ...(target.resourceLabel === undefined ? {} : { resourceLabel: target.resourceLabel }),
            environment: 'production',
            ...(target.region === undefined ? {} : { region: target.region }),
        },
        planDigest: request.plan.sourceTreeDigest,
        approvalDigest,
        requestedScopes: [...request.scopes[step.provider]],
        status: 'planned',
        startedAt: request.now(),
        evidence: evidence as ProviderOperationEnvelopeV1['evidence'],
    };
}

/** The digest of what a checkpoint saw, for the journal's evidence field. */
export function checkpointEvidenceDigest(envelopes: readonly ProviderOperationEnvelopeV1[]): string
{
    return digestOfJson(envelopes.map(envelope => ({
        provider: envelope.provider,
        action: envelope.action,
        status: envelope.status,
        resourceId: envelope.target.resourceId,
    })));
}

/** Evidence flattened to the scalar shape a CLI event may carry. */
function readableEvidence(evidence: Record<string, unknown>): Record<string, string | number | boolean | null>
{
    const readable: Record<string, string | number | boolean | null> = {};

    for (const [key, value] of Object.entries(evidence))
    {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)
        {
            readable[key] = value;
        }
    }

    return readable;
}
