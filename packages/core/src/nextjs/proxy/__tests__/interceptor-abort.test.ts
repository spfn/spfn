/**
 * An interceptor can refuse a request before the backend is called
 *
 * The seam the CSRF check in @spfn/auth stands on: setting `ctx.abort` has to
 * stop the proxy, not merely stop the interceptor chain. If the proxy forwarded
 * the request anyway the refusal would be decorative.
 *
 * A refusal also has to be able to carry Set-Cookie. It skips the backend and
 * every response interceptor, so cookies attached to the abort are the only thing
 * a refused request can hand back — and that is what turns the CSRF refusal from
 * a dead end into the one page load that repairs the browser.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { createRpcProxy } from '../rpc';

const BACKEND = 'http://backend.test';
const routeMap = { createOrder: { method: 'POST' as const, path: '/orders' } };

function postRequest(): NextRequest
{
    return new NextRequest('http://localhost:3000/api/rpc/createOrder', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: { item: 'x' } }),
    });
}

describe('rpc proxy - interceptor refusal', () =>
{
    afterEach(() =>
    {
        vi.unstubAllGlobals();
    });

    it('returns the refusal and never calls the backend', async () =>
    {
        const backend = vi.fn();
        vi.stubGlobal('fetch', backend);

        const { POST } = createRpcProxy({
            routeMap,
            apiUrl: BACKEND,
            autoDiscoverInterceptors: false,
            interceptors: [{
                pathPattern: '*',
                request: async (ctx) =>
                {
                    ctx.abort = { status: 403, body: { error: 'Forbidden', message: 'CSRF token missing or invalid' } };
                },
            }],
        });

        const response = await POST(postRequest(), { params: Promise.resolve({ routeName: 'createOrder' }) });

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
            error: 'Forbidden',
            message: 'CSRF token missing or invalid',
        });
        expect(backend).not.toHaveBeenCalled();
        // Nothing was attached to the abort, and no response interceptor ran
        expect(response.headers.get('set-cookie')).toBeNull();
    });

    it('carries the cookies the refusing interceptor attached, without changing the refusal', async () =>
    {
        const backend = vi.fn();
        vi.stubGlobal('fetch', backend);

        const { POST } = createRpcProxy({
            routeMap,
            apiUrl: BACKEND,
            autoDiscoverInterceptors: false,
            interceptors: [{
                pathPattern: '*',
                request: async (ctx) =>
                {
                    ctx.abort = {
                        status: 403,
                        body: { error: 'Forbidden', message: 'CSRF token missing or invalid' },
                        setCookies: [{
                            name: 'spfn_csrf',
                            value: 'fresh-token',
                            options: { httpOnly: false, sameSite: 'lax', maxAge: 3600, path: '/' },
                        }],
                    };
                },
            }],
        });

        const response = await POST(postRequest(), { params: Promise.resolve({ routeName: 'createOrder' }) });

        const setCookie = response.headers.get('set-cookie')!;

        expect(setCookie).toContain('spfn_csrf=fresh-token');
        expect(setCookie).toContain('Path=/');
        expect(setCookie).not.toContain('HttpOnly');

        // The refusal itself is untouched — still a 403, same body, no backend call
        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
            error: 'Forbidden',
            message: 'CSRF token missing or invalid',
        });
        expect(backend).not.toHaveBeenCalled();
    });

    it('carries every attached cookie, one Set-Cookie header each', async () =>
    {
        vi.stubGlobal('fetch', vi.fn());

        const { POST } = createRpcProxy({
            routeMap,
            apiUrl: BACKEND,
            autoDiscoverInterceptors: false,
            interceptors: [{
                pathPattern: '*',
                request: async (ctx) =>
                {
                    ctx.abort = {
                        status: 403,
                        body: {},
                        setCookies: [
                            { name: 'a', value: '1', options: { path: '/' } },
                            { name: 'b', value: '2', options: { path: '/' } },
                        ],
                    };
                },
            }],
        });

        const response = await POST(postRequest(), { params: Promise.resolve({ routeName: 'createOrder' }) });

        expect(response.headers.getSetCookie()).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    });

    it('forwards normally when no interceptor refuses', async () =>
    {
        const backend = vi.fn(async () => new Response('{"ok":true}', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));
        vi.stubGlobal('fetch', backend);

        const { POST } = createRpcProxy({ routeMap, apiUrl: BACKEND, autoDiscoverInterceptors: false });

        const response = await POST(postRequest(), { params: Promise.resolve({ routeName: 'createOrder' }) });

        expect(response.status).toBe(200);
        expect(backend).toHaveBeenCalledTimes(1);
    });
});
