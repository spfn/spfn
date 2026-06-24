/**
 * Proxy-guard middleware 테스트
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

import { createProxyGuard, type NonceStore } from '../proxy-guard';
import { signProxyRequest, parseProxyKey } from '../../security/proxy-signature';

const SECRET = 'test-shared-secret';

/**
 * Build a Hono app whose handler echoes back the parsed body and clientType,
 * so we can assert both verification outcome AND that body-reading still works.
 */
function buildApp(guard: ReturnType<typeof createProxyGuard>)
{
    const app = new Hono();
    app.use('*', guard);
    app.post('/users', async (c) =>
    {
        const body = await c.req.json();

        return c.json({ clientType: c.get('clientType'), echo: body });
    });
    app.get('/users/:id', (c) => c.json({ clientType: c.get('clientType'), id: c.req.param('id') }));
    app.get('/files/:name', (c) => c.json({ clientType: c.get('clientType'), name: c.req.param('name') }));
    app.get('/search', (c) => c.json({ clientType: c.get('clientType') }));

    return app;
}

function signedHeaders(method: string, path: string, body?: string, secret = SECRET, query?: string)
{
    return signProxyRequest({ key: parseProxyKey(secret), method, path, query, body });
}

describe('createProxyGuard', () =>
{
    describe('mode: strict', () =>
    {
        const guard = createProxyGuard({ mode: 'strict', secret: SECRET });

        it('accepts a properly signed request and tags clientType=web', async () =>
        {
            const app = buildApp(guard);
            const body = JSON.stringify({ name: 'Ray' });

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...signedHeaders('POST', '/users', body) },
                body,
            });

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.clientType).toBe('web');
            // body must still be readable by the handler after the guard cloned it
            expect(json.echo).toEqual({ name: 'Ray' });
        });

        it('rejects an unsigned request with 403', async () =>
        {
            const app = buildApp(guard);
            const body = JSON.stringify({ name: 'Ray' });

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
            });

            expect(res.status).toBe(403);
        });

        it('rejects a request whose body was tampered after signing', async () =>
        {
            const app = buildApp(guard);
            const signedBody = JSON.stringify({ amount: 100 });
            const tamperedBody = JSON.stringify({ amount: 999999 });

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...signedHeaders('POST', '/users', signedBody) },
                body: tamperedBody,
            });

            expect(res.status).toBe(403);
        });

        it('verifies a signed GET request', async () =>
        {
            const app = buildApp(guard);

            const res = await app.request('/users/42', {
                method: 'GET',
                headers: { ...signedHeaders('GET', '/users/42') },
            });

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.clientType).toBe('web');
        });
    });

    describe('mode: tag', () =>
    {
        const guard = createProxyGuard({ mode: 'tag', secret: SECRET });

        it('lets an unsigned request through but tags it untrusted', async () =>
        {
            const app = buildApp(guard);
            const body = JSON.stringify({ name: 'Ray' });

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
            });

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.clientType).toBe('untrusted');
            expect(json.echo).toEqual({ name: 'Ray' });
        });

        it('tags a properly signed request as web', async () =>
        {
            const app = buildApp(guard);
            const body = JSON.stringify({ name: 'Ray' });

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'content-type': 'application/json', ...signedHeaders('POST', '/users', body) },
                body,
            });

            const json = await res.json();
            expect(json.clientType).toBe('web');
        });
    });

    describe('mode: off', () =>
    {
        it('is a no-op (no clientType, no rejection)', async () =>
        {
            const app = buildApp(createProxyGuard({ mode: 'off', secret: SECRET }));
            const body = JSON.stringify({ name: 'Ray' });

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body,
            });

            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.clientType).toBeUndefined();
        });
    });

    describe('origin allowlist', () =>
    {
        const guard = createProxyGuard({
            mode: 'strict',
            secret: SECRET,
            allowedOrigins: ['https://app.example.com'],
        });

        it('rejects a disallowed Origin', async () =>
        {
            const app = buildApp(guard);
            const body = JSON.stringify({ name: 'Ray' });

            const res = await app.request('/users', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    origin: 'https://evil.example.com',
                    ...signedHeaders('POST', '/users', body),
                },
                body,
            });

            expect(res.status).toBe(403);
        });

        it('accepts an allowed Origin with a valid signature', async () =>
        {
            const app = buildApp(guard);
            const body = JSON.stringify({ name: 'Ray' });

            const res = await app.request('/users', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    origin: 'https://app.example.com',
                    ...signedHeaders('POST', '/users', body),
                },
                body,
            });

            expect(res.status).toBe(200);
        });
    });

    describe('nonce replay rejection', () =>
    {
        it('rejects a replayed nonce when a nonce store is provided', async () =>
        {
            const seen = new Set<string>();
            const nonceStore: NonceStore = {
                async checkAndSet(nonce)
                {
                    if (seen.has(nonce))
                    {
                        return false;
                    }
                    seen.add(nonce);

                    return true;
                },
            };

            const guard = createProxyGuard({ mode: 'strict', secret: SECRET, nonceStore });
            const app = buildApp(guard);
            const headers = { ...signedHeaders('GET', '/users/7') };

            const first = await app.request('/users/7', { method: 'GET', headers });
            expect(first.status).toBe(200);

            // Same signed headers (same nonce) replayed → rejected
            const second = await app.request('/users/7', { method: 'GET', headers });
            expect(second.status).toBe(403);
        });
    });

    describe('fail-closed on misconfiguration', () =>
    {
        it('throws at construction when strict mode has no key', () =>
        {
            expect(() => createProxyGuard({ mode: 'strict', secret: '' })).toThrow(/strict/);
        });

        it('does not throw in tag mode with no key (observe-only)', () =>
        {
            expect(() => createProxyGuard({ mode: 'tag', secret: '' })).not.toThrow();
        });
    });

    describe('wire request-target binding', () =>
    {
        const guard = createProxyGuard({ mode: 'strict', secret: SECRET });

        it('verifies a percent-encoded path without decode drift', async () =>
        {
            const app = buildApp(guard);
            const res = await app.request('/files/a%2Fb', {
                method: 'GET',
                headers: { ...signedHeaders('GET', '/files/a%2Fb') },
            });

            expect(res.status).toBe(200);
        });

        it('verifies a matching query string', async () =>
        {
            const app = buildApp(guard);
            const res = await app.request('/search?q=hi&limit=10', {
                method: 'GET',
                headers: { ...signedHeaders('GET', '/search', undefined, SECRET, '?q=hi&limit=10') },
            });

            expect(res.status).toBe(200);
        });

        it('rejects a tampered query param', async () =>
        {
            const app = buildApp(guard);
            const res = await app.request('/search?limit=99999', {
                method: 'GET',
                headers: { ...signedHeaders('GET', '/search', undefined, SECRET, '?limit=10') },
            });

            expect(res.status).toBe(403);
        });

        it('binds the body even for a non-json content-type', async () =>
        {
            const app = buildApp(guard);
            const signedBody = JSON.stringify({ amount: 100 });
            const tampered = JSON.stringify({ amount: 999999 });

            const res = await app.request('/users', {
                method: 'POST',
                headers: { 'content-type': 'text/plain', ...signedHeaders('POST', '/users', signedBody) },
                body: tampered,
            });

            expect(res.status).toBe(403);
        });
    });

    describe('bypass-path handling', () =>
    {
        it('skips OPTIONS preflight without a signature', async () =>
        {
            const app = buildApp(createProxyGuard({ mode: 'strict', secret: SECRET }));
            const res = await app.request('/users', { method: 'OPTIONS' });

            expect(res.status).not.toBe(403);
        });

        it('skips configured skipPaths without a signature', async () =>
        {
            const guard = createProxyGuard({ mode: 'strict', secret: SECRET, skipPaths: ['/events/stream'] });
            const app = new Hono();
            app.use('*', guard);
            app.get('/events/stream', (c) => c.json({ ok: true }));

            const res = await app.request('/events/stream', { method: 'GET' });
            expect(res.status).toBe(200);
        });
    });

    describe('key rotation (grace window)', () =>
    {
        // Backend mid-rotation: active v2, still accepting v1
        const guard = createProxyGuard({
            mode: 'strict',
            secret: 'v2:new-secret',
            previousSecrets: 'v1:old-secret',
        });

        it('accepts the new active key', async () =>
        {
            const app = buildApp(guard);
            const res = await app.request('/users/1', {
                method: 'GET',
                headers: { ...signedHeaders('GET', '/users/1', undefined, 'v2:new-secret') },
            });

            expect(res.status).toBe(200);
        });

        it('still accepts the previous (grace) key', async () =>
        {
            const app = buildApp(guard);
            const res = await app.request('/users/1', {
                method: 'GET',
                headers: { ...signedHeaders('GET', '/users/1', undefined, 'v1:old-secret') },
            });

            expect(res.status).toBe(200);
        });

        it('rejects a retired key no longer in the set', async () =>
        {
            const app = buildApp(guard);
            const res = await app.request('/users/1', {
                method: 'GET',
                headers: { ...signedHeaders('GET', '/users/1', undefined, 'v0:retired-secret') },
            });

            expect(res.status).toBe(403);
        });
    });
});
