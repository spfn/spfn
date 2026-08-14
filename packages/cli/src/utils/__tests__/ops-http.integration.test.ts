/** Manifest discovery and command invocation over one real HTTP-shaped app. */

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { defineMiddleware } from '@spfn/core/route';
import { registerRoutes, defineRouter } from '@spfn/core/route';
import { createOpsRouter, defineOpsModule, opsRoute } from '@spfn/core/ops';
import { fetchOpsManifest, invokeOpsCommand } from '../ops/client.js';

function testApp(): Hono
{
    const auth = defineMiddleware('opsTokenAuth', async (c, next) =>
    {
        const token = c.req.header('authorization');
        if (token !== 'Bearer ledger-read' && token !== 'Bearer no-scope')
        {
            return c.json({ error: 'unauthorized' }, 401);
        }
        c.set('opsToken', token);

        return await next();
    });
    const module = defineOpsModule({
        id: 'ledger',
        source: '@spfn/ledger',
        contractVersion: '1.0.0',
        summary: 'Ledger diagnostics',
        commands: {
            verify: {
                summary: 'Verify ledger invariants',
                effect: 'read',
                scopes: ['ledger:read'],
                route: opsRoute.get('/ledger/verify').handler(async () => ({ ok: true })),
            },
        },
    });
    const ops = createOpsRouter({}, {
        auth,
        authorize: (...scopes) => async (c, next) =>
        {
            if (scopes.includes('ledger:read') && c.get('opsToken') !== 'Bearer ledger-read')
            {
                return c.json({ error: 'forbidden' }, 403);
            }

            return await next();
        },
        modules: [module],
    });
    const app = new Hono();
    registerRoutes(app, defineRouter({}).packages([ops]));

    return app;
}

describe('ops HTTP integration', () =>
{
    it('discovers a qualified command and invokes it through auth and scope middleware', async () =>
    {
        const app = testApp();
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
        {
            const rawUrl = typeof input === 'string'
                ? input
                : input instanceof URL ? input.href : input.url;
            const url = new URL(rawUrl);

            return app.request(url.pathname + url.search, init);
        });

        const manifest = await fetchOpsManifest('https://app.example', 'ledger-read');
        const command = manifest.commands.find(item => item.name === 'ledger.verify')!;
        expect(command).toMatchObject({
            module: 'ledger',
            effect: 'read',
            scopes: ['ledger:read'],
        });

        await expect(invokeOpsCommand('https://app.example', 'ledger-read', command, {
            params: {}, query: {}, body: undefined,
        })).resolves.toEqual({ status: 200, body: { ok: true } });

        await expect(invokeOpsCommand('https://app.example', 'no-scope', command, {
            params: {}, query: {}, body: undefined,
        })).resolves.toEqual({ status: 403, body: { error: 'forbidden' } });
    });
});
