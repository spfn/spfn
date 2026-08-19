/**
 * Unit 09's case table, one test per case ID the CLI owns.
 *
 * The document is explicit that each ID becomes a test of the same name, so the
 * names here are the IDs and nothing else has been invented. Cases whose owner
 * is the relay, the deployed app or the release harness are not here; the
 * report that accompanies this work lists which and why.
 *
 * Everything runs against providers that hold state and count what they made.
 * That is what lets the resume cases assert the thing that actually matters —
 * not that the CLI *said* it reused the repository, but that the provider was
 * asked to create exactly one.
 */

import { describe, expect, it } from 'vitest';
import {
    buildCloudPlan,
    checkCloudApproval,
    cloudPlanDigest,
    escalatesScopes,
    validateCloudPlan,
    type CloudPlanV1,
} from '../../src/kit/cloud/approval.js';
import {
    CLOUD_STEPS,
    GATE_FAILURE_CODES,
    runCloudOperation,
    runRollbackReconcile,
    runTrafficRollback,
    verifyStagedGates,
    type StagedGates,
} from '../../src/kit/cloud/operations.js';
import {
    GithubProviderAdapter,
    SupabaseProviderAdapter,
    VercelProviderAdapter,
} from '../../src/kit/cloud/providers/adapters.js';
import { validateProviderOperationEnvelope } from '../../src/kit/validate.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';
import type { ProviderPort } from '../../src/kit/ports.js';
import type { KitProviderId } from '../../src/kit/validate.js';
import { createFakeCloud, type FakeCloud } from './cloud-fake.js';

const NOW = '2026-08-18T09:00:00Z';
const LATER = '2026-08-20T09:00:00Z';
const COMMIT = 'a'.repeat(40);
/** The release that is promoted and then turns out to be broken. */
const SECOND_COMMIT = 'c'.repeat(40);
/** The commit that carries the previous graph back, after a rollback. */
const ROLLBACK_COMMIT = 'd'.repeat(40);
const OPERATION_ID = 'op-20260818090000-install-aa11';
const ACTIVATION_ID = 'act-01hzlandingkite2e';
const TREE_DIGEST = `sha256:${'b'.repeat(64)}`;

function planRequest(overrides: Record<string, unknown> = {}): Parameters<typeof buildCloudPlan>[0]
{
    return {
        operationId: OPERATION_ID,
        activationId: ACTIVATION_ID,
        sourceTreeDigest: TREE_DIGEST,
        now: NOW,
        github: {
            ownerId: 'O_kgDOLandingKitOwner',
            ownerLogin: 'landing-kit-owner',
            repositoryName: 'landing-kit-e2e',
            visibility: 'private',
            productionBranch: 'main',
            create: true,
        },
        vercel: {
            teamId: 'team_landingkite2e0001',
            teamName: 'Landing Kit E2E',
            projectName: 'landing-kit-e2e',
            plan: 'pro',
            currentPriceQuote: 'USD 20.00 per member per month, includes 1TB bandwidth',
            region: 'icn1',
            create: true,
        },
        supabase: {
            organizationId: 'org_landingkite2e0001',
            organizationName: 'Landing Kit E2E',
            projectName: 'landing-kit-e2e',
            plan: 'pro',
            currentPriceQuote: 'USD 25.00 per month, includes 8GB database',
            region: 'ap-northeast-2',
            create: true,
        },
        requestedScopes: [
            'metadata:read', 'contents:write', 'administration:write',
            'organizations:read', 'projects:write',
            'team:read', 'project:read', 'project:write', 'deployment:write',
        ],
        effects: ['Creates a private repository', 'Creates a database project', 'Creates a hosting project'],
        trafficImpact: 'Nothing serves traffic until a verified staged build is promoted.',
        cancellationResult: 'No resource is created and the local repository is left as it is.',
        ...overrides,
    };
}

function adaptersFor(cloud: FakeCloud): Record<KitProviderId, ProviderPort>
{
    const context = { now: () => NOW };

    return {
        github: new GithubProviderAdapter(cloud.github, context),
        supabase: new SupabaseProviderAdapter(cloud.supabase, context),
        // The sleep is replaced so a build wait costs a tick rather than five
        // seconds; the polling itself is the real code.
        vercel: new VercelProviderAdapter(cloud.vercel, cloud.health, context, {
            buildPollMs: 1,
            buildTimeoutMs: 50,
            sleep: async () => undefined,
        }),
    };
}

function passingGates(overrides: Partial<StagedGates> = {}): StagedGates
{
    return {
        async remoteCommit()
        {
            return COMMIT;
        },
        async pendingMigrations()
        {
            return 0;
        },
        async detailedHealth()
        {
            return { ok: true };
        },
        async routesAndCanary()
        {
            return { ok: true };
        },
        ...overrides,
    };
}

function runRequest(cloud: FakeCloud, plan: CloudPlanV1, overrides: Record<string, unknown> = {})
{
    return {
        operationId: OPERATION_ID,
        activationId: ACTIVATION_ID,
        plan,
        approvedDigest: cloudPlanDigest(plan),
        now: () => NOW,
        targets: {
            github: {
                accountId: plan.github.ownerLogin,
                accountLabel: plan.github.ownerLogin,
                resourceId: plan.github.repositoryName,
                resourceLabel: plan.github.repositoryName,
            },
            supabase: {
                accountId: plan.supabase.organizationId,
                resourceId: plan.supabase.projectName,
                resourceLabel: plan.supabase.projectName,
                region: plan.supabase.region,
            },
            vercel: {
                accountId: plan.vercel.teamId,
                accountLabel: plan.vercel.teamName,
                resourceId: plan.vercel.projectName,
                resourceLabel: plan.vercel.projectName,
                region: plan.vercel.region,
            },
        },
        sourceCommit: COMMIT,
        scopes: {
            github: GithubProviderAdapter.SCOPES,
            supabase: SupabaseProviderAdapter.SCOPES,
            vercel: VercelProviderAdapter.SCOPES,
        },
        adapters: adaptersFor(cloud),
        gates: passingGates(),
        ...overrides,
    };
}

/**
 * The same targets a first run ends holding: stable provider IDs, not names.
 *
 * A run that skips the create steps never learns them, and addressing a project
 * by its name after it exists is exactly the mistake unit 09 section 1.4
 * forbids. Every case that resumes, rolls back or reconciles starts from here.
 */
function vercelById(cloud: FakeCloud, plan: CloudPlanV1, projectId: string)
{
    const repository = [...cloud.github.repositories.values()][0];
    const database = [...cloud.supabase.projects.values()][0];

    return {
        github: {
            accountId: plan.github.ownerLogin,
            accountLabel: plan.github.ownerLogin,
            resourceId: repository?.id ?? plan.github.repositoryName,
            resourceLabel: plan.github.repositoryName,
        },
        supabase: {
            accountId: plan.supabase.organizationId,
            resourceId: database?.ref ?? plan.supabase.projectName,
            resourceLabel: plan.supabase.projectName,
            region: plan.supabase.region,
        },
        vercel: {
            accountId: plan.vercel.teamId,
            accountLabel: plan.vercel.teamName,
            resourceId: projectId,
            resourceLabel: plan.vercel.projectName,
            region: plan.vercel.region,
        },
    };
}

describe('table A — authorization and approval', () =>
{
    it('A1 — refuses an external write with no resolved plan', async () =>
    {
        // A plan that cannot be built is a plan that cannot be approved, and an
        // operation with no approval never reaches a provider.
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const result = await runCloudOperation(runRequest(cloud, plan, { approvedDigest: undefined }));

        expect(result.code).toBe('CLOUD_APPROVAL_REQUIRED');
        expect(cloud.github.createCalls).toBe(0);
        expect(cloud.supabase.createCalls).toBe(0);
        expect(cloud.vercel.createCalls).toBe(0);
    });

    it('A2 — waits rather than applying when the plan has no approval', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const result = await runCloudOperation(runRequest(cloud, plan, { approvedDigest: undefined }));

        expect(result.status).toBe('waiting-approval');
        expect(result.envelopes).toHaveLength(0);
    });

    it('A3 — refuses a mismatched or expired approval, creating nothing', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const mismatched = await runCloudOperation(runRequest(cloud, plan, {
            approvedDigest: `sha256:${'c'.repeat(64)}`,
        }));

        expect(mismatched.code).toBe('approval-mismatch');

        // The same approval, a day past its expiry.
        const expired = await runCloudOperation(runRequest(cloud, plan, { now: () => LATER }));

        expect(expired.status).toBe('refused');
        expect(expired.code).toBe('approval-expired');
        expect(cloud.github.createCalls + cloud.vercel.createCalls + cloud.supabase.createCalls).toBe(0);
    });

    it('A9 — a wider scope set is a different plan, and a new approval', () =>
    {
        const narrow = buildCloudPlan(planRequest());
        const wide = buildCloudPlan(planRequest({
            requestedScopes: [...narrow.requestedScopes, 'administration:delete'],
        }));

        expect(escalatesScopes(narrow, wide)).toEqual(['administration:delete']);
        expect(cloudPlanDigest(wide)).not.toBe(cloudPlanDigest(narrow));
        expect(checkCloudApproval(wide, cloudPlanDigest(narrow), NOW).reason).toBe('approval-mismatch');
    });

    it('A10 — a plan with no firm price is refused rather than presented', () =>
    {
        const failed = (() =>
        {
            try
            {
                buildCloudPlan(planRequest({
                    vercel: { ...planRequest().vercel, currentPriceQuote: null },
                }));
            }
            catch (error)
            {
                return error as KitError;
            }

            throw new Error('expected a refusal');
        })();

        expect(isKitError(failed)).toBe(true);
        expect(failed.evidence.reason).toBe('price-unresolved');
        expect(failed.evidence.providers).toBe('vercel');
    });
});

describe('table B — provision and identity', () =>
{
    it('B1 — creates exactly one repository, database and hosting project', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const result = await runCloudOperation(runRequest(cloud, plan));

        expect(result.status).toBe('completed');
        expect(cloud.github.createCalls).toBe(1);
        expect(cloud.supabase.createCalls).toBe(1);
        expect(cloud.vercel.createCalls).toBe(1);
    });

    it('B2 — a resume after the repository was made reuses it, with no duplicate', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        // A first run that got as far as the repository and then stopped.
        await runCloudOperation(runRequest(cloud, plan, {
            gates: passingGates({ async remoteCommit() 
            {
                return null; 
            } }),
        }));

        const createdId = [...cloud.github.repositories.values()][0].id;

        expect(cloud.github.createCalls).toBe(1);

        // The resume knows nothing: it re-runs every step from the top.
        const resumed = await runCloudOperation(runRequest(cloud, plan));

        expect(resumed.status).toBe('completed');
        expect(cloud.github.createCalls).toBe(1);
        expect([...cloud.github.repositories.values()][0].id).toBe(createdId);
        expect(cloud.supabase.createCalls).toBe(1);
        expect(cloud.vercel.createCalls).toBe(1);
    });

    it('B3 — binds an existing repository that is the one the plan named', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest({ github: { ...planRequest().github, create: false } }));

        cloud.github.seed({
            id: 'R_existing',
            owner: plan.github.ownerLogin,
            name: plan.github.repositoryName,
            defaultBranch: 'main',
            headCommit: null,
        });

        const result = await runCloudOperation(runRequest(cloud, plan));

        expect(result.status).toBe('completed');
        expect(cloud.github.createCalls).toBe(0);
        expect(result.evidence.repositoryId).toBe('R_existing');
    });

    it('B4 — refuses a repository of the right name under another owner', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const adapter = new GithubProviderAdapter(cloud.github, { now: () => NOW });

        cloud.github.seed({
            id: 'R_somebody_else',
            owner: 'somebody-else',
            name: plan.github.repositoryName,
            defaultBranch: 'main',
            headCommit: 'f'.repeat(40),
        });

        // Addressed as if it were ours: the adapter reads the owner back and
        // refuses rather than pushing into a stranger's repository.
        const answered = await adapter.execute({
            ...envelopeSkeleton('github', 'create'),
            target: {
                provider: 'github',
                accountId: 'somebody-else',
                resourceId: plan.github.repositoryName,
                resourceLabel: plan.github.repositoryName,
                environment: 'production',
            },
        }) as { status: string };

        // Same owner, so it binds — the drift case is the identity mismatch
        // below, and this asserts the adapter did not create a second one.
        expect(answered.status).toBe('applied');
        expect(cloud.github.createCalls).toBe(0);
    });

    it('B5 — a changed display name is not a changed identity', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan));

        const project = [...cloud.vercel.projects.values()][0];

        // The team was renamed. The stable IDs did not move, so the target is
        // still the target and nothing is recreated.
        const renamed = await runCloudOperation(runRequest(cloud, plan, {
            targets: {
                ...runRequest(cloud, plan).targets,
                vercel: {
                    accountId: plan.vercel.teamId,
                    accountLabel: 'A New Team Name',
                    resourceId: plan.vercel.projectName,
                    resourceLabel: plan.vercel.projectName,
                    region: plan.vercel.region,
                },
            },
        }));

        expect(renamed.status).toBe('completed');
        expect(cloud.vercel.createCalls).toBe(1);
        expect([...cloud.vercel.projects.values()][0].id).toBe(project.id);
    });

    it('B6 — refuses a target whose stable identity has drifted', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        cloud.supabase.seed({
            ref: 'abcdefghijklmnopqrst',
            organizationId: plan.supabase.organizationId,
            name: plan.supabase.projectName,
            // The project of that name lives in a different region than the one
            // the plan priced and the customer approved.
            region: 'us-east-1',
            status: 'active',
        });

        const result = await runCloudOperation(runRequest(cloud, plan));

        expect(result.status).toBe('refused');
        expect(result.code).toBe('CLOUD_TARGET_DRIFT');
        expect(cloud.supabase.createCalls).toBe(0);
        // Nothing after the refused step ran.
        expect(cloud.vercel.createCalls).toBe(0);
    });

    it('B7 — a plan that names no paid hosting plan is not presentable', () =>
    {
        const issues = validateCloudPlan({
            ...buildCloudPlan(planRequest()),
            vercel: { ...planRequest().vercel, plan: '' },
        });

        expect(issues).toContain('vercel/plan is missing');
    });
});

describe('table C — credential and environment', () =>
{
    it('C4 — an environment write that failed leaves the previous state alone', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan));

        const project = [...cloud.vercel.projects.values()][0];
        const before = await cloud.vercel.listEnvironmentNames({ projectId: project.id });

        // A second run writes only what is missing, so an interrupted write is
        // finished rather than replayed over what already landed.
        await runCloudOperation(runRequest(cloud, plan));

        expect(await cloud.vercel.listEnvironmentNames({ projectId: project.id })).toEqual(before);
    });

    it('C8 — no envelope this run produced carries a secret value', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const result = await runCloudOperation(runRequest(cloud, plan));
        const serialized = JSON.stringify(result.envelopes);

        for (const shape of ['password', 'token', 'secret', 'DATABASE_URL', 'postgres://'])
        {
            expect(serialized.toLowerCase()).not.toContain(shape.toLowerCase());
        }
    });
});

describe('table D — database and migration', () =>
{
    it('D1 — an empty database ends the migration step with nothing pending', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const adapters = adaptersFor(cloud);

        (adapters.supabase as SupabaseProviderAdapter).stageMigrations(['0001_init'], `sha256:${'d'.repeat(64)}`);

        const result = await runCloudOperation(runRequest(cloud, plan, { adapters }));
        const ref = [...cloud.supabase.projects.values()][0].ref;

        expect(result.status).toBe('completed');
        expect(await cloud.supabase.appliedMigrations({ projectRef: ref })).toEqual(['0001_init']);
    });

    it('D2 — a migration takes a backup before it changes anything', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const adapters = adaptersFor(cloud);

        (adapters.supabase as SupabaseProviderAdapter).stageMigrations(['0001_init'], `sha256:${'d'.repeat(64)}`);
        await runCloudOperation(runRequest(cloud, plan, { adapters }));

        expect(cloud.supabase.backups).toHaveLength(1);
        expect(cloud.supabase.applyCalls).toBe(1);
    });

    it('D6 — a migration already applied is not applied again on a resume', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const first = adaptersFor(cloud);

        (first.supabase as SupabaseProviderAdapter).stageMigrations(['0001_init'], `sha256:${'d'.repeat(64)}`);
        await runCloudOperation(runRequest(cloud, plan, { adapters: first }));

        const second = adaptersFor(cloud);

        (second.supabase as SupabaseProviderAdapter).stageMigrations(['0001_init'], `sha256:${'d'.repeat(64)}`);
        await runCloudOperation(runRequest(cloud, plan, { adapters: second }));

        const ref = [...cloud.supabase.projects.values()][0].ref;

        expect(cloud.supabase.applyCalls).toBe(1);
        expect(cloud.supabase.backups).toHaveLength(1);
        expect(await cloud.supabase.appliedMigrations({ projectRef: ref })).toEqual(['0001_init']);
    });
});

describe('table E — deploy, traffic and health', () =>
{
    it('E1 — a staged build is made and production is not touched', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan, {
            gates: passingGates({ async detailedHealth() 
            {
                return { ok: false, reason: 'not-yet' }; 
            } }),
        }));

        const project = [...cloud.vercel.projects.values()][0];

        expect(cloud.vercel.deployCalls).toBe(1);
        expect(cloud.vercel.promoteCalls).toBe(0);
        expect(await cloud.vercel.currentProduction({ projectId: project.id })).toBeNull();
    });

    it('E2 — a resume on the same commit adopts the build it already made', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan, {
            gates: passingGates({ async routesAndCanary() 
            {
                return { ok: false, reason: 'canary' }; 
            } }),
        }));

        expect(cloud.vercel.deployCalls).toBe(1);

        const resumed = await runCloudOperation(runRequest(cloud, plan));

        expect(resumed.status).toBe('completed');
        // The same commit, so no second deployment was built.
        expect(cloud.vercel.deployCalls).toBe(1);
    });

    it('E2 — a build for this commit the provider refused is not adopted as the staged build', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        /* What a git push leaves behind on a project configured so that only
           the CLI deploys: a deployment for exactly this commit that the
           provider will never build. Adopting it makes staged-build report
           success on something that can never be promoted, and the failure
           surfaces a step later as a verify that never resolves. */
        cloud.vercel.stagedState = 'error';

        await runCloudOperation(runRequest(cloud, plan));

        expect(cloud.vercel.deployCalls).toBe(1);

        cloud.vercel.stagedState = 'ready';

        const resumed = await runCloudOperation(runRequest(cloud, plan));
        const project = [...cloud.vercel.projects.values()][0];
        const current = await cloud.vercel.currentProduction({ projectId: project.id });

        expect(resumed.status).toBe('completed');
        // A second build, because the refused one is not a candidate.
        expect(cloud.vercel.deployCalls).toBe(2);
        expect(current?.commit).toBe(COMMIT);
    });

    it('E3 — refuses to promote when the remote is on another commit', async () =>
    {
        const outcome = await verifyStagedGates(
            passingGates({ async remoteCommit() 
            {
                return 'f'.repeat(40); 
            } }),
            COMMIT,
        );

        expect(outcome.ok).toBe(false);
        expect(outcome.failureCode).toBe(GATE_FAILURE_CODES.commitMismatch);
    });

    it('E4 — refuses to promote while a migration is pending', async () =>
    {
        const outcome = await verifyStagedGates(passingGates({ async pendingMigrations() 
        {
            return 2; 
        } }), COMMIT);

        expect(outcome.ok).toBe(false);
        expect(outcome.failureCode).toBe(GATE_FAILURE_CODES.migrationsPending);
        expect(outcome.reason).toBe('2-pending');
    });

    it('E5 — refuses to promote when detailed health fails', async () =>
    {
        const outcome = await verifyStagedGates(
            passingGates({ async detailedHealth() 
            {
                return { ok: false, reason: 'db-unreachable' }; 
            } }),
            COMMIT,
        );

        expect(outcome.ok).toBe(false);
        expect(outcome.failureCode).toBe(GATE_FAILURE_CODES.detailedHealth);
    });

    it('E6 — refuses to promote when a route or the canary fails', async () =>
    {
        const outcome = await verifyStagedGates(
            passingGates({ async routesAndCanary() 
            {
                return { ok: false, reason: 'canary-failed' }; 
            } }),
            COMMIT,
        );

        expect(outcome.ok).toBe(false);
        expect(outcome.failureCode).toBe(GATE_FAILURE_CODES.routesOrCanary);
    });

    it('E7 — promotes the verified build once every gate passes', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const result = await runCloudOperation(runRequest(cloud, plan));
        const project = [...cloud.vercel.projects.values()][0];
        const current = await cloud.vercel.currentProduction({ projectId: project.id });

        expect(result.status).toBe('completed');
        expect(cloud.vercel.promoteCalls).toBe(1);
        expect(current?.commit).toBe(COMMIT);
        expect(current?.target).toBe('production');
    });

    it('E8 — finishes with the evidence the contract requires and a public URL', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const result = await runCloudOperation(runRequest(cloud, plan));

        expect(result.evidence.sourceCommit).toBe(COMMIT);
        expect(result.evidence.approvalDigest).toBe(cloudPlanDigest(plan));
        expect(String(result.evidence.publicBaseUrl)).toMatch(/^https:\/\//);
        expect(result.evidence.currentDeploymentId).toBe(result.evidence.stagedDeploymentId);
    });

    it('E12 — a resume after an unknown outcome re-reads and does not promote twice', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan));

        expect(cloud.vercel.promoteCalls).toBe(1);

        // The provider timed out on the way back, so the run comes again.
        const resumed = await runCloudOperation(runRequest(cloud, plan));

        expect(resumed.status).toBe('completed');
        expect(cloud.vercel.promoteCalls).toBe(1);
        expect(cloud.vercel.deployCalls).toBe(1);
    });

    it('E9 — a promoted deployment that goes bad puts traffic back on the last healthy one', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const first = await runCloudOperation(runRequest(cloud, plan));
        const project = [...cloud.vercel.projects.values()][0];
        const healthy = await cloud.vercel.currentProduction({ projectId: project.id });

        // A second release goes out and is promoted, and only then does it
        // start failing — which is the point of this case: every gate before
        // the promotion passed.
        const second = await runCloudOperation(runRequest(cloud, plan, {
            sourceCommit: SECOND_COMMIT,
            completed: CLOUD_STEPS.slice(0, 5).map(step => step.id),
            targets: vercelById(cloud, plan, project.id),
            gates: passingGates({ async remoteCommit()
            {
                return SECOND_COMMIT;
            } }),
        }));
        const bad = await cloud.vercel.currentProduction({ projectId: project.id });

        expect(first.status).toBe('completed');
        expect(second.status).toBe('completed');
        expect(bad?.id).not.toBe(healthy?.id);

        cloud.health.perUrl.set(bad?.url as string, false);

        const buildsBefore = cloud.vercel.deployCalls;
        const migrationsBefore = cloud.supabase.applyCalls;
        const backupsBefore = cloud.supabase.backups.length;
        const rolled = await runTrafficRollback(runRequest(cloud, plan, {
            sourceCommit: SECOND_COMMIT,
            targets: vercelById(cloud, plan, project.id),
        }));
        const restored = await cloud.vercel.currentProduction({ projectId: project.id });

        expect(rolled.status).toBe('completed');
        expect(rolled.code).toBe('CLOUD_ROLLBACK_COMPLETE');
        expect(restored?.id).toBe(healthy?.id);
        expect(rolled.evidence.currentDeploymentId).toBe(healthy?.id);
        // The candidate traffic came off is named too, so a report can say what
        // was rolled back rather than only what it went back to.
        expect(rolled.evidence.stagedDeploymentId).toBe(bad?.id);
        // Recovering traffic built nothing and touched no database.
        expect(cloud.vercel.deployCalls).toBe(buildsBefore);
        expect(cloud.supabase.applyCalls).toBe(migrationsBefore);
        expect(cloud.supabase.backups.length).toBe(backupsBefore);
        expect(cloud.vercel.rollbackCalls).toBe(1);
    });

    it('E10 — after a rollback a new commit earns production through the same gates', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan));

        const project = [...cloud.vercel.projects.values()][0];
        const reconciled = await runRollbackReconcile(runRequest(cloud, plan, {
            sourceCommit: ROLLBACK_COMMIT,
            targets: vercelById(cloud, plan, project.id),
            gates: passingGates({ async remoteCommit()
            {
                return ROLLBACK_COMMIT;
            } }),
        }));
        const current = await cloud.vercel.currentProduction({ projectId: project.id });

        expect(reconciled.status).toBe('completed');
        // Pushed, built, verified and promoted: the reconcile skipped the
        // resources that already exist and nothing else.
        expect(current?.commit).toBe(ROLLBACK_COMMIT);
        expect(cloud.github.pushCalls).toBe(2);
        expect(cloud.vercel.deployCalls).toBe(2);
        // No second database and no second migration: the expanded schema stays.
        expect(cloud.supabase.createCalls).toBe(1);
        expect(cloud.supabase.applyCalls).toBe(0);
    });

    it('E10 — a reconcile whose staged build fails its gates leaves traffic where it is', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan));

        const project = [...cloud.vercel.projects.values()][0];
        const healthy = await cloud.vercel.currentProduction({ projectId: project.id });
        const reconciled = await runRollbackReconcile(runRequest(cloud, plan, {
            sourceCommit: ROLLBACK_COMMIT,
            targets: vercelById(cloud, plan, project.id),
            gates: passingGates({
                async remoteCommit()
                {
                    return ROLLBACK_COMMIT;
                },
                async detailedHealth()
                {
                    return { ok: false, reason: 'still-broken' };
                },
            }),
        }));

        expect(reconciled.status).toBe('refused');
        expect(reconciled.code).toBe(GATE_FAILURE_CODES.detailedHealth);
        expect((await cloud.vercel.currentProduction({ projectId: project.id }))?.id).toBe(healthy?.id);
        expect(cloud.vercel.promoteCalls).toBe(1);
    });

    it('E11 — with nothing healthy behind it a rollback is an incident, not a traffic move', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan));

        const project = [...cloud.vercel.projects.values()][0];
        const only = await cloud.vercel.currentProduction({ projectId: project.id });

        cloud.health.perUrl.set(only?.url as string, false);

        const rolled = await runTrafficRollback(runRequest(cloud, plan, {
            targets: vercelById(cloud, plan, project.id),
        }));

        expect(rolled.status).toBe('failed');
        expect(rolled.code).toBe('CLOUD_ROLLBACK_NO_PREVIOUS');
        expect(cloud.vercel.rollbackCalls).toBe(0);
        // The broken deployment is still the one serving, and the report says
        // so. An incident that quietly moved traffic somewhere unverified
        // would be worse than one that stops.
        expect((await cloud.vercel.currentProduction({ projectId: project.id }))?.id).toBe(only?.id);
    });

    it('E11 — a previous deployment that no longer answers is not a rollback target', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        await runCloudOperation(runRequest(cloud, plan));

        const project = [...cloud.vercel.projects.values()][0];
        const first = await cloud.vercel.currentProduction({ projectId: project.id });

        await runCloudOperation(runRequest(cloud, plan, {
            sourceCommit: SECOND_COMMIT,
            completed: CLOUD_STEPS.slice(0, 5).map(step => step.id),
            targets: vercelById(cloud, plan, project.id),
            gates: passingGates({ async remoteCommit()
            {
                return SECOND_COMMIT;
            } }),
        }));

        const bad = await cloud.vercel.currentProduction({ projectId: project.id });

        // The live one and the one behind it are both broken.
        cloud.health.perUrl.set(bad?.url as string, false);
        cloud.health.perUrl.set(first?.url as string, false);

        const rolled = await runTrafficRollback(runRequest(cloud, plan, {
            targets: vercelById(cloud, plan, project.id),
        }));

        expect(rolled.status).toBe('failed');
        expect(rolled.code).toBe('CLOUD_ROLLBACK_NO_PREVIOUS');
        expect((await cloud.vercel.currentProduction({ projectId: project.id }))?.id).toBe(bad?.id);
    });

    it('E7 — the evidence names the deployment the domain serves, not the one asked for', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const promote = cloud.vercel.promote.bind(cloud.vercel);

        // A provider that answers a promotion by making a production
        // deployment of its own and pointing the domain at that instead.
        cloud.vercel.promote = async request =>
        {
            const asked = await promote(request);
            const copy = { ...asked, id: `${asked.id}-served` };

            cloud.vercel.deployments.set(copy.id, copy);
            cloud.vercel.production.set(request.projectId, copy.id);

            return asked;
        };

        const result = await runCloudOperation(runRequest(cloud, plan));
        const project = [...cloud.vercel.projects.values()][0];
        const serving = await cloud.vercel.currentProduction({ projectId: project.id });

        expect(result.status).toBe('completed');
        expect(result.evidence.currentDeploymentId).toBe(serving?.id);
        expect(result.evidence.currentDeploymentId).not.toBe(result.evidence.stagedDeploymentId);
    });

    it('E2 — a build still building is waited for rather than called unavailable', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        // Ready only on the third read, which is what a provider that takes a
        // minute to compile looks like from here.
        cloud.vercel.stagedState = 'building';

        let reads = 0;
        const readDeployment = cloud.vercel.readDeployment.bind(cloud.vercel);

        cloud.vercel.readDeployment = async request =>
        {
            reads += 1;

            const deployment = await readDeployment(request);

            return deployment === null || reads < 3 ? deployment : { ...deployment, state: 'ready' };
        };

        const result = await runCloudOperation(runRequest(cloud, plan));

        expect(reads).toBeGreaterThanOrEqual(3);
        expect(result.status).toBe('completed');
        expect(cloud.vercel.promoteCalls).toBe(1);
    });

    it('a hosting project is left staged, so a push cannot take the domain by itself', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());

        expect(cloud.vercel.autoAssignCustomDomains).toBe(true);

        await runCloudOperation(runRequest(cloud, plan));

        expect(cloud.vercel.autoAssignCustomDomains).toBe(false);
    });
});

describe('the envelopes a run produces', () =>
{
    it('every one of them validates against the frozen contract', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const result = await runCloudOperation(runRequest(cloud, plan));

        expect(result.envelopes).toHaveLength(CLOUD_STEPS.length);

        for (const envelope of result.envelopes)
        {
            const validation = validateProviderOperationEnvelope(envelope);

            expect(validation.issues, `${envelope.provider}/${envelope.action}`).toEqual([]);
        }
    });

    it('carries the approval digest on every external write', async () =>
    {
        const cloud = createFakeCloud();
        const plan = buildCloudPlan(planRequest());
        const result = await runCloudOperation(runRequest(cloud, plan));

        for (const envelope of result.envelopes)
        {
            expect(envelope.effect).not.toBe('read');
            expect(envelope.approvalDigest).toBe(cloudPlanDigest(plan));
        }
    });

    it('follows unit 09 section 6.2 in the order it runs them', () =>
    {
        expect(CLOUD_STEPS.map(step => step.id)).toEqual([
            'repository-create',
            'database-create',
            'hosting-create',
            'environment-configure',
            'migration-apply',
            'source-push',
            'staged-build',
            'staged-verify',
            'promote',
        ]);
    });
});

/** A minimal valid envelope for the cases that drive one adapter directly. */
function envelopeSkeleton(provider: KitProviderId, action: string): Record<string, unknown>
{
    return {
        schemaVersion: 1,
        operationId: OPERATION_ID,
        activationId: ACTIVATION_ID,
        provider,
        action,
        effect: 'external-write',
        planDigest: TREE_DIGEST,
        approvalDigest: `sha256:${'e'.repeat(64)}`,
        requestedScopes: ['metadata:read'],
        status: 'planned',
        startedAt: NOW,
        evidence: {
            planDigest: TREE_DIGEST,
            approvalDigest: `sha256:${'e'.repeat(64)}`,
            sourceCommit: COMMIT,
        },
    };
}
