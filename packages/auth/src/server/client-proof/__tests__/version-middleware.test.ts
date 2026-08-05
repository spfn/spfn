/**
 * The middleware over a real Hono app.
 *
 * The cases are the ones that decide whether a deployed client is met at all:
 * an unproven route (which is where a stale app arrives first), a refusal, and
 * a pass. The announcement has to reach all three — a refused client needs it
 * most, since the refusal says the two ends disagree and the range says how.
 */
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { CONTRACT_SUPPORTED_RANGE, CONTRACT_VERSION } from '../contract-bundle';
import { CLIENT_IDENTITY_CONTEXT_KEY, createClientVersionMiddleware } from '../version-middleware';
import { CLIENT_IDENTITY_HEADERS, SERVER_CONTRACT_HEADERS } from '../wire-version';

function app(): Hono
{
    const instance = new Hono();
    instance.use('*', createClientVersionMiddleware());
    instance.post('/_auth/login', (c) => c.json({ ok: true }));
    instance.get('/whoami', (c) => c.json({ identity: c.get(CLIENT_IDENTITY_CONTEXT_KEY) ?? null }));

    return instance;
}

function call(headers: Record<string, string> = {}, path = '/_auth/login'): Promise<Response>
{
    return app().request(path, { method: path === '/whoami' ? 'GET' : 'POST', headers });
}

describe('the server announces itself', () =>
{
    it('states its version and range on a normal response', async () =>
    {
        const response = await call({
            [CLIENT_IDENTITY_HEADERS.kind]: 'ios',
            [CLIENT_IDENTITY_HEADERS.contractVersion]: CONTRACT_VERSION,
        });

        expect(response.status).toBe(200);
        expect(response.headers.get(SERVER_CONTRACT_HEADERS.version)).toBe(CONTRACT_VERSION);
        expect(response.headers.get(SERVER_CONTRACT_HEADERS.supportedRange)).toBe(CONTRACT_SUPPORTED_RANGE);
    });

    it('states them on a refusal too', async () =>
    {
        const response = await call({
            [CLIENT_IDENTITY_HEADERS.kind]: 'android',
            [CLIENT_IDENTITY_HEADERS.contractVersion]: '0.4.0',
        });

        expect(response.status).toBe(409);
        expect(response.headers.get(SERVER_CONTRACT_HEADERS.version)).toBe(CONTRACT_VERSION);
        expect(response.headers.get(SERVER_CONTRACT_HEADERS.supportedRange)).toBe(CONTRACT_SUPPORTED_RANGE);
    });

    it('states them to a caller that announced nothing', async () =>
    {
        const response = await call({});

        expect(response.status).toBe(200);
        expect(response.headers.get(SERVER_CONTRACT_HEADERS.version)).toBe(CONTRACT_VERSION);
    });
});

describe('an app kind is judged on the contract version it states', () =>
{
    it('passes one the server serves', async () =>
    {
        const response = await call({
            [CLIENT_IDENTITY_HEADERS.kind]: 'ios',
            [CLIENT_IDENTITY_HEADERS.version]: '3.1.4',
            [CLIENT_IDENTITY_HEADERS.contractVersion]: CONTRACT_VERSION,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });

    it('refuses one the server does not serve, with the contract envelope', async () =>
    {
        const response = await call({
            [CLIENT_IDENTITY_HEADERS.kind]: 'ios',
            [CLIENT_IDENTITY_HEADERS.contractVersion]: '0.4.0',
        });
        const body = await response.json() as { error: { code: string; message: string; requestId: string } };

        expect(response.status).toBe(409);
        expect(body.error.code).toBe('CONTRACT_UNSUPPORTED');
        expect(body.error.requestId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('refuses one that states no contract version at all', async () =>
    {
        const response = await call({ [CLIENT_IDENTITY_HEADERS.kind]: 'android' });
        const body = await response.json() as { error: { code: string } };

        expect(response.status).toBe(409);
        expect(body.error.code).toBe('CONTRACT_UNSUPPORTED');
    });

    it('reaches an unproven route, which is where a stale app arrives first', async () =>
    {
        // Enrollment and login carry no proof — there is no key to sign with
        // yet. A check inside proof admission would never see this request.
        const response = await call({ [CLIENT_IDENTITY_HEADERS.kind]: 'ios' }, '/_auth/login');

        expect(response.status).toBe(409);
    });
});

describe('kinds that are not judged on a contract version', () =>
{
    it('passes web, which ships with the server that serves it', async () =>
    {
        const response = await call({
            [CLIENT_IDENTITY_HEADERS.kind]: 'web',
            [CLIENT_IDENTITY_HEADERS.version]: 'build-8812',
        });

        expect(response.status).toBe(200);
    });

    it('passes a caller that names no kind', async () =>
    {
        // A curl, a health probe, a server-to-server call. The rule is about
        // what a deployed client says about itself.
        expect((await call({})).status).toBe(200);
    });

    it('passes a kind it does not recognise rather than guessing', async () =>
    {
        expect((await call({ [CLIENT_IDENTITY_HEADERS.kind]: 'toaster' })).status).toBe(200);
    });
});

describe('what a handler can read', () =>
{
    it('finds the identity of a client that announced one', async () =>
    {
        const response = await call({
            [CLIENT_IDENTITY_HEADERS.kind]: 'web',
            [CLIENT_IDENTITY_HEADERS.version]: 'build-8812',
        }, '/whoami');

        expect(await response.json()).toEqual({
            identity: { kind: 'web', version: 'build-8812', contractVersion: null },
        });
    });

    it('finds nothing for a caller that announced none', async () =>
    {
        const response = await call({}, '/whoami');

        expect(await response.json()).toEqual({ identity: null });
    });
});
