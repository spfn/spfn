/**
 * Three providers with state, and counters that say what was really created.
 *
 * The point of holding state rather than returning canned answers is the whole
 * idempotency claim. "The resume did not make a second repository" is not
 * something the CLI can be asked — it would only report what it believed. It is
 * a fact about the provider, and only a provider that remembers can be asked
 * it. So every create increments a counter, every read returns what previous
 * calls actually did, and a test asserts on the counter.
 *
 * Nothing here reaches a network. The whole point of this round is that the
 * adapters are exercised end to end without a single real resource existing.
 */

import { createHash } from 'node:crypto';
import type {
    GithubApi,
    GithubRepository,
    HealthProbe,
    SupabaseApi,
    SupabaseProject,
    VercelApi,
    VercelDeployment,
    VercelProject,
} from '../../src/kit/cloud/providers/api.js';

function shortId(prefix: string, seed: string): string
{
    return `${prefix}${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}

export class FakeGithub implements GithubApi
{
    readonly repositories = new Map<string, GithubRepository>();
    readonly secrets = new Map<string, Map<string, string>>();
    /** Every create, so "exactly one repository" is checkable. */
    createCalls = 0;
    pushCalls = 0;

    async findRepository(request: { owner: string; name: string }): Promise<GithubRepository | null>
    {
        return this.repositories.get(`${request.owner}/${request.name}`) ?? null;
    }

    async createRepository(request: { owner: string; name: string; private: boolean }): Promise<GithubRepository>
    {
        this.createCalls += 1;

        const repository: GithubRepository = {
            id: shortId('R_kgDO', `${request.owner}/${request.name}`),
            owner: request.owner,
            name: request.name,
            defaultBranch: 'main',
            headCommit: null,
        };

        this.repositories.set(`${request.owner}/${request.name}`, repository);

        return repository;
    }

    async pushBranch(request: { repositoryId: string; branch: string; commit: string }): Promise<GithubRepository>
    {
        this.pushCalls += 1;

        for (const [key, repository] of this.repositories)
        {
            if (repository.id === request.repositoryId)
            {
                const pushed = { ...repository, headCommit: request.commit };

                this.repositories.set(key, pushed);

                return pushed;
            }
        }

        throw new Error(`no repository ${request.repositoryId}`);
    }

    async listSecretNames(request: { repositoryId: string }): Promise<string[]>
    {
        return [...(this.secrets.get(request.repositoryId)?.keys() ?? [])];
    }

    async setSecret(request: { repositoryId: string; name: string; value: string }): Promise<void>
    {
        const bag = this.secrets.get(request.repositoryId) ?? new Map<string, string>();

        bag.set(request.name, request.value);
        this.secrets.set(request.repositoryId, bag);
    }

    /** Seed a repository that already exists — the bind and drift cases. */
    seed(repository: GithubRepository): void
    {
        this.repositories.set(`${repository.owner}/${repository.name}`, repository);
    }
}

export class FakeSupabase implements SupabaseApi
{
    readonly projects = new Map<string, SupabaseProject>();
    readonly migrations = new Map<string, string[]>();
    readonly backups: string[] = [];
    createCalls = 0;
    applyCalls = 0;

    async findProject(request: { organizationId: string; name: string }): Promise<SupabaseProject | null>
    {
        return [...this.projects.values()].find(project => project.name === request.name) ?? null;
    }

    async createProject(request: {
        organizationId: string;
        name: string;
        region: string;
        plan: string;
    }): Promise<SupabaseProject>
    {
        this.createCalls += 1;

        const project: SupabaseProject = {
            ref: shortId('', `${request.organizationId}/${request.name}`),
            organizationId: request.organizationId,
            name: request.name,
            region: request.region,
            status: 'active',
        };

        this.projects.set(project.ref, project);

        return project;
    }

    async createBackup(request: { projectRef: string }): Promise<{ backupId: string }>
    {
        const backupId = shortId('bk-', `${request.projectRef}-${this.backups.length}`);

        this.backups.push(backupId);

        return { backupId };
    }

    async appliedMigrations(request: { projectRef: string }): Promise<string[]>
    {
        return [...(this.migrations.get(request.projectRef) ?? [])];
    }

    async applyMigrations(request: { projectRef: string; migrations: string[] }): Promise<{ applied: string[] }>
    {
        this.applyCalls += 1;

        const already = this.migrations.get(request.projectRef) ?? [];

        this.migrations.set(request.projectRef, [...already, ...request.migrations]);

        return { applied: request.migrations };
    }

    seed(project: SupabaseProject): void
    {
        this.projects.set(project.ref, project);
    }
}

export class FakeVercel implements VercelApi
{
    readonly projects = new Map<string, VercelProject>();
    readonly deployments = new Map<string, VercelDeployment>();
    readonly environment = new Map<string, Map<string, string>>();
    /** The deployment the production domain points at, per project. */
    readonly production = new Map<string, string>();
    createCalls = 0;
    deployCalls = 0;
    promoteCalls = 0;
    rollbackCalls = 0;
    /** Every deployment that has been production, oldest first, per project. */
    readonly productionOrder = new Map<string, string[]>();
    /** Whether a build still takes the domain by itself. Off is the contract. */
    autoAssignCustomDomains = true;
    /** Set to make a staged build come back broken, for the rollback cases. */
    stagedState: VercelDeployment['state'] = 'ready';

    async findProject(request: { teamId: string; name: string }): Promise<VercelProject | null>
    {
        return [...this.projects.values()].find(project => project.name === request.name) ?? null;
    }

    async createProject(request: { teamId: string; name: string; region: string }): Promise<VercelProject>
    {
        this.createCalls += 1;

        const project: VercelProject = {
            id: shortId('prj_', `${request.teamId}/${request.name}`),
            teamId: request.teamId,
            name: request.name,
            region: request.region,
        };

        this.projects.set(project.id, project);

        return project;
    }

    async listEnvironmentNames(request: { projectId: string }): Promise<string[]>
    {
        return [...(this.environment.get(request.projectId)?.keys() ?? [])];
    }

    async setEnvironment(request: { projectId: string; variables: { key: string; value: string }[] }): Promise<void>
    {
        const bag = this.environment.get(request.projectId) ?? new Map<string, string>();

        for (const variable of request.variables)
        {
            bag.set(variable.key, variable.value);
        }

        this.environment.set(request.projectId, bag);
    }

    async createStagedDeployment(request: { projectId: string; commit: string }): Promise<VercelDeployment>
    {
        this.deployCalls += 1;

        const deployment: VercelDeployment = {
            id: shortId('dpl_', `${request.projectId}/${request.commit}/${this.deployCalls}`),
            projectId: request.projectId,
            commit: request.commit,
            target: 'staged',
            state: this.stagedState,
            url: `https://${shortId('', request.commit).slice(0, 12)}.example.test`,
        };

        this.deployments.set(deployment.id, deployment);

        return deployment;
    }

    async findDeploymentForCommit(request: { projectId: string; commit: string }): Promise<VercelDeployment | null>
    {
        return [...this.deployments.values()].find(deployment =>
            deployment.projectId === request.projectId && deployment.commit === request.commit) ?? null;
    }

    async readDeployment(request: { deploymentId: string }): Promise<VercelDeployment | null>
    {
        return this.deployments.get(request.deploymentId) ?? null;
    }

    async currentProduction(request: { projectId: string }): Promise<VercelDeployment | null>
    {
        const id = this.production.get(request.projectId);

        return id === undefined ? null : this.deployments.get(id) ?? null;
    }

    async promote(request: { projectId: string; deploymentId: string }): Promise<VercelDeployment>
    {
        this.promoteCalls += 1;

        const deployment = this.deployments.get(request.deploymentId);

        if (deployment === undefined)
        {
            throw new Error(`no deployment ${request.deploymentId}`);
        }

        const promoted = { ...deployment, target: 'production' as const };

        this.deployments.set(promoted.id, promoted);
        this.production.set(request.projectId, promoted.id);
        this.recordProduction(request.projectId, promoted.id);

        return promoted;
    }

    async productionHistory(request: { projectId: string; limit?: number }): Promise<VercelDeployment[]>
    {
        const order = this.productionOrder.get(request.projectId) ?? [];
        const newestFirst = [...order].reverse().slice(0, request.limit ?? 20);

        return newestFirst
            .map(id => this.deployments.get(id))
            .filter((deployment): deployment is VercelDeployment => deployment !== undefined);
    }

    async rollback(request: { projectId: string; deploymentId: string }): Promise<VercelDeployment>
    {
        this.rollbackCalls += 1;

        const deployment = this.deployments.get(request.deploymentId);

        if (deployment === undefined)
        {
            throw new Error(`no deployment ${request.deploymentId}`);
        }

        // The alias moves; the history does not gain an entry, because this
        // deployment was already production once and being live again is not a
        // new release.
        this.production.set(request.projectId, deployment.id);

        return { ...deployment, target: 'production' };
    }

    async ensureStagedProduction(request: { projectId: string }): Promise<void>
    {
        void request;
        this.autoAssignCustomDomains = false;
    }

    seedProject(project: VercelProject): void
    {
        this.projects.set(project.id, project);
    }

    /** Seed a deployment that was production before this run. */
    seedProduction(deployment: VercelDeployment): void
    {
        this.deployments.set(deployment.id, deployment);
        this.production.set(deployment.projectId, deployment.id);
        this.recordProduction(deployment.projectId, deployment.id);
    }

    private recordProduction(projectId: string, deploymentId: string): void
    {
        const order = this.productionOrder.get(projectId) ?? [];

        if (!order.includes(deploymentId))
        {
            order.push(deploymentId);
        }

        this.productionOrder.set(projectId, order);
    }
}

/** A health probe that answers whatever the case needs it to. */
export class FakeHealth implements HealthProbe
{
    ok = true;
    status = 200;
    body = '{"status":"ok"}';
    calls = 0;
    /** URLs that answer differently from the default. The rollback cases need
     * one deployment to be broken while another is fine, and a probe that
     * answers the same for every URL could not tell those apart. */
    readonly perUrl = new Map<string, boolean>();
    readonly probed: string[] = [];

    async check(request: { url: string }): Promise<{ ok: boolean; status: number; body: string }>
    {
        this.calls += 1;
        this.probed.push(request.url);

        const ok = this.perUrl.get(request.url) ?? this.ok;

        return { ok, status: ok ? this.status : 503, body: this.body };
    }
}

export interface FakeCloud
{
    github: FakeGithub;
    supabase: FakeSupabase;
    vercel: FakeVercel;
    health: FakeHealth;
}

export function createFakeCloud(): FakeCloud
{
    return {
        github: new FakeGithub(),
        supabase: new FakeSupabase(),
        vercel: new FakeVercel(),
        health: new FakeHealth(),
    };
}
