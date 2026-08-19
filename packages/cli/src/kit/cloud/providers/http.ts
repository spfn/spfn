/**
 * The three provider seams, over the real APIs.
 *
 * Built on the `cloudFetch` helper this repository already uses for `spfn
 * cloud`, for two reasons that both matter more than saving a few lines: its
 * error messages carry a status and the body's message and never the request
 * headers, so a token cannot leak into command output; and the endpoints it
 * established are already exercised against the live services, which is a
 * better source than a second reading of the same documentation.
 *
 * Tokens arrive as values and go into an `Authorization` header. Never an
 * argument, never a file, never an envelope. The one place a child process is
 * involved — pushing a commit, which no HTTP API can do — hands git its
 * credential through `GIT_CONFIG_*` environment variables rather than
 * `-c http.extraheader=...`, because the second spelling is an argument and
 * everything on this machine can read it.
 *
 * What is deliberately *not* here: any call that creates something. Creating is
 * implemented, but this round runs it against a local fixture only; the first
 * real resource waits for the run that is allowed to make one.
 */

import { cloudFetch, cloudFetchJson } from '../../../utils/cloud/http.js';
import { KitError } from '../../errors.js';
import { runCommand, summarize, type CommandRunner } from '../../local/process.js';
import type {
    GithubApi,
    GithubRepository,
    HealthProbe,
    SupabaseApi,
    SupabaseProject,
    VercelApi,
    VercelDeployment,
    VercelProject,
} from './api.js';

const GITHUB_BASE = 'https://api.github.com';
const SUPABASE_BASE = 'https://api.supabase.com';
const VERCEL_BASE = 'https://api.vercel.com';

/** Injected so a contract fixture can answer on loopback instead. */
export interface TransportOptions
{
    baseUrl?: string;
    /** Reads the provider token. Held in memory for one call, never stored. */
    token: () => Promise<string>;
}

export class GithubHttpApi implements GithubApi
{
    private readonly base: string;
    private readonly token: () => Promise<string>;
    private readonly run: CommandRunner;

    constructor(options: TransportOptions & { run?: CommandRunner })
    {
        this.base = options.baseUrl ?? GITHUB_BASE;
        this.token = options.token;
        this.run = options.run ?? runCommand;
    }

    async findRepository(request: { owner: string; name: string }): Promise<GithubRepository | null>
    {
        const path = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.name)}`;
        const response = await cloudFetch(`${this.base}${path}`, {
            token: await this.token(),
            provider: 'GitHub',
            allowNotFound: true,
        });

        if (response === null)
        {
            return null;
        }

        return this.readRepository(await response.json() as GithubRepositoryBody);
    }

    /**
     * A user's repository and an organisation's are different endpoints, so the
     * owner's type is read first rather than guessed. Guessing wrong creates the
     * repository in the wrong place, which is not a mistake a retry undoes.
     */
    async createRepository(request: { owner: string; name: string; private: boolean }): Promise<GithubRepository>
    {
        const token = await this.token();
        const owner = await cloudFetchJson<{ type?: string }>(
            `${this.base}/users/${encodeURIComponent(request.owner)}`,
            { token, provider: 'GitHub' },
        );
        const path = owner.type === 'Organization'
            ? `/orgs/${encodeURIComponent(request.owner)}/repos`
            : '/user/repos';
        const created = await cloudFetchJson<GithubRepositoryBody>(`${this.base}${path}`, {
            method: 'POST',
            token,
            provider: 'GitHub',
            body: { name: request.name, private: request.private, auto_init: false },
        });

        return this.readRepository(created);
    }

    /**
     * Pushing a commit, which is git's job and no API's.
     *
     * The token goes to git through `GIT_CONFIG_*`, which is an environment
     * variable rather than an argument. `git push -c http.extraheader=...` puts
     * the same token in the process table for every local user to read.
     *
     * The header is Basic and not Bearer. GitHub's REST API takes a bearer
     * token; its git-over-HTTPS endpoint does not, and answers `invalid
     * credentials` to one — the same token, the same repository, refused
     * because the scheme is wrong. The username half is the constant GitHub
     * documents for token authentication, and the token is the password.
     */
    async pushBranch(request: {
        repositoryId: string;
        branch: string;
        commit: string;
        cwd?: string;
        remoteUrl?: string;
    }): Promise<GithubRepository>
    {
        const token = await this.token();
        const result = await this.run({
            file: 'git',
            args: ['push', request.remoteUrl ?? 'origin', `${request.commit}:refs/heads/${request.branch}`],
            cwd: request.cwd ?? process.cwd(),
            extraEnv: {
                GIT_TERMINAL_PROMPT: '0',
                GIT_CONFIG_COUNT: '1',
                GIT_CONFIG_KEY_0: 'http.extraheader',
                GIT_CONFIG_VALUE_0:
                    `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
            },
        });

        if (result.exitCode !== 0)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'The source could not be pushed to the repository.', {
                evidence: { detail: summarize(result), branch: request.branch },
            });
        }

        return {
            id: request.repositoryId,
            owner: '',
            name: '',
            defaultBranch: request.branch,
            headCommit: request.commit,
        };
    }

    async listSecretNames(request: { repositoryId: string; owner?: string; name?: string }): Promise<string[]>
    {
        if (request.owner === undefined || request.name === undefined)
        {
            return [];
        }

        const path = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.name)}/actions/secrets`;
        const body = await cloudFetchJson<{ secrets?: { name: string }[] }>(`${this.base}${path}`, {
            token: await this.token(),
            provider: 'GitHub',
        });

        return (body.secrets ?? []).map(secret => secret.name);
    }

    /**
     * Refused rather than half-implemented.
     *
     * A repository secret has to be sealed with the repository's public key —
     * X25519 plus XSalsa20-Poly1305 — and this build carries no library that
     * does it. Sending a plaintext value would be worse than not sending one,
     * and a Kit does not need this path: the runtime environment a deployment
     * reads lives in the hosting project, not in GitHub Actions.
     */
    async setSecret(request: { repositoryId: string; name: string; value: string }): Promise<void>
    {
        void request.value;

        throw new KitError('KIT_DEPLOY_FAILED', 'This build cannot write a repository secret.', {
            evidence: {
                reason: 'sealed-box-unavailable',
                secretName: request.name,
                repositoryId: request.repositoryId,
            },
        });
    }

    private readRepository(body: GithubRepositoryBody): GithubRepository
    {
        return {
            // `node_id` is the identity that survives a rename; `id` is numeric
            // and `full_name` is a label.
            id: body.node_id,
            owner: body.owner?.login ?? '',
            name: body.name,
            defaultBranch: body.default_branch,
            headCommit: null,
        };
    }
}

interface GithubRepositoryBody
{
    node_id: string;
    name: string;
    default_branch: string;
    owner?: { login?: string };
}

/**
 * Supabase, minus the backup.
 *
 * A free-tier organisation has no automatic backup and no backup API, so the
 * evidence a migration needs is produced by the Kit itself — see
 * `PgDumpBackup`. This transport takes the dump as a collaborator rather than
 * pretending the provider has an endpoint it does not.
 */
export interface SupabaseBackupSource
{
    createBackup(request: { projectRef: string }): Promise<{ backupId: string }>;
}

/** Runs the project's migrations. The local `spfn db migrate` path, injected. */
export interface SupabaseMigrationRunner
{
    applied(request: { projectRef: string }): Promise<string[]>;
    apply(request: { projectRef: string; migrations: string[] }): Promise<{ applied: string[] }>;
}

export class SupabaseHttpApi implements SupabaseApi
{
    private readonly base: string;
    private readonly token: () => Promise<string>;
    private readonly backups: SupabaseBackupSource;
    private readonly migrations: SupabaseMigrationRunner;
    private readonly databasePassword: () => Promise<string>;

    constructor(options: TransportOptions & {
        backups: SupabaseBackupSource;
        migrations: SupabaseMigrationRunner;
        /** Generated locally and handed straight to the create call. */
        databasePassword: () => Promise<string>;
    })
    {
        this.base = options.baseUrl ?? SUPABASE_BASE;
        this.token = options.token;
        this.backups = options.backups;
        this.migrations = options.migrations;
        this.databasePassword = options.databasePassword;
    }

    async findProject(request: { organizationId: string; name: string }): Promise<SupabaseProject | null>
    {
        const projects = await cloudFetchJson<SupabaseProjectBody[]>(`${this.base}/v1/projects`, {
            token: await this.token(),
            provider: 'Supabase',
        });
        const found = projects.find(project =>
            project.name === request.name && project.organization_id === request.organizationId);

        return found === undefined ? null : readProject(found);
    }

    async createProject(request: {
        organizationId: string;
        name: string;
        region: string;
        plan: string;
    }): Promise<SupabaseProject>
    {
        const created = await cloudFetchJson<SupabaseProjectBody>(`${this.base}/v1/projects`, {
            method: 'POST',
            token: await this.token(),
            provider: 'Supabase',
            body: {
                name: request.name,
                organization_id: request.organizationId,
                region: request.region,
                plan: request.plan,
                // Generated on this machine and sent once. It reaches the
                // keychain and the hosting environment; it never reaches an
                // envelope, the journal or a log.
                db_pass: await this.databasePassword(),
            },
        });

        return readProject(created);
    }

    createBackup(request: { projectRef: string }): Promise<{ backupId: string }>
    {
        return this.backups.createBackup(request);
    }

    appliedMigrations(request: { projectRef: string }): Promise<string[]>
    {
        return this.migrations.applied(request);
    }

    applyMigrations(request: { projectRef: string; migrations: string[] }): Promise<{ applied: string[] }>
    {
        return this.migrations.apply(request);
    }
}

interface SupabaseProjectBody
{
    id: string;
    organization_id: string;
    name: string;
    region: string;
    status?: string;
}

function readProject(body: SupabaseProjectBody): SupabaseProject
{
    return {
        ref: body.id,
        organizationId: body.organization_id,
        name: body.name,
        region: body.region,
        status: body.status === 'ACTIVE_HEALTHY' ? 'active' : 'provisioning',
    };
}

export class VercelHttpApi implements VercelApi
{
    private readonly base: string;
    private readonly token: () => Promise<string>;
    /** Absent on Hobby, which is a personal account with no team. */
    private readonly teamId: string | undefined;

    constructor(options: TransportOptions & { teamId?: string })
    {
        this.base = options.baseUrl ?? VERCEL_BASE;
        this.token = options.token;
        this.teamId = options.teamId;
    }

    async findProject(request: { teamId: string; name: string }): Promise<VercelProject | null>
    {
        const response = await cloudFetch(
            `${this.base}/v9/projects/${encodeURIComponent(request.name)}${this.query()}`,
            { token: await this.token(), provider: 'Vercel', allowNotFound: true },
        );

        if (response === null)
        {
            return null;
        }

        return this.readProject(await response.json() as VercelProjectBody, request.teamId);
    }

    async createProject(request: { teamId: string; name: string; region: string }): Promise<VercelProject>
    {
        const created = await cloudFetchJson<VercelProjectBody>(`${this.base}/v10/projects${this.query()}`, {
            method: 'POST',
            token: await this.token(),
            provider: 'Vercel',
            body: { name: request.name },
        });

        return { ...this.readProject(created, request.teamId), region: request.region };
    }

    async listEnvironmentNames(request: { projectId: string }): Promise<string[]>
    {
        const body = await cloudFetchJson<{ envs?: { key: string }[] }>(
            `${this.base}/v9/projects/${encodeURIComponent(request.projectId)}/env${this.query()}`,
            { token: await this.token(), provider: 'Vercel' },
        );

        return (body.envs ?? []).map(entry => entry.key);
    }

    async setEnvironment(request: {
        projectId: string;
        variables: { key: string; value: string }[];
    }): Promise<void>
    {
        const token = await this.token();

        for (const variable of request.variables)
        {
            await cloudFetchJson<unknown>(
                `${this.base}/v10/projects/${encodeURIComponent(request.projectId)}/env${this.query()}`,
                {
                    method: 'POST',
                    token,
                    provider: 'Vercel',
                    body: { key: variable.key, value: variable.value, type: 'encrypted', target: ['production'] },
                },
            );
        }
    }

    /**
     * A build that is reachable and is not yet what visitors get.
     *
     * It is a *production* build, and what keeps it off the domain is the
     * project setting `ensureStagedProduction` writes: with custom-domain
     * auto-assignment off, a new production deployment does not take the
     * production hostname and only `promote` moves it. Unit 09 §9.1 states
     * exactly that arrangement, and §6.2's verify step then asks whether the
     * deployment is `READY` *in the production environment* — a question a
     * preview build cannot answer yes to.
     *
     * Building a preview instead looks safer and is not. Vercel scopes
     * encrypted environment variables per target, and unit 09 §9.1 keeps the
     * runtime and build secrets in the production environment alone. A preview
     * therefore builds without the registry credential, without the database
     * and without the app's own origin — so it either fails outright or, worse,
     * passes gates as a differently configured program than the one promotion
     * would put in front of visitors. Verifying that build proves nothing about
     * production.
     *
     * The repository is read from the project rather than passed in. Vercel
     * identifies a git source by the numeric repository id it stored when the
     * project was linked, refuses a request without it, and that id is not
     * something a caller holding a commit could be expected to know.
     *
     * The commit is the `ref`, and there is no separate `sha`. A ref may be a
     * branch, a tag or a commit, and naming the commit is exact: a request that
     * named the production branch instead produced two deployments for one
     * commit, and the second of those is a build nobody asked for.
     */
    async createStagedDeployment(request: { projectId: string; commit: string }): Promise<VercelDeployment>
    {
        const link = await this.readGitLink(request.projectId);
        const created = await cloudFetchJson<VercelDeploymentBody>(`${this.base}/v13/deployments${this.query()}`, {
            method: 'POST',
            token: await this.token(),
            provider: 'Vercel',
            body: {
                name: link.name,
                project: request.projectId,
                target: 'production',
                gitSource: {
                    type: link.type,
                    repoId: link.repoId,
                    ref: request.commit,
                },
            },
        });

        return readDeployment(created, request.projectId, request.commit);
    }

    async findDeploymentForCommit(request: { projectId: string; commit: string }): Promise<VercelDeployment | null>
    {
        const body = await cloudFetchJson<{ deployments?: VercelDeploymentBody[] }>(
            `${this.base}/v6/deployments?projectId=${encodeURIComponent(request.projectId)}&limit=100${this.query('&')}`,
            { token: await this.token(), provider: 'Vercel' },
        );
        const found = (body.deployments ?? []).find(deployment => deployment.meta?.githubCommitSha === request.commit);

        return found === undefined ? null : readDeployment(found, request.projectId, request.commit);
    }

    async readDeployment(request: { deploymentId: string }): Promise<VercelDeployment | null>
    {
        const response = await cloudFetch(
            `${this.base}/v13/deployments/${encodeURIComponent(request.deploymentId)}${this.query()}`,
            { token: await this.token(), provider: 'Vercel', allowNotFound: true },
        );

        if (response === null)
        {
            return null;
        }

        const body = await response.json() as VercelDeploymentBody;

        return readDeployment(body, body.projectId ?? '', body.meta?.githubCommitSha ?? '');
    }

    async currentProduction(request: { projectId: string; productionDomain?: string }): Promise<VercelDeployment | null>
    {
        if (request.productionDomain !== undefined)
        {
            const served = await this.deploymentBehind(request.projectId, request.productionDomain);

            if (served !== null)
            {
                return served;
            }
        }

        const body = await cloudFetchJson<{ deployments?: VercelDeploymentBody[] }>(
            `${this.base}/v6/deployments?projectId=${encodeURIComponent(request.projectId)}`
            + `&target=production&limit=1${this.query('&')}`,
            { token: await this.token(), provider: 'Vercel' },
        );
        const [found] = body.deployments ?? [];

        return found === undefined
            ? null
            : readDeployment(found, request.projectId, found.meta?.githubCommitSha ?? '');
    }

    async promote(request: { projectId: string; deploymentId: string }): Promise<VercelDeployment>
    {
        const path = `/v9/projects/${encodeURIComponent(request.projectId)}`
            + `/promote/${encodeURIComponent(request.deploymentId)}`;

        await cloudFetch(`${this.base}${path}${this.query()}`, {
            method: 'POST',
            token: await this.token(),
            provider: 'Vercel',
        });

        const promoted = await this.readDeployment({ deploymentId: request.deploymentId });

        if (promoted === null)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'The promoted deployment could not be read back.', {
                evidence: { deploymentId: request.deploymentId },
            });
        }

        return { ...promoted, target: 'production' };
    }

    async productionHistory(request: { projectId: string; limit?: number }): Promise<VercelDeployment[]>
    {
        const body = await cloudFetchJson<{ deployments?: VercelDeploymentBody[] }>(
            `${this.base}/v6/deployments?projectId=${encodeURIComponent(request.projectId)}`
            + `&target=production&limit=${request.limit ?? 20}${this.query('&')}`,
            { token: await this.token(), provider: 'Vercel' },
        );

        return (body.deployments ?? []).map(deployment =>
            readDeployment(deployment, request.projectId, deployment.meta?.githubCommitSha ?? ''));
    }

    /**
     * Traffic back to a deployment that was production before.
     *
     * This is the call promotion makes, aimed backwards, which is what an
     * instant rollback is: the older build is still there and still ready, so
     * nothing rebuilds and the switch is an alias move. It is a method of its
     * own rather than a second call to `promote` so the evidence can say which
     * direction traffic went.
     */
    async rollback(request: { projectId: string; deploymentId: string }): Promise<VercelDeployment>
    {
        return this.promote(request);
    }

    async ensureStagedProduction(request: { projectId: string }): Promise<void>
    {
        await cloudFetchJson<unknown>(
            `${this.base}/v9/projects/${encodeURIComponent(request.projectId)}${this.query()}`,
            {
                method: 'PATCH',
                token: await this.token(),
                provider: 'Vercel',
                body: { autoAssignCustomDomains: false },
            },
        );
    }

    /**
     * The deployment a hostname actually resolves to.
     *
     * The alias record is the only place this is true. A project reports a
     * production target and a newest production build, and on a project where
     * a build was made but never promoted both of those name a deployment no
     * visitor is reaching. Asking the alias asks the thing that answers.
     */
    private async deploymentBehind(projectId: string, domain: string): Promise<VercelDeployment | null>
    {
        const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const body = await cloudFetchJson<{ aliases?: { alias?: string; deploymentId?: string }[] }>(
            `${this.base}/v4/aliases?projectId=${encodeURIComponent(projectId)}&limit=100${this.query('&')}`,
            { token: await this.token(), provider: 'Vercel' },
        );
        const found = (body.aliases ?? []).find(entry => entry.alias === host);

        if (found?.deploymentId === undefined)
        {
            return null;
        }

        return this.readDeployment({ deploymentId: found.deploymentId });
    }

    /** The git repository a project is linked to, as Vercel recorded it. */
    private async readGitLink(projectId: string): Promise<{
        name: string;
        type: string;
        repoId: number | string;
        productionBranch: string;
    }>
    {
        const body = await cloudFetchJson<VercelProjectBody>(
            `${this.base}/v9/projects/${encodeURIComponent(projectId)}${this.query()}`,
            { token: await this.token(), provider: 'Vercel' },
        );

        if (body.link === undefined || body.link.repoId === undefined)
        {
            throw new KitError('KIT_DEPLOY_FAILED', 'The hosting project is not linked to a repository.', {
                evidence: { projectId },
            });
        }

        return {
            name: body.name,
            type: body.link.type ?? 'github',
            repoId: body.link.repoId,
            productionBranch: body.link.productionBranch ?? 'main',
        };
    }

    /** `?teamId=` on a team account, and nothing at all on Hobby. */
    private query(separator = '?'): string
    {
        return this.teamId === undefined ? '' : `${separator}teamId=${encodeURIComponent(this.teamId)}`;
    }

    private readProject(body: VercelProjectBody, teamId: string): VercelProject
    {
        return { id: body.id, teamId, name: body.name, region: '' };
    }
}

interface VercelProjectBody
{
    id: string;
    name: string;
    link?: {
        type?: string;
        repoId?: number | string;
        productionBranch?: string;
    };
}

interface VercelDeploymentBody
{
    id?: string;
    uid?: string;
    url?: string;
    readyState?: string;
    target?: string | null;
    projectId?: string;
    meta?: { githubCommitSha?: string };
}

/**
 * The readiness values that mean the build has not finished yet.
 *
 * An allowlist, deliberately. Which states a deployment can be in is the
 * provider's to extend, and the ones it adds are not new ways of making
 * progress: `BLOCKED` is a deployment the provider refused to build, `DELETED`
 * is one that is gone. Reading anything unrecognised as "still building" makes
 * every one of them wait out the whole build timeout and then report a timeout,
 * which says nothing about what happened. Unknown therefore lands on `error`,
 * where the gate refuses at once.
 */
const VERCEL_IN_PROGRESS = new Set(['QUEUED', 'INITIALIZING', 'BUILDING']);

function readDeployment(body: VercelDeploymentBody, projectId: string, commit: string): VercelDeployment
{
    const state = body.readyState === 'READY'
        ? 'ready'
        : VERCEL_IN_PROGRESS.has(body.readyState ?? '') ? 'building' : 'error';

    return {
        id: body.id ?? body.uid ?? '',
        projectId: body.projectId ?? projectId,
        commit: body.meta?.githubCommitSha ?? commit,
        target: body.target === 'production' ? 'production' : 'staged',
        state,
        url: body.url === undefined ? '' : `https://${body.url.replace(/^https:\/\//, '')}`,
    };
}

/** A plain GET of the deployment's health route. No token, nothing stored. */
export class HttpHealthProbe implements HealthProbe
{
    private readonly path: string;
    private readonly timeoutMs: number;

    constructor(options: { path?: string; timeoutMs?: number } = {})
    {
        this.path = options.path ?? '/api/health';
        this.timeoutMs = options.timeoutMs ?? 15_000;
    }

    async check(request: { url: string }): Promise<{ ok: boolean; status: number; body: string }>
    {
        try
        {
            const response = await fetch(`${request.url.replace(/\/$/, '')}${this.path}`, {
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            const body = (await response.text()).slice(0, 2_000);

            return { ok: response.ok, status: response.status, body };
        }
        catch
        {
            // A probe that could not connect is a failed probe, not an error to
            // propagate: the gate's job is to answer yes or no.
            return { ok: false, status: 0, body: '' };
        }
    }
}
