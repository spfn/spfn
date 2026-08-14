/**
 * Capability ops modules: explicit composition, qualified discovery, and
 * server-side scope enforcement.
 */

import { Type } from '@sinclair/typebox';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { defineMiddleware } from '../../route/define-middleware';
import { registerRoutes } from '../../route/register-routes';
import { defineRouter } from '../../route/router';
import { createOpsRouter } from '../create-ops-router';
import type { OpsManifest } from '../manifest';
import { defineOpsModule } from '../module';
import { opsRoute } from '../ops-route';

const testAuth = defineMiddleware('opsTokenAuth', async (_c, next) =>
{
    await next();
});

function ledgerModule()
{
    return defineOpsModule({
        id: 'ledger',
        source: '@spfn/ledger',
        contractVersion: '1.0.0',
        summary: 'Ledger diagnostics',
        commands: {
            verify: {
                summary: 'Verify ledger invariants',
                effect: 'read' as const,
                scopes: ['ledger:read'],
                route: opsRoute.get('/ledger/verify')
                    .input({ query: Type.Object({ currency: Type.Optional(Type.String()) }) })
                    .handler(async () => ({ ok: true })),
            },
        },
    });
}

describe('defineOpsModule', () =>
{
    it('requires a stable id, scope, and module-owned path', () =>
    {
        expect(() => defineOpsModule({
            ...ledgerModule(),
            id: 'Ledger Module',
        })).toThrow(/lower-kebab-case/);

        expect(() => defineOpsModule({
            ...ledgerModule(),
            commands: {
                verify: {
                    ...ledgerModule().commands.verify,
                    scopes: [],
                },
            },
        })).toThrow(/at least one non-empty scope/);

        expect(() => defineOpsModule({
            ...ledgerModule(),
            commands: {
                verify: {
                    ...ledgerModule().commands.verify,
                    route: opsRoute.get('/other/verify').handler(async () => ({})),
                },
            },
        })).toThrow(/outside "\/_ops\/ledger\/"/);
    });

    it('refuses two names for the same method and path', () =>
    {
        const route = opsRoute.get('/ledger/verify').handler(async () => ({}));

        expect(() => defineOpsModule({
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
            commands: {
                verify: { summary: 'First', effect: 'read', scopes: ['ledger:read'], route },
                inspect: { summary: 'Second', effect: 'read', scopes: ['ledger:read'], route },
            },
        })).toThrow(/both use GET \/_ops\/ledger\/verify/);
    });

    it.each([
        '/ledger/%2e%2e/admin',
        '/ledger/%252e%252e%252fadmin',
        '/ledger/safe%5c..%5cadmin',
    ])('rejects an unstable encoded module path: %s', (path) =>
    {
        expect(() => defineOpsModule({
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
            commands: {
                verify: {
                    summary: 'Verify',
                    effect: 'read',
                    scopes: ['ledger:read'],
                    route: opsRoute.get(path).handler(async () => ({})),
                },
            },
        })).toThrow(/encoded path separators|stable plain absolute path/);
    });

    it('rejects overlapping simple parameter and static routes inside one module', () =>
    {
        expect(() => defineOpsModule({
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
            commands: {
                dynamic: {
                    summary: 'Dynamic',
                    effect: 'read',
                    scopes: ['ledger:read'],
                    route: opsRoute.get('/ledger/:rest').handler(async () => ({})),
                },
                static: {
                    summary: 'Static',
                    effect: 'write',
                    scopes: ['ledger:write'],
                    route: opsRoute.get('/ledger/verify').handler(async () => ({})),
                },
            },
        })).toThrow(/overlapping GET routes/);
    });

    it.each([
        '/ledger/:id?',
        '/ledger/:id{foo/bar}',
        '/ledger/:id{[0-9]+}',
        '/ledger/*',
        '/ledger/foo?bar',
        '/ledger/foo#bar',
        '/ledger/foo{bar}',
        '/ledger/foo%41',
    ])('rejects Hono path syntax the ops CLI cannot call: %s', (path) =>
    {
        expect(() => defineOpsModule({
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
            commands: {
                verify: {
                    summary: 'Verify',
                    effect: 'read',
                    scopes: ['ledger:read'],
                    route: opsRoute.get(path).handler(async () => ({})),
                },
            },
        })).toThrow(/not CLI-callable/);
    });
});

describe('createOpsRouter modules', () =>
{
    it('requires a scope authorizer whenever a module is mounted', () =>
    {
        expect(() => createOpsRouter({}, {
            auth: testAuth,
            modules: [ledgerModule()],
        })).toThrow(/requires an authorize scope factory/);
    });

    it('publishes additive module metadata and qualified command names', async () =>
    {
        const opsRouter = createOpsRouter({
            appStatus: opsRoute.get('/app/status').handler(async () => ({ ok: true })),
        }, {
            auth: testAuth,
            authorize: () => async (_c, next) => await next(),
            modules: [ledgerModule()],
        });

        const manifestRoute = opsRouter.routes.getOpsManifest;
        const manifest = await manifestRoute.handler({} as never) as OpsManifest;

        expect(manifest.modules).toEqual([{
            id: 'ledger',
            source: '@spfn/ledger',
            contractVersion: '1.0.0',
            summary: 'Ledger diagnostics',
        }]);
        expect(manifest.commands.map(command => command.name)).toEqual(['appStatus', 'ledger.verify']);
        expect(manifest.commands.find(command => command.name === 'ledger.verify')).toMatchObject({
            module: 'ledger',
            summary: 'Verify ledger invariants',
            effect: 'read',
            scopes: ['ledger:read'],
            method: 'GET',
            path: '/_ops/ledger/verify',
        });
    });

    it('injects auth, then the declared scope guard, then route middleware', async () =>
    {
        const calls: string[] = [];
        const auth = defineMiddleware('opsTokenAuth', async (_c, next) =>
        {
            calls.push('auth');
            await next();
        });
        const routeGuard = defineMiddleware('routeGuard', async (_c, next) =>
        {
            calls.push('route');
            await next();
        });
        const module = defineOpsModule({
            ...ledgerModule(),
            commands: {
                verify: {
                    ...ledgerModule().commands.verify,
                    route: opsRoute.get('/ledger/verify')
                        .use([routeGuard])
                        .handler(async () =>
                        {
                            calls.push('handler');

                            return { ok: true };
                        }),
                },
            },
        });
        const opsRouter = createOpsRouter({}, {
            auth,
            authorize: (...scopes) => async (_c, next) =>
            {
                calls.push(`scope:${scopes.join(',')}`);
                await next();
            },
            modules: [module],
        });
        const app = new Hono();
        registerRoutes(app, defineRouter({}).packages([opsRouter]));

        expect((await app.request('/_ops/ledger/verify')).status).toBe(200);
        expect(calls).toEqual(['auth', 'scope:ledger:read', 'route', 'handler']);
    });

    it('refuses duplicate module ids and collisions with app-owned commands', () =>
    {
        expect(() => createOpsRouter({}, {
            auth: testAuth,
            authorize: () => async (_c, next) => await next(),
            modules: [ledgerModule(), ledgerModule()],
        })).toThrow(/Two ops modules use id "ledger"/);

        expect(() => createOpsRouter({
            'ledger.verify': opsRoute.get('/app/verify').handler(async () => ({})),
        }, {
            auth: testAuth,
            authorize: () => async (_c, next) => await next(),
            modules: [ledgerModule()],
        })).toThrow(/Two ops commands are named "ledger.verify"/);
    });

    it.each([
        '/ledger/:rest',
        '/:module/verify',
        '/ledger/:rest{.+}',
        '/*',
    ])('reserves a module namespace from same-method app route patterns: %s', (path) =>
    {
        expect(() => createOpsRouter({
            appRoute: opsRoute.get(path).handler(async () => ({})),
        }, {
            auth: testAuth,
            authorize: () => async (_c, next) => await next(),
            modules: [ledgerModule()],
        })).toThrow(/overlaps module command "ledger.verify"/);
    });

    it('allows another method or another static namespace', () =>
    {
        expect(() => createOpsRouter({
            ledgerWrite: opsRoute.post('/ledger/:rest').handler(async () => ({})),
            otherRead: opsRoute.get('/other/:rest').handler(async () => ({})),
        }, {
            auth: testAuth,
            authorize: () => async (_c, next) => await next(),
            modules: [ledgerModule()],
        })).not.toThrow();
    });

    it.each([
        '/ledger',
        '/ledger/verify/detail',
        '/:module',
    ])('allows an app route that shares the prefix but no URL: %s', (path) =>
    {
        // `/_ops/ledger` cannot be reached by a `/_ops/ledger/verify` request,
        // so refusing it would fail a legitimate app at boot over a prefix it
        // merely shares.
        expect(() => createOpsRouter({
            appRoute: opsRoute.get(path).handler(async () => ({})),
        }, {
            auth: testAuth,
            authorize: () => async (_c, next) => await next(),
            modules: [ledgerModule()],
        })).not.toThrow();
    });

    it('enforces auth and scope denial on the registered HTTP path', async () =>
    {
        const calls: string[] = [];
        const auth = defineMiddleware('opsTokenAuth', async (c, next) =>
        {
            calls.push('auth');
            const authorization = c.req.header('authorization');
            if (authorization !== 'Bearer read-token' && authorization !== 'Bearer no-scope')
            {
                return c.json({ error: 'unauthorized' }, 401);
            }
            c.set('opsToken', authorization);

            return await next();
        });
        const opsRouter = createOpsRouter({}, {
            auth,
            authorize: (...scopes) => async (c, next) =>
            {
                calls.push(`scope:${scopes.join(',')}`);
                if (c.get('opsToken') !== 'Bearer read-token')
                {
                    return c.json({ error: 'forbidden' }, 403);
                }

                return await next();
            },
            modules: [ledgerModule()],
        });
        const app = new Hono();
        registerRoutes(app, defineRouter({}).packages([opsRouter]));

        expect((await app.request('/_ops/ledger/verify')).status).toBe(401);
        expect(calls).toEqual(['auth']);

        calls.length = 0;
        expect((await app.request('/_ops/ledger/verify', {
            headers: { authorization: 'Bearer no-scope' },
        })).status).toBe(403);
        expect(calls).toEqual(['auth', 'scope:ledger:read']);

        calls.length = 0;
        expect((await app.request('/_ops/ledger/verify', {
            headers: { authorization: 'Bearer read-token' },
        })).status).toBe(200);
        expect(calls).toEqual(['auth', 'scope:ledger:read']);
    });

    it('keeps an app-only v1 manifest unchanged', async () =>
    {
        const opsRouter = createOpsRouter({
            appStatus: opsRoute.get('/app/status').handler(async () => ({ ok: true })),
        }, { auth: testAuth });
        const manifest = await opsRouter.routes.getOpsManifest.handler({} as never) as OpsManifest;

        expect(manifest.modules).toBeUndefined();
        expect(manifest.commands[0]).toEqual({
            name: 'appStatus',
            method: 'GET',
            path: '/_ops/app/status',
            input: {},
        });
    });
});
