/**
 * The three provider adapters, and the one habit they share.
 *
 * Every adapter answers the same envelope and every one of them looks before it
 * writes. A `create` reads the provider first: if the named resource is already
 * there and its identity matches the target, the adapter reports `applied` with
 * that resource's ID and creates nothing. That single rule is what makes a
 * resume safe — an operation that stopped after GitHub said yes and before the
 * journal was written comes back, finds the repository, and carries on rather
 * than making a second one.
 *
 * The other half of the rule is `target-drift`. A resource with the right name
 * but the wrong identity — a different account, a different region — is not the
 * one that was approved, and reusing it would apply an approval to something a
 * person never saw. So it is refused, and nothing is written either way.
 *
 * Provider-specific judgement lives here and only here: which scopes a call
 * needs, which plan a region belongs to, what a healthy deployment looks like.
 * The envelope carries identity, approval and outcome, and stays ignorant of
 * all three services.
 */

import { digestOfJson, sha256Digest } from '../../digest.js';
import { KitError } from '../../errors.js';
import type { ProviderPort } from '../../ports.js';
import type { ProviderOperationEnvelopeV1 } from '../../provider.js';
import type { KitProviderId } from '../../validate.js';
import type { GithubApi, HealthProbe, SupabaseApi, VercelApi } from './api.js';

/** Failure codes the adapters report, in the envelope's own pattern. */
export const CLOUD_TARGET_DRIFT = 'CLOUD_TARGET_DRIFT';
export const CLOUD_RESOURCE_UNAVAILABLE = 'CLOUD_RESOURCE_UNAVAILABLE';
export const CLOUD_HEALTH_FAILED = 'CLOUD_HEALTH_FAILED';
export const CLOUD_ACTION_UNSUPPORTED = 'CLOUD_ACTION_UNSUPPORTED';

export interface AdapterContext
{
    /** Second-precision clock; the envelope's instants are second-precision. */
    now: () => string;
}

/**
 * The envelope, answered.
 *
 * `evidence` is merged rather than replaced so an adapter adds only the field
 * it learned, and the three the contract requires travel unchanged from the
 * request that carried them.
 */
function applied(
    envelope: ProviderOperationEnvelopeV1,
    context: AdapterContext,
    evidence: Record<string, unknown>,
): ProviderOperationEnvelopeV1
{
    // Empty optionals are dropped rather than carried: the evidence contract
    // patterns every optional field it defines, so an unset digest travelling
    // as `''` fails validation on the way back out — and a step that simply had
    // nothing to record is not a malformed envelope.
    const merged = Object.fromEntries(
        Object.entries({ ...(envelope.evidence ?? {}), ...evidence })
            .filter(([, value]) => value !== undefined && value !== ''),
    );

    return {
        ...envelope,
        status: 'applied',
        completedAt: context.now(),
        evidence: merged as ProviderOperationEnvelopeV1['evidence'],
    };
}

function refused(
    envelope: ProviderOperationEnvelopeV1,
    context: AdapterContext,
    status: 'target-drift' | 'failed',
    failureCode: string,
): ProviderOperationEnvelopeV1
{
    return { ...envelope, status, completedAt: context.now(), failureCode };
}

/** An adapter may only answer envelopes addressed to it. */
function assertOwn(envelope: ProviderOperationEnvelopeV1, provider: KitProviderId): void
{
    if (envelope.provider === provider && envelope.target.provider === provider)
    {
        return;
    }

    throw new KitError('KIT_MANIFEST_INVALID', 'A provider envelope reached the wrong adapter.', {
        evidence: { adapter: provider, envelope: envelope.provider, target: envelope.target.provider },
    });
}

/** The three fields the evidence contract requires, carried through. */
function baseEvidence(envelope: ProviderOperationEnvelopeV1): Record<string, unknown>
{
    return {
        planDigest: envelope.planDigest,
        approvalDigest: envelope.approvalDigest,
        sourceCommit: (envelope.evidence as { sourceCommit?: string } | undefined)?.sourceCommit,
    };
}

export class GithubProviderAdapter implements ProviderPort
{
    readonly id: KitProviderId = 'github';

    /** Every scope a repository operation needs, named rather than summarised. */
    static readonly SCOPES = ['metadata:read', 'contents:write', 'administration:write'] as const;

    private readonly api: GithubApi;
    private readonly context: AdapterContext;

    constructor(api: GithubApi, context: AdapterContext)
    {
        this.api = api;
        this.context = context;
    }

    async execute(raw: unknown): Promise<unknown>
    {
        const envelope = raw as ProviderOperationEnvelopeV1;

        assertOwn(envelope, this.id);

        if (envelope.action === 'create')
        {
            return this.createRepository(envelope);
        }
        if (envelope.action === 'deploy')
        {
            return this.pushSource(envelope);
        }
        if (envelope.action === 'configure')
        {
            return this.configureSecrets(envelope);
        }

        return refused(envelope, this.context, 'failed', CLOUD_ACTION_UNSUPPORTED);
    }

    /** Reads first: an existing repository is reused, never made again. */
    private async createRepository(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const owner = envelope.target.accountId;
        const name = envelope.target.resourceLabel ?? envelope.target.resourceId;
        const existing = await this.api.findRepository({ owner, name });

        if (existing !== null)
        {
            if (existing.owner !== owner)
            {
                return refused(envelope, this.context, 'target-drift', CLOUD_TARGET_DRIFT);
            }

            return applied(envelope, this.context, { ...baseEvidence(envelope), repositoryId: existing.id });
        }

        const created = await this.api.createRepository({ owner, name, private: true });

        return applied(envelope, this.context, { ...baseEvidence(envelope), repositoryId: created.id });
    }

    /** Pushing the commit the install already made. Idempotent by commit. */
    private async pushSource(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const commit = (envelope.evidence as { sourceCommit?: string } | undefined)?.sourceCommit;
        const repositoryId = envelope.target.resourceId;
        const repository = await this.api.findRepository({
            owner: envelope.target.accountId,
            name: envelope.target.resourceLabel ?? repositoryId,
        });

        if (repository === null)
        {
            return refused(envelope, this.context, 'failed', CLOUD_RESOURCE_UNAVAILABLE);
        }
        if (commit === undefined)
        {
            return refused(envelope, this.context, 'failed', CLOUD_RESOURCE_UNAVAILABLE);
        }
        if (repository.headCommit === commit)
        {
            return applied(envelope, this.context, { ...baseEvidence(envelope), repositoryId: repository.id });
        }

        const pushed = await this.api.pushBranch({
            repositoryId: repository.id,
            branch: repository.defaultBranch,
            commit,
        });

        return applied(envelope, this.context, { ...baseEvidence(envelope), repositoryId: pushed.id });
    }

    /**
     * Repository secrets, set by name.
     *
     * The values arrive in the request the operation built and go straight to
     * the provider. What comes back — and what any evidence could carry — is
     * names, because a name is the only half of a secret that is safe to keep.
     */
    private async configureSecrets(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const repositoryId = envelope.target.resourceId;
        const present = new Set(await this.api.listSecretNames({ repositoryId }));

        for (const [name, value] of Object.entries(this.pendingSecrets))
        {
            if (present.has(name))
            {
                continue;
            }

            await this.api.setSecret({ repositoryId, name, value });
        }

        return applied(envelope, this.context, { ...baseEvidence(envelope), repositoryId });
    }

    /**
     * Secrets waiting to be set, held for exactly one `configure` call.
     *
     * Not on the envelope, because an envelope is written to the journal.
     */
    private pendingSecrets: Record<string, string> = {};

    /** Hand the adapter the values one configure call will send. */
    stageSecrets(secrets: Record<string, string>): void
    {
        this.pendingSecrets = secrets;
    }
}

export class SupabaseProviderAdapter implements ProviderPort
{
    readonly id: KitProviderId = 'supabase';

    static readonly SCOPES = ['organizations:read', 'projects:write'] as const;

    private readonly api: SupabaseApi;
    private readonly context: AdapterContext;

    constructor(api: SupabaseApi, context: AdapterContext)
    {
        this.api = api;
        this.context = context;
    }

    async execute(raw: unknown): Promise<unknown>
    {
        const envelope = raw as ProviderOperationEnvelopeV1;

        assertOwn(envelope, this.id);

        if (envelope.action === 'create')
        {
            return this.createProject(envelope);
        }
        if (envelope.action === 'configure')
        {
            return this.runMigrations(envelope);
        }

        return refused(envelope, this.context, 'failed', CLOUD_ACTION_UNSUPPORTED);
    }

    private async createProject(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const organizationId = envelope.target.accountId;
        const name = envelope.target.resourceLabel ?? envelope.target.resourceId;
        const region = envelope.target.region ?? '';
        const existing = await this.api.findProject({ organizationId, name });

        if (existing !== null)
        {
            // A project of the right name in the wrong region is not the
            // project anyone approved: region is a price and a latency.
            if (existing.region !== region || existing.organizationId !== organizationId)
            {
                return refused(envelope, this.context, 'target-drift', CLOUD_TARGET_DRIFT);
            }

            return applied(envelope, this.context, { ...baseEvidence(envelope), supabaseProjectRef: existing.ref });
        }

        const created = await this.api.createProject({
            organizationId,
            name,
            region,
            plan: this.plan,
        });

        return applied(envelope, this.context, { ...baseEvidence(envelope), supabaseProjectRef: created.ref });
    }

    /**
     * Migrations, backed up first and applied only where they are missing.
     *
     * The applied set is read from the project rather than from the journal,
     * which is the point of doing it here: a resume asks the database what it
     * already has instead of believing a record written before it crashed.
     */
    private async runMigrations(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const projectRef = envelope.target.resourceId;
        const already = new Set(await this.api.appliedMigrations({ projectRef }));
        const pending = this.pendingMigrations.filter(name => !already.has(name));

        if (pending.length === 0)
        {
            return applied(envelope, this.context, {
                ...baseEvidence(envelope),
                supabaseProjectRef: projectRef,
                migrationDigest: this.migrationDigest,
            });
        }

        const backup = await this.api.createBackup({ projectRef });

        await this.api.applyMigrations({ projectRef, migrations: pending });

        return applied(envelope, this.context, {
            ...baseEvidence(envelope),
            supabaseProjectRef: projectRef,
            backupId: backup.backupId,
            migrationDigest: this.migrationDigest,
        });
    }

    private plan = 'free';

    private pendingMigrations: string[] = [];

    private migrationDigest = '';

    /** What one configure call should apply, and the digest that names it. */
    stageMigrations(migrations: string[], migrationDigest: string): void
    {
        this.pendingMigrations = migrations;
        this.migrationDigest = migrationDigest;
    }

    /** The plan a created project is put on. Named in the approval too. */
    usePlan(plan: string): void
    {
        this.plan = plan;
    }
}

export class VercelProviderAdapter implements ProviderPort
{
    readonly id: KitProviderId = 'vercel';

    static readonly SCOPES = ['team:read', 'project:read', 'project:write', 'deployment:write'] as const;

    private readonly api: VercelApi;
    private readonly health: HealthProbe;
    private readonly context: AdapterContext;

    constructor(api: VercelApi, health: HealthProbe, context: AdapterContext)
    {
        this.api = api;
        this.health = health;
        this.context = context;
    }

    async execute(raw: unknown): Promise<unknown>
    {
        const envelope = raw as ProviderOperationEnvelopeV1;

        assertOwn(envelope, this.id);

        if (envelope.action === 'create')
        {
            return this.createProject(envelope);
        }
        if (envelope.action === 'configure')
        {
            return this.configureEnvironment(envelope);
        }
        if (envelope.action === 'deploy')
        {
            return this.deployStaged(envelope);
        }
        if (envelope.action === 'bind')
        {
            return this.verifyStaged(envelope);
        }
        if (envelope.action === 'promote')
        {
            return this.promote(envelope);
        }

        return refused(envelope, this.context, 'failed', CLOUD_ACTION_UNSUPPORTED);
    }

    private async createProject(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const teamId = envelope.target.accountId;
        const name = envelope.target.resourceLabel ?? envelope.target.resourceId;
        const region = envelope.target.region ?? '';
        const existing = await this.api.findProject({ teamId, name });

        if (existing !== null)
        {
            if (existing.teamId !== teamId || existing.region !== region)
            {
                return refused(envelope, this.context, 'target-drift', CLOUD_TARGET_DRIFT);
            }

            return applied(envelope, this.context, { ...baseEvidence(envelope), vercelProjectId: existing.id });
        }

        const created = await this.api.createProject({ teamId, name, region });

        return applied(envelope, this.context, { ...baseEvidence(envelope), vercelProjectId: created.id });
    }

    private async configureEnvironment(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const projectId = envelope.target.resourceId;
        const present = new Set(await this.api.listEnvironmentNames({ projectId }));
        const missing = Object.entries(this.pendingEnvironment).filter(([key]) => !present.has(key));

        if (missing.length > 0)
        {
            await this.api.setEnvironment({
                projectId,
                variables: missing.map(([key, value]) => ({ key, value })),
            });
        }

        return applied(envelope, this.context, { ...baseEvidence(envelope), vercelProjectId: projectId });
    }

    /**
     * A build that is reachable and is not yet what visitors get.
     *
     * Keyed by commit: a resume that already produced a build for this exact
     * source finds it and adopts it, so a dropped connection costs a lookup
     * rather than a second deployment.
     */
    private async deployStaged(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const projectId = envelope.target.resourceId;
        const commit = (envelope.evidence as { sourceCommit?: string } | undefined)?.sourceCommit;

        if (commit === undefined)
        {
            return refused(envelope, this.context, 'failed', CLOUD_RESOURCE_UNAVAILABLE);
        }

        const existing = await this.api.findDeploymentForCommit({ projectId, commit });
        const deployment = existing ?? await this.api.createStagedDeployment({ projectId, commit });

        return applied(envelope, this.context, {
            ...baseEvidence(envelope),
            vercelProjectId: projectId,
            stagedDeploymentId: deployment.id,
            publicBaseUrl: deployment.url,
        });
    }

    /** The staged build has to answer before it is allowed to be production. */
    private async verifyStaged(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const stagedId = (envelope.evidence as { stagedDeploymentId?: string } | undefined)?.stagedDeploymentId;
        const deployment = stagedId === undefined ? null : await this.api.readDeployment({ deploymentId: stagedId });

        if (deployment === null || deployment.state === 'error')
        {
            return refused(envelope, this.context, 'failed', CLOUD_RESOURCE_UNAVAILABLE);
        }
        if (deployment.state !== 'ready')
        {
            return refused(envelope, this.context, 'failed', CLOUD_RESOURCE_UNAVAILABLE);
        }

        const probe = await this.health.check({ url: deployment.url });

        if (!probe.ok)
        {
            return refused(envelope, this.context, 'failed', CLOUD_HEALTH_FAILED);
        }

        return applied(envelope, this.context, {
            ...baseEvidence(envelope),
            vercelProjectId: envelope.target.resourceId,
            stagedDeploymentId: deployment.id,
            publicBaseUrl: deployment.url,
            healthEvidenceDigest: this.healthDigest(probe.status, probe.body),
        });
    }

    /**
     * Making the verified build the one visitors get.
     *
     * The deployment that *was* production is recorded before the switch, so a
     * rollback has somewhere to go back to that was read from the provider
     * rather than assumed.
     */
    private async promote(envelope: ProviderOperationEnvelopeV1): Promise<ProviderOperationEnvelopeV1>
    {
        const projectId = envelope.target.resourceId;
        const stagedId = (envelope.evidence as { stagedDeploymentId?: string } | undefined)?.stagedDeploymentId;
        const current = await this.api.currentProduction({ projectId });

        if (stagedId === undefined)
        {
            return refused(envelope, this.context, 'failed', CLOUD_RESOURCE_UNAVAILABLE);
        }
        if (current !== null && current.id === stagedId)
        {
            // Already promoted: a resume past this point changes nothing.
            return applied(envelope, this.context, {
                ...baseEvidence(envelope),
                vercelProjectId: projectId,
                stagedDeploymentId: stagedId,
                currentDeploymentId: current.id,
                publicBaseUrl: current.url,
            });
        }

        const promoted = await this.api.promote({ projectId, deploymentId: stagedId });

        return applied(envelope, this.context, {
            ...baseEvidence(envelope),
            vercelProjectId: projectId,
            stagedDeploymentId: stagedId,
            currentDeploymentId: promoted.id,
            publicBaseUrl: promoted.url,
        });
    }

    private pendingEnvironment: Record<string, string> = {};

    stageEnvironment(variables: Record<string, string>): void
    {
        this.pendingEnvironment = variables;
    }

    /** A digest over what the probe saw, so evidence carries no page body. */
    private healthDigest(status: number, body: string): string
    {
        return digestOfHealth(status, body);
    }
}

/** Exported for the operation layer, which records the same value. */
export function digestOfHealth(status: number, body: string): string
{
    return digestOfJson({ status, bodyDigest: sha256Digest(body) });
}
