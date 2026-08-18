/**
 * Unit 09 table A's authorization cases, and B9, from the CLI's side.
 *
 * The whole difficulty of a browser consent flow is that the CLI cannot see the
 * browser. It cannot tell a person thinking from a person who closed the tab,
 * and the contract forbids it from guessing: silence stays `waiting-approval`
 * and becomes `approval-expired` on the relay's clock, while only a provider
 * saying no becomes `approval-denied`. These cases are that distinction, plus
 * the two rules that keep one approval from becoming two grants.
 *
 * The fixture answers with the control plane's real statuses and error codes.
 * No provider and no browser is involved, and nothing leaves loopback.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approvalOutcome, CloudRelayClient, deadlinePassed } from '../../src/kit/cloud/relay.js';
import { buildCloudPlan } from '../../src/kit/cloud/approval.js';
import { freeTierPlanRequest } from '../../src/kit/cloud/free-tier.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';

const NOW = '2026-08-18T09:00:00Z';

let server: Server;
let origin: string;
let seen: { method: string; path: string; body: unknown }[];
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
        path: url.pathname,
        body: chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString('utf8')),
    });

    const found = answers.get(`${request.method} ${url.pathname}`);
    const text = JSON.stringify(found?.body ?? { message: 'Not Found' });

    response.writeHead(found?.status ?? 404, {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(text)),
    });
    response.end(text);
}

function client(): CloudRelayClient
{
    return new CloudRelayClient({ baseUrl: origin, timeoutMs: 5_000 });
}

function plan()
{
    return buildCloudPlan(freeTierPlanRequest({
        operationId: 'op-20260818090000-install-aa11',
        activationId: 'act-01hzlandingkite2e',
        sourceTreeDigest: `sha256:${'b'.repeat(64)}`,
        now: NOW,
        github: {
            ownerId: 'O_kgDOowner',
            ownerLogin: 'landing-kit-owner',
            repositoryName: 'landing-kit-e2e',
            visibility: 'private',
            productionBranch: 'main',
            create: true,
        },
        supabase: {
            organizationId: 'org_1',
            organizationName: 'Landing Kit E2E',
            projectName: 'landing-kit-e2e',
            region: 'ap-northeast-2',
        },
        vercel: {
            teamId: 'personal',
            teamName: 'landing-kit-owner',
            projectName: 'landing-kit-e2e',
            region: 'icn1',
        },
        requestedScopes: ['metadata:read', 'contents:write', 'project:write'],
    }));
}

const OPENED = {
    relayId: 'rly-0001',
    state: 'state-value',
    nonce: 'nonce-value',
    pickupSecret: 'pickup-secret-value',
    expiresAt: '2026-08-18T09:15:00Z',
};

describe('table A — the browser authorization', () =>
{
    it('A4 — publishes the exact plan and gets back the digest consent will name', async () =>
    {
        const built = plan();

        answer('POST', '/cloud/plans', {
            operationId: built.operationId,
            approvalDigest: built.approvalDigest,
        });

        const stored = await client().publishPlan(built);

        expect(stored.approvalDigest).toBe(built.approvalDigest);
        // Sent as built: the service refuses a plan that does not carry its own
        // digest rather than re-digesting it, so nothing is recomputed here.
        expect((seen[0].body as { approvalDigest: string }).approvalDigest).toBe(built.approvalDigest);
    });

    it('A5 — opening an authorization returns the three secrets, once', async () =>
    {
        answer('POST', '/cloud/authorizations', OPENED);

        const opened = await client().openAuthorization({
            operationId: 'op-20260818090000-install-aa11',
            provider: 'github',
        });

        expect(opened.relayId).toBe('rly-0001');
        expect(opened.nonce).toBe('nonce-value');
        expect(opened.pickupSecret).toBe('pickup-secret-value');
    });

    it('A6 — a closed browser stays waiting, and is not read as a denial', async () =>
    {
        answer('GET', '/cloud/authorizations/rly-0001', {
            schemaVersion: 1,
            status: 'waiting-approval',
            provider: 'github',
        });

        const state = await client().readAuthorization('rly-0001');
        const outcome = approvalOutcome(state.status);

        expect(state.status).toBe('waiting-approval');
        expect(outcome.resumable).toBe(true);
        expect(outcome.terminal).toBe(false);
        expect(outcome.code).toBe('CLOUD_WAITING_APPROVAL');
    });

    it('A7 — an explicit denial is final, and nothing was created', async () =>
    {
        answer('GET', '/cloud/authorizations/rly-0001', { schemaVersion: 1, status: 'approval-denied' });

        const outcome = approvalOutcome((await client().readAuthorization('rly-0001')).status);

        expect(outcome.terminal).toBe(true);
        expect(outcome.resumable).toBe(false);
        expect(outcome.code).toBe('CLOUD_APPROVAL_DENIED');
    });

    it('A8 — silence that ran out of time expires rather than being retried', async () =>
    {
        answer('GET', '/cloud/authorizations/rly-0001', { schemaVersion: 1, status: 'approval-expired' });

        const outcome = approvalOutcome((await client().readAuthorization('rly-0001')).status);

        expect(outcome.code).toBe('CLOUD_APPROVAL_EXPIRED');
        expect(outcome.resumable).toBe(false);
    });

    it('collects the grant once, and reports a second collection as spent', async () =>
    {
        answer('POST', '/cloud/authorizations/rly-0001/result', {
            provider: 'github',
            operationId: 'op-20260818090000-install-aa11',
            activationId: 'act-01hzlandingkite2e',
            grant: {
                accountId: 'O_kgDOowner',
                accountLabel: 'landing-kit-owner',
                grant: 'ghs_short_lived',
                scopes: ['metadata:read'],
                expiresAt: '2026-08-18T10:00:00Z',
            },
            target: null,
        });

        const collected = await client().collectGrant({ relayId: 'rly-0001', pickupSecret: 'pickup-secret-value' });

        expect(collected.grant.accountId).toBe('O_kgDOowner');

        // The service marks the relay consumed, so the next attempt is gone.
        answer('POST', '/cloud/authorizations/rly-0001/result', { message: 'no longer collectable' }, 410);

        const failed = await client().collectGrant({ relayId: 'rly-0001', pickupSecret: 'pickup-secret-value' })
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_DEPLOY_FAILED');
        expect((failed as KitError).evidence.reason).toBe('authorization-consumed-or-expired');
    });

    it('reports a wrong pickup secret as unverified, not as a network problem', async () =>
    {
        answer('POST', '/cloud/authorizations/rly-0001/result', { message: 'could not be verified' }, 400);

        const failed = await client().collectGrant({ relayId: 'rly-0001', pickupSecret: 'wrong' })
            .catch(error => error as KitError);

        expect((failed as KitError).evidence.reason).toBe('authorization-unverified');
    });
});

describe('what the CLI has to enforce because the service does not', () =>
{
    it('A2 — refuses to open a consent screen for a plan nobody approved', async () =>
    {
        const built = plan();

        // The service opens an authorization against an unapproved plan quite
        // happily, and the relay it opens can never reach `applied`. So the
        // check is here, before the customer is sent anywhere.
        answer('GET', `/cloud/plans/${built.operationId}`, { plan: built, approved: false, intact: true });

        const failed = await client().requireApprovedPlan(built.operationId).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_DEPLOY_FAILED');
        expect((failed as KitError).evidence.reason).toBe('approval-required');
        expect((failed as KitError).next?.requiresHumanApproval).toBe(true);
    });

    it('refuses a stored plan the service reports as no longer intact', async () =>
    {
        const built = plan();

        answer('GET', `/cloud/plans/${built.operationId}`, { plan: built, approved: true, intact: false });

        const failed = await client().requireApprovedPlan(built.operationId).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
        expect((failed as KitError).evidence.reason).toBe('plan-not-intact');
    });

    it('returns the approved plan when there is one', async () =>
    {
        const built = plan();

        answer('GET', `/cloud/plans/${built.operationId}`, { plan: built, approved: true, intact: true });

        expect((await client().requireApprovedPlan(built.operationId)).approvalDigest).toBe(built.approvalDigest);
    });

    it('holds the service to the deadline it gave, because expiry there is lazy', () =>
    {
        // The relay row only becomes `expired` when something calls in late, so
        // a poll loop that waited for the status to change would wait forever.
        expect(deadlinePassed('2026-08-18T09:15:00Z', '2026-08-18T09:14:59Z')).toBe(false);
        expect(deadlinePassed('2026-08-18T09:15:00Z', '2026-08-18T09:15:00Z')).toBe(true);
        // An unreadable deadline counts as passed: the alternative is a wait
        // that never ends.
        expect(deadlinePassed('not-a-date', '2026-08-18T09:15:00Z')).toBe(true);
    });
});

describe('table B — one approval, one authorization', () =>
{
    it('B9 — a resume never opens a second authorization for one operation', async () =>
    {
        answer('POST', '/cloud/authorizations', {
            message: 'An authorization is already open for that operation',
            details: { relayId: 'rly-0001', state: 'awaiting-callback', expiresAt: '2026-08-18T09:15:00Z' },
        }, 409);

        const failed = await client().openAuthorization({
            operationId: 'op-20260818090000-install-aa11',
            provider: 'github',
        }).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_DEPLOY_FAILED');
        expect((failed as KitError).evidence.reason).toBe('authorization-already-open');
        expect((failed as KitError).evidence.relayId).toBe('rly-0001');
        // The secrets are not reissued, so the honest recovery is to wait.
        expect((failed as KitError).evidence.recovery).toBe('wait-for-expiry');
    });

    it('the conflict carries identity and no secret', async () =>
    {
        answer('POST', '/cloud/authorizations', {
            message: 'An authorization is already open for that operation',
            details: { relayId: 'rly-0001', state: 'awaiting-callback', expiresAt: '2026-08-18T09:15:00Z' },
        }, 409);

        const failed = await client().openAuthorization({ operationId: 'op-1', provider: 'github' })
            .catch(error => error as KitError);
        const evidence = JSON.stringify((failed as KitError).evidence);

        for (const secret of ['nonce', 'pickup', 'secret'])
        {
            expect(evidence.toLowerCase()).not.toContain(secret);
        }
    });
});

describe('the plan the customer will be shown', () =>
{
    it('refuses a plan the service says is not self-consistent', async () =>
    {
        answer('POST', '/cloud/plans', { message: 'does not carry the digest of its own contents' }, 400);

        const failed = await client().publishPlan(plan()).catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MANIFEST_INVALID');
        expect((failed as KitError).evidence.reason).toBe('plan-digest-mismatch');
    });

    it('reads back whether the customer approved, and whether the row is intact', async () =>
    {
        const built = plan();

        answer('GET', `/cloud/plans/${built.operationId}`, { plan: built, approved: true, intact: true });

        const state = await client().planApproval(built.operationId);

        expect(state.approved).toBe(true);
        expect(state.intact).toBe(true);
        expect(state.plan?.approvalDigest).toBe(built.approvalDigest);
    });

    it('reports a plan edited in place as not intact', async () =>
    {
        const built = plan();

        answer('GET', `/cloud/plans/${built.operationId}`, {
            plan: { ...built, supabase: { ...built.supabase, plan: 'pro' } },
            approved: true,
            intact: false,
        });

        expect((await client().planApproval(built.operationId)).intact).toBe(false);
    });

    it('shows the free tier exactly, zero price and all', () =>
    {
        const built = plan();

        expect(built.supabase.plan).toBe('free');
        expect(built.vercel.plan).toBe('hobby');
        expect(built.supabase.currentPriceQuote).toContain('USD 0.00');
        // The two things a zero price hides, said out loud.
        expect(built.supabase.currentPriceQuote).toContain('No automatic backups');
        expect(built.vercel.currentPriceQuote).toContain('non-commercial');
        // And the digest flow is unchanged: consent still names one document.
        expect(built.approvalDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
});
