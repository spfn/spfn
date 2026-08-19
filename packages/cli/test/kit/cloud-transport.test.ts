/**
 * The real transports, against a fixture that answers in each provider's shape.
 *
 * These are contract tests, not integration tests. What they pin is the half
 * that is easy to get wrong and impossible to notice: which path each call
 * goes to, which header carries the token, which field of the response is the
 * *stable* identity rather than a label, and — the one that matters most — that
 * a token never leaves through anything but an `Authorization` header.
 *
 * No provider is called. The fixture listens on loopback and every transport is
 * pointed at it, so this whole file runs with no credential and no account.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    GithubHttpApi,
    HttpHealthProbe,
    SupabaseHttpApi,
    VercelHttpApi,
} from '../../src/kit/cloud/providers/http.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';
import type { RunRequest, RunResult } from '../../src/kit/local/process.js';

const TOKEN = 'provider_token_do_not_leak';

interface Recorded
{
    method: string;
    path: string;
    authorization: string;
    body: unknown;
}

let server: Server;
let origin: string;
let seen: Recorded[];
let answers: Map<string, { status: number; body: unknown }>;

function answer(method: string, path: string, body: unknown, status = 200): void
{
    answers.set(`${method} ${path}`, { status, body });
}

beforeEach(async () =>
{
    seen = [];
    answers = new Map();
    server = createServer((request, response) => void handle(request, response));

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () =>
{
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void>
{
    const chunks: Buffer[] = [];

    for await (const chunk of request)
    {
        chunks.push(Buffer.from(chunk));
    }

    const url = new URL(request.url ?? '/', origin);

    seen.push({
        method: request.method ?? 'GET',
        path: `${url.pathname}${url.search}`,
        authorization: request.headers.authorization ?? '',
        body: chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });

    const found = answers.get(`${request.method} ${url.pathname}`);
    const status = found?.status ?? 404;
    const text = JSON.stringify(found?.body ?? { message: 'Not Found' });

    response.writeHead(status, { 'content-type': 'application/json', 'content-length': String(text.length) });
    response.end(text);
}

function github(): GithubHttpApi
{
    return new GithubHttpApi({ baseUrl: origin, token: async () => TOKEN });
}

function supabase(overrides: Partial<ConstructorParameters<typeof SupabaseHttpApi>[0]> = {}): SupabaseHttpApi
{
    return new SupabaseHttpApi({
        baseUrl: origin,
        token: async () => TOKEN,
        backups: { async createBackup() 
        {
            return { backupId: 'bk-local' }; 
        } },
        migrations: {
            async applied() 
            {
                return []; 
            },
            async apply(request) 
            {
                return { applied: request.migrations }; 
            },
        },
        databasePassword: async () => 'generated-database-password',
        ...overrides,
    });
}

function vercel(teamId?: string): VercelHttpApi
{
    return new VercelHttpApi({ baseUrl: origin, token: async () => TOKEN, teamId });
}

describe('the GitHub transport', () =>
{
    it('reads a repository by owner and name, and takes its stable node id', async () =>
    {
        answer('GET', '/repos/acme/landing', {
            node_id: 'R_kgDOstable',
            name: 'landing',
            default_branch: 'main',
            owner: { login: 'acme' },
        });

        const repository = await github().findRepository({ owner: 'acme', name: 'landing' });

        // `node_id`, not the numeric `id` and not `full_name`: the one that
        // survives a rename is the one identity may be built on.
        expect(repository?.id).toBe('R_kgDOstable');
        expect(repository?.defaultBranch).toBe('main');
        expect(seen[0].path).toBe('/repos/acme/landing');
    });

    it('reports a repository that is not there as absent rather than failing', async () =>
    {
        expect(await github().findRepository({ owner: 'acme', name: 'missing' })).toBeNull();
    });

    it('creates under the organisation endpoint when the owner is one', async () =>
    {
        answer('GET', '/users/acme', { type: 'Organization' });
        answer('POST', '/orgs/acme/repos', {
            node_id: 'R_new', name: 'landing', default_branch: 'main', owner: { login: 'acme' },
        });

        await github().createRepository({ owner: 'acme', name: 'landing', private: true });

        expect(seen.map(entry => `${entry.method} ${entry.path}`)).toEqual([
            'GET /users/acme',
            'POST /orgs/acme/repos',
        ]);
        expect(seen[1].body).toMatchObject({ name: 'landing', private: true });
    });

    it('creates under the user endpoint when the owner is a person', async () =>
    {
        answer('GET', '/users/someone', { type: 'User' });
        answer('POST', '/user/repos', {
            node_id: 'R_new', name: 'landing', default_branch: 'main', owner: { login: 'someone' },
        });

        await github().createRepository({ owner: 'someone', name: 'landing', private: true });

        expect(seen[1].path).toBe('/user/repos');
    });

    it('refuses to write a repository secret rather than sending it in the clear', async () =>
    {
        const failed = await github()
            .setSecret({ repositoryId: 'R_1', name: 'DATABASE_URL', value: 'postgres://u:p@h/d' })
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_DEPLOY_FAILED');
        expect((failed as KitError).evidence.reason).toBe('sealed-box-unavailable');
        expect(JSON.stringify((failed as KitError).evidence)).not.toContain('postgres://');
    });

    it('hands git its credential in the environment, never in an argument', async () =>
    {
        const calls: RunRequest[] = [];
        const api = new GithubHttpApi({
            baseUrl: origin,
            token: async () => TOKEN,
            async run(request): Promise<RunResult>
            {
                calls.push(request);

                return { exitCode: 0, stdout: '', stderr: '', missing: false };
            },
        });

        await api.pushBranch({ repositoryId: 'R_1', branch: 'main', commit: 'a'.repeat(40), cwd: '/tmp' });

        expect(calls[0].file).toBe('git');
        expect(JSON.stringify(calls[0].args)).not.toContain(TOKEN);
        expect(calls[0].extraEnv?.GIT_TERMINAL_PROMPT).toBe('0');

        // Basic, with the token as the password. GitHub's git-over-HTTPS
        // endpoint refuses a bearer token outright — the same token, the same
        // repository, `invalid credentials` because the scheme is wrong.
        const header = calls[0].extraEnv?.GIT_CONFIG_VALUE_0 ?? '';
        const prefix = 'Authorization: Basic ';

        expect(header.startsWith(prefix)).toBe(true);
        expect(header).not.toContain(TOKEN);
        expect(Buffer.from(header.slice(prefix.length), 'base64').toString('utf8'))
            .toBe(`x-access-token:${TOKEN}`);
    });
});

describe('the Supabase transport', () =>
{
    it('finds a project by organisation and name, and takes its ref as identity', async () =>
    {
        answer('GET', '/v1/projects', [
            { id: 'abcdefghijklmnop', organization_id: 'org_1', name: 'landing', region: 'ap-northeast-2', status: 'ACTIVE_HEALTHY' },
            { id: 'other', organization_id: 'org_2', name: 'landing', region: 'us-east-1' },
        ]);

        const project = await supabase().findProject({ organizationId: 'org_1', name: 'landing' });

        expect(project?.ref).toBe('abcdefghijklmnop');
        expect(project?.region).toBe('ap-northeast-2');
        expect(project?.status).toBe('active');
    });

    it('sends the generated database password in the body and nowhere else', async () =>
    {
        answer('POST', '/v1/projects', {
            id: 'newref', organization_id: 'org_1', name: 'landing', region: 'ap-northeast-2',
        });

        await supabase().createProject({
            organizationId: 'org_1', name: 'landing', region: 'ap-northeast-2', plan: 'free',
        });

        const request = seen.find(entry => entry.method === 'POST') as Recorded;

        expect(request.path).toBe('/v1/projects');
        expect(request.body).toMatchObject({ organization_id: 'org_1', plan: 'free' });
        // In the body, and not in the path or the query where a log would keep it.
        expect(request.path).not.toContain('generated-database-password');
    });

    it('takes the backup from the Kit\'s own dump, not from a provider endpoint', async () =>
    {
        const api = supabase({ backups: { async createBackup() 
        {
            return { backupId: 'bk-from-dump' }; 
        } } });

        expect(await api.createBackup({ projectRef: 'ref' })).toEqual({ backupId: 'bk-from-dump' });
        // The free plan has no backup API, so none was called.
        expect(seen).toHaveLength(0);
    });

    it('asks the migration runner what is applied rather than the Management API', async () =>
    {
        const api = supabase({
            migrations: {
                async applied() 
                {
                    return ['0001_init']; 
                },
                async apply(request) 
                {
                    return { applied: request.migrations }; 
                },
            },
        });

        expect(await api.appliedMigrations({ projectRef: 'ref' })).toEqual(['0001_init']);
        expect(seen).toHaveLength(0);
    });
});

describe('the Vercel transport', () =>
{
    it('reads a project and adds no team query on a Hobby account', async () =>
    {
        answer('GET', '/v9/projects/landing', { id: 'prj_1', name: 'landing' });

        const project = await vercel().findProject({ teamId: '', name: 'landing' });

        expect(project?.id).toBe('prj_1');
        expect(seen[0].path).toBe('/v9/projects/landing');
    });

    it('carries the team id on a team account', async () =>
    {
        answer('GET', '/v9/projects/landing', { id: 'prj_1', name: 'landing' });
        await vercel('team_1').findProject({ teamId: 'team_1', name: 'landing' });

        expect(seen[0].path).toBe('/v9/projects/landing?teamId=team_1');
    });

    it('builds the staged deployment in the production environment', async () =>
    {
        answer('GET', '/v9/projects/prj_1', {
            id: 'prj_1',
            name: 'landing',
            link: { type: 'github', repoId: 1338078985, productionBranch: 'main' },
        });
        answer('POST', '/v13/deployments', {
            id: 'dpl_1', url: 'landing-abc.vercel.app', readyState: 'BUILDING', projectId: 'prj_1',
            target: 'production',
        });

        const deployment = await vercel().createStagedDeployment({ projectId: 'prj_1', commit: 'a'.repeat(40) });
        const body = seen[1].body as { target?: unknown; gitSource?: Record<string, unknown> };

        expect(deployment.state).toBe('building');
        expect(deployment.url).toBe('https://landing-abc.vercel.app');
        // Unit 09 §9.1: the build is a production build and what keeps it off
        // the domain is auto-assignment being off, which `ensureStagedProduction`
        // writes. A preview build would be handed none of the encrypted
        // production environment — no registry credential, no database, no
        // origin — so it would either fail to install or pass the gates as a
        // differently configured program than the one promotion serves.
        expect(body.target).toBe('production');
        expect(deployment.target).toBe('production');
        // The repository id Vercel requires, and the exact commit as `ref` —
        // a request that named only a branch would build whatever the branch
        // has moved to rather than the commit the gates passed on.
        expect(body.gitSource?.repoId).toBe(1338078985);
        expect(body.gitSource?.ref).toBe('a'.repeat(40));
        // Naming the production branch as well made Vercel build the commit
        // twice. One request, one deployment.
        expect(body.gitSource?.sha).toBeUndefined();
    });

    it('reads what visitors get from the alias, not from the newest production build', async () =>
    {
        answer('GET', '/v4/aliases', {
            aliases: [
                { alias: 'landing-git-main.vercel.app', deploymentId: 'dpl_newest' },
                { alias: 'landing.vercel.app', deploymentId: 'dpl_live' },
            ],
        });
        answer('GET', '/v13/deployments/dpl_live', {
            id: 'dpl_live', readyState: 'READY', url: 'live.vercel.app', projectId: 'prj_1',
            target: 'production', meta: { githubCommitSha: 'b'.repeat(40) },
        });

        const current = await vercel().currentProduction({
            projectId: 'prj_1',
            productionDomain: 'https://landing.vercel.app',
        });

        // A build can exist, be production-target and be newer while serving
        // nobody. The alias is what a visitor's request resolves through.
        expect(current?.id).toBe('dpl_live');
        expect(seen.some(call => call.path.startsWith('/v6/deployments'))).toBe(false);
    });

    it('falls back to the newest production build when no domain was given', async () =>
    {
        answer('GET', '/v6/deployments', {
            deployments: [{ uid: 'dpl_newest', readyState: 'READY', url: 'newest.vercel.app', target: 'production' }],
        });

        const current = await vercel().currentProduction({ projectId: 'prj_1' });

        expect(current?.id).toBe('dpl_newest');
    });

    it('refuses to build when the hosting project is linked to no repository', async () =>
    {
        answer('GET', '/v9/projects/prj_1', { id: 'prj_1', name: 'landing' });

        const failed = await vercel()
            .createStagedDeployment({ projectId: 'prj_1', commit: 'a'.repeat(40) })
            .catch((error: unknown) => error);

        expect(isKitError(failed) && failed.code).toBe('KIT_DEPLOY_FAILED');
    });

    it('reads a deployment\'s readiness into the three states a gate branches on', async () =>
    {
        const cases = [
            ['READY', 'ready'],
            ['ERROR', 'error'],
            ['CANCELED', 'error'],
            ['QUEUED', 'building'],
            ['INITIALIZING', 'building'],
            ['BUILDING', 'building'],
            /* A deployment the project refused to build. Read as `building` it
               would be polled until the build timeout and then reported as a
               timeout, which names neither the state nor the reason. */
            ['BLOCKED', 'error'],
            ['DELETED', 'error'],
            /* Whatever the provider adds next. Unknown is not progress. */
            ['SOME_FUTURE_STATE', 'error'],
        ];

        for (const [readyState, expected] of cases)
        {
            answers.clear();
            answer('GET', '/v13/deployments/dpl_1', { id: 'dpl_1', readyState, url: 'x.vercel.app', projectId: 'prj_1' });

            const deployment = await vercel().readDeployment({ deploymentId: 'dpl_1' });

            expect(deployment?.state, readyState).toBe(expected);
        }
    });

    it('finds an existing build for a commit, which is what makes a resume cheap', async () =>
    {
        answer('GET', '/v6/deployments', {
            deployments: [
                { uid: 'dpl_other', readyState: 'READY', meta: { githubCommitSha: 'b'.repeat(40) } },
                { uid: 'dpl_match', readyState: 'READY', meta: { githubCommitSha: 'a'.repeat(40) } },
            ],
        });

        const found = await vercel().findDeploymentForCommit({ projectId: 'prj_1', commit: 'a'.repeat(40) });

        expect(found?.id).toBe('dpl_match');
    });

    it('writes environment variables one at a time, encrypted and production-scoped', async () =>
    {
        answer('POST', '/v10/projects/prj_1/env', { created: true });

        await vercel().setEnvironment({
            projectId: 'prj_1',
            variables: [{ key: 'DATABASE_URL', value: 'postgres://u:p@h/d' }],
        });

        expect(seen[0].body).toMatchObject({ key: 'DATABASE_URL', type: 'encrypted', target: ['production'] });
    });
});

describe('what every transport does with the token', () =>
{
    it('sends it in an Authorization header and in nothing else', async () =>
    {
        answer('GET', '/repos/acme/landing', {
            node_id: 'R_1', name: 'landing', default_branch: 'main', owner: { login: 'acme' },
        });
        answer('GET', '/v1/projects', []);
        answer('GET', '/v9/projects/landing', { id: 'prj_1', name: 'landing' });

        await github().findRepository({ owner: 'acme', name: 'landing' });
        await supabase().findProject({ organizationId: 'org_1', name: 'landing' });
        await vercel().findProject({ teamId: '', name: 'landing' });

        expect(seen).toHaveLength(3);

        for (const entry of seen)
        {
            expect(entry.authorization).toBe(`Bearer ${TOKEN}`);
            expect(entry.path).not.toContain(TOKEN);
            expect(JSON.stringify(entry.body)).not.toContain(TOKEN);
        }
    });

    it('keeps it out of the error a failed call raises', async () =>
    {
        answer('GET', '/v1/projects', { message: 'Unauthorized' }, 401);

        const failed = await supabase().findProject({ organizationId: 'org_1', name: 'landing' })
            .catch(error => error as Error);

        expect(String(failed.message)).toContain('401');
        expect(String(failed.message)).not.toContain(TOKEN);
    });
});

describe('the health probe', () =>
{
    it('reads the health route and reports the status it got', async () =>
    {
        answer('GET', '/api/health', { status: 'ok' });

        const probe = await new HttpHealthProbe().check({ url: origin });

        expect(probe.ok).toBe(true);
        expect(probe.status).toBe(200);
    });

    it('reports a probe that could not connect as a failed probe, not an error', async () =>
    {
        const probe = await new HttpHealthProbe({ timeoutMs: 250 }).check({ url: 'http://127.0.0.1:1' });

        expect(probe.ok).toBe(false);
        expect(probe.status).toBe(0);
    });
});
