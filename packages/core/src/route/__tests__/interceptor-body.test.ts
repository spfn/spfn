/**
 * Interceptor-declared body parsing
 *
 * A route may declare its whole request body through `.interceptor({ body })` — the fields
 * a middleware injects — and no `.input`. The handler must still receive the parsed body.
 * Regression test for issue #105 (`POST /_auth/keys/rotate` saw an empty body).
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { Type } from '@sinclair/typebox';
import { route, defineRouter, registerRoutes, FileSchema } from '../index';
import { ErrorHandler } from '../../middleware/error-handler';

/**
 * Build a Hono app exposing a single route under the name `testRoute`
 */
function appWith(routeDef: any): Hono
{
    const app = new Hono();
    app.onError(ErrorHandler());
    registerRoutes(app, defineRouter({ testRoute: routeDef }));

    return app;
}

describe('interceptor-declared body', () =>
{
    it('parses the body of a route whose body is declared only by the interceptor', async () =>
    {
        const rotateKey = route.post('/keys/rotate')
            .interceptor({
                body: Type.Object({
                    publicKey: Type.String(),
                    keyId: Type.String(),
                    fingerprint: Type.String(),
                }),
            })
            .handler(async (c) =>
            {
                const { body } = await c.data();

                return {
                    publicKey: body.publicKey,
                    keyId: body.keyId,
                    fingerprint: body.fingerprint,
                };
            });

        const res = await appWith(rotateKey).request('/keys/rotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicKey: 'pk-1', keyId: 'kid-1', fingerprint: 'fp-1' }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ publicKey: 'pk-1', keyId: 'kid-1', fingerprint: 'fp-1' });
    });

    it('keeps input validation and interceptor pass-through on a route declaring both', async () =>
    {
        const login = route.post('/login')
            .input({
                body: Type.Object({
                    email: Type.String(),
                    password: Type.String(),
                }),
            })
            .interceptor({
                body: Type.Object({
                    publicKey: Type.String(),
                    keyId: Type.String(),
                }),
            })
            .handler(async (c) =>
            {
                const { body } = await c.data();

                // Called twice on purpose: the body must be read from the request only once
                const again = await c.data();

                return {
                    email: body.email,
                    publicKey: body.publicKey,
                    keyId: body.keyId,
                    sameBody: again.body === body,
                };
            });

        const res = await appWith(login).request('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'user@example.com',
                password: 'secret',
                publicKey: 'pk-1',
                keyId: 'kid-1',
            }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            email: 'user@example.com',
            publicKey: 'pk-1',
            keyId: 'kid-1',
            sameBody: true,
        });
    });

    it('still rejects a body failing the input schema when an interceptor is present', async () =>
    {
        const login = route.post('/login')
            .input({ body: Type.Object({ email: Type.String(), password: Type.String() }) })
            .interceptor({ body: Type.Object({ publicKey: Type.String() }) })
            .handler(async () => ({ ok: true }));

        const res = await appWith(login).request('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'user@example.com', publicKey: 'pk-1' }),
        });

        expect(res.status).toBe(400);
    });

    it('does not validate interceptor fields — a missing one reaches the handler as undefined', async () =>
    {
        const rotateKey = route.post('/keys/rotate')
            .interceptor({ body: Type.Object({ publicKey: Type.String(), keyId: Type.String() }) })
            .handler(async (c) =>
            {
                const { body } = await c.data();

                return { publicKey: body.publicKey, hasKeyId: body.keyId !== undefined };
            });

        const res = await appWith(rotateKey).request('/keys/rotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicKey: 'pk-1' }),
        });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ publicKey: 'pk-1', hasKeyId: false });
    });

    it('rejects malformed JSON the same way an input-declared body does', async () =>
    {
        const interceptorOnly = route.post('/interceptor-only')
            .interceptor({ body: Type.Object({ publicKey: Type.String() }) })
            .handler(async () => ({ ok: true }));

        const inputOnly = route.post('/input-only')
            .input({ body: Type.Object({ publicKey: Type.String() }) })
            .handler(async () => ({ ok: true }));

        const malformed = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{ not json',
        };

        const interceptorRes = await appWith(interceptorOnly).request('/interceptor-only', malformed);
        const inputRes = await appWith(inputOnly).request('/input-only', malformed);

        expect(interceptorRes.status).toBe(inputRes.status);
        expect(interceptorRes.status).toBe(400);
        expect((await interceptorRes.json()).message).toBe((await inputRes.json()).message);
    });

    it('parses formData declared only by the interceptor', async () =>
    {
        const upload = route.post('/avatar')
            .interceptor({ formData: Type.Object({ file: FileSchema() }) })
            .handler(async (c) =>
            {
                const { formData } = await c.data();

                return { filename: (formData.file as File).name };
            });

        const form = new FormData();
        form.append('file', new Blob(['avatar'], { type: 'image/png' }), 'avatar.png');

        const res = await appWith(upload).request('/avatar', { method: 'POST', body: form });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ filename: 'avatar.png' });
    });
});

describe('routes an interceptor must not change', () =>
{
    it('leaves a route whose interceptor declares no body untouched', async () =>
    {
        const ping = route.post('/ping')
            .interceptor({ headers: Type.Object({ 'x-client': Type.String() }) })
            .handler(async (c) =>
            {
                const { body } = await c.data();

                return { bodyKeys: Object.keys(body) };
            });

        const res = await appWith(ping).request('/ping', { method: 'POST' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ bodyKeys: [] });
    });

    it('does not fail a GET route that declares an interceptor body but sends none', async () =>
    {
        const listKeys = route.get('/keys')
            .interceptor({ body: Type.Object({ publicKey: Type.String() }) })
            .handler(async (c) =>
            {
                const { body } = await c.data();

                return { bodyKeys: Object.keys(body) };
            });

        const res = await appWith(listKeys).request('/keys');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ bodyKeys: [] });
    });

    it('does not fail a DELETE route with an interceptor that declares no body', async () =>
    {
        const removeKey = route.delete('/keys/:id')
            .input({ params: Type.Object({ id: Type.String() }) })
            .interceptor({ headers: Type.Object({ 'x-client': Type.String() }) })
            .handler(async (c) =>
            {
                const { params } = await c.data();

                return { id: params.id };
            });

        const res = await appWith(removeKey).request('/keys/abc', { method: 'DELETE' });

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: 'abc' });
    });

    it('leaves a route with neither input nor interceptor untouched', async () =>
    {
        const health = route.get('/health').handler(async () => ({ status: 'ok' }));

        const res = await appWith(health).request('/health');

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok' });
    });
});
