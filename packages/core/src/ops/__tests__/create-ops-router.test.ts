/**
 * createOpsRouter unit tests
 *
 * The ops surface's definition-time guarantees: prefix enforcement, reserved
 * names, mandatory auth injection, and manifest correctness.
 */

import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import { defineMiddleware } from '../../route/define-middleware';
import { route, type RouteDef } from '../../route/route-builder';
import { defineRouter, type Router } from '../../route/router';
import { createOpsRouter, OPS_MANIFEST_PATH } from '../create-ops-router';
import type { OpsManifest } from '../manifest';

const testAuth = defineMiddleware('opsTokenAuth', async (_c, next) =>
{
    await next();
}, { skips: ['auth'] });

function listSignupsRoute()
{
    return route.get('/_ops/signups')
        .input({ query: Type.Object({ limit: Type.Optional(Type.Number()) }) })
        .handler(async () => ({ items: [] }));
}

describe('createOpsRouter', () =>
{
    it('refuses to build without an auth middleware', () =>
    {
        expect(() => createOpsRouter({ listSignups: listSignupsRoute() }, { auth: undefined as never }))
            .toThrow(/requires an auth middleware/);
    });

    it('refuses a route outside the /_ops/ prefix', () =>
    {
        const stray = route.get('/signups').handler(async () => ({}));

        expect(() => createOpsRouter({ stray }, { auth: testAuth }))
            .toThrow(/outside "\/_ops\/"/);
    });

    it('refuses a route claiming the manifest path or name', () =>
    {
        const clash = route.get(OPS_MANIFEST_PATH).handler(async () => ({}));
        expect(() => createOpsRouter({ clash }, { auth: testAuth }))
            .toThrow(/reserved for the manifest/);

        const named = route.get('/_ops/other').handler(async () => ({}));
        expect(() => createOpsRouter({ getOpsManifest: named }, { auth: testAuth }))
            .toThrow(/reserved for the manifest route/);
    });

    it('refuses a nested router claiming the manifest name', () =>
    {
        const nested = defineRouter({
            getStats: route.get('/_ops/stats').handler(async () => ({})),
        });

        expect(() => createOpsRouter({ getOpsManifest: nested }, { auth: testAuth }))
            .toThrow(/reserved for the manifest route/);
    });

    it('refuses two routes sharing a command name across nested routers', () =>
    {
        const first = defineRouter({
            listUsers: route.get('/_ops/admin/users').handler(async () => ({})),
        });
        const second = defineRouter({
            listUsers: route.get('/_ops/support/users').handler(async () => ({})),
        });

        expect(() => createOpsRouter({ first, second }, { auth: testAuth }))
            .toThrow(/Two ops routes are named "listUsers"/);
    });

    it('keeps a nested router\'s own middlewares, so a scope guard cannot be lost', () =>
    {
        const requireScope = defineMiddleware('requireOpsScope', async (_c, next) =>
        {
            await next();
        });

        const opsRouter = createOpsRouter({
            admin: defineRouter({
                getStats: route.get('/_ops/stats').handler(async () => ({})),
            }).use([requireScope]),
        }, { auth: testAuth });

        const nested = opsRouter.routes.admin as Router<any>;
        expect(nested._globalMiddlewares).toContain(requireScope);
    });

    it('refuses a nested router mounting package routers', () =>
    {
        const nested = defineRouter({
            getStats: route.get('/_ops/stats').handler(async () => ({})),
        }).packages([defineRouter({
            unchecked: route.get('/anywhere').handler(async () => ({})),
        })]);

        expect(() => createOpsRouter({ nested }, { auth: testAuth }))
            .toThrow(/bypass the prefix check and the auth injection/);
    });

    it('injects the auth middleware into every route, manifest and nested routes included', () =>
    {
        const opsRouter = createOpsRouter({
            listSignups: listSignupsRoute(),
            nested: defineRouter({
                getStats: route.get('/_ops/stats').handler(async () => ({})),
            }),
        }, { auth: testAuth });

        const assertAuthFirst = (routes: Record<string, unknown>): void =>
        {
            for (const [name, entry] of Object.entries(routes))
            {
                if (entry !== null && typeof entry === 'object' && 'routes' in entry)
                {
                    assertAuthFirst((entry as { routes: Record<string, unknown> }).routes);
                    continue;
                }

                const middlewares = (entry as RouteDef<any>).middlewares ?? [];
                expect(middlewares[0], `route "${name}" must carry auth first`).toBe(testAuth);
            }
        };

        assertAuthFirst(opsRouter.routes);
    });

    it('serves a manifest describing every command with JSON-serialized schemas', async () =>
    {
        const opsRouter = createOpsRouter({
            listSignups: listSignupsRoute(),
            nested: defineRouter({
                getStats: route.get('/_ops/stats/:metric')
                    .input({ params: Type.Object({ metric: Type.String() }) })
                    .handler(async () => ({})),
            }),
        }, { auth: testAuth });

        const manifestDef = opsRouter.routes.getOpsManifest as RouteDef<any>;
        expect(manifestDef.path).toBe(OPS_MANIFEST_PATH);

        const manifest = await manifestDef.handler({} as never) as OpsManifest;
        expect(manifest.manifestVersion).toBe(1);
        expect(manifest.commands.map(c => c.name)).toEqual(['getStats', 'listSignups']);

        const listSignups = manifest.commands.find(c => c.name === 'listSignups')!;
        expect(listSignups.method).toBe('GET');
        expect(listSignups.path).toBe('/_ops/signups');
        expect(JSON.parse(JSON.stringify(listSignups.input.query))).toEqual(listSignups.input.query);

        const getStats = manifest.commands.find(c => c.name === 'getStats')!;
        expect(getStats.input.params).toMatchObject({ type: 'object' });

        expect(manifest.commands.some(c => c.path === OPS_MANIFEST_PATH)).toBe(false);
    });
});
