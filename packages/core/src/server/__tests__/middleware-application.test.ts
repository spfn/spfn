/**
 * Middleware application count — how many times one registration runs per request
 *
 * ✅ 테스트 범위:
 * - defineRouter().use() + defineServerConfig().routes() (스캐폴드 기본 구성)
 * - defineServerConfig().middlewares() 단독 구성
 * - 두 레벨 공존, 같은 미들웨어의 양쪽 등록, 익명 미들웨어
 * - .skip() 과 패키지 라우터 스코프
 *
 * 🔗 관련 파일:
 * - src/server/config-builder.ts
 * - src/route/register-routes.ts
 *
 * Issue #107: router-level middleware ran twice per request, so middleware holding
 * one-shot state (a nonce replay ledger) rejected its own request on the second run.
 */

import { describe, it, expect } from 'vitest';
import type { MiddlewareHandler } from 'hono';
import { route, defineRouter, defineMiddleware } from '@spfn/core/route';
import type { NamedMiddleware } from '@spfn/core/route';
import { defineServerConfig } from '../config-builder';
import { createServer } from '../create-server';
import { resolveEndpointMiddlewares } from '../helpers';

// ============================================================================
// Helpers
// ============================================================================

interface Counter
{
    middleware: NamedMiddleware<string>;
    count: () => number;
}

/**
 * A named middleware that counts its own executions — the smallest stand-in for
 * middleware holding one-shot state.
 */
function countingMiddleware(name: string): Counter
{
    let count = 0;

    const middleware = defineMiddleware(name, async (_c, next) =>
    {
        count += 1;
        await next();
    });

    return { middleware, count: () => count };
}

function anonymousCounter(): { middleware: NamedMiddleware<string>; count: () => number }
{
    let count = 0;

    const handler: MiddlewareHandler = async (_c, next) =>
    {
        count += 1;
        await next();
    };

    // No name — what a plain Hono handler pushed through a named-middleware slot looks like.
    return {
        middleware: { name: '', handler, _name: '' },
        count: () => count,
    };
}

const ping = route.get('/ping').handler(async () => ({ ok: true }));

const baseConfig = () => defineServerConfig()
    .middleware({ logger: false, cors: false, errorHandler: false })
    .healthCheck({ enabled: false });

// ============================================================================
// Tests
// ============================================================================

describe('middleware application count', () =>
{
    it('runs router-level .use() middleware exactly once per request', async () =>
    {
        const auth = countingMiddleware('auth');

        const app = await createServer(
            baseConfig()
                .routes(defineRouter({ ping }).use([auth.middleware]))
                .build(),
        );

        const res = await app.request('/ping');

        expect(res.status).toBe(200);
        expect(auth.count()).toBe(1);
    });

    it('runs config-level .middlewares() middleware exactly once per request', async () =>
    {
        const auth = countingMiddleware('auth');

        const app = await createServer(
            baseConfig()
                .routes(defineRouter({ ping }))
                .middlewares([auth.middleware])
                .build(),
        );

        const res = await app.request('/ping');

        expect(res.status).toBe(200);
        expect(auth.count()).toBe(1);
    });

    it('runs a config-level and a router-level middleware once each, config first', async () =>
    {
        const order: string[] = [];

        const configMw = defineMiddleware('configLevel', async (_c, next) =>
        {
            order.push('configLevel');
            await next();
        });

        const routerMw = defineMiddleware('routerLevel', async (_c, next) =>
        {
            order.push('routerLevel');
            await next();
        });

        const app = await createServer(
            baseConfig()
                .middlewares([configMw])
                .routes(defineRouter({ ping }).use([routerMw]))
                .build(),
        );

        const res = await app.request('/ping');

        expect(res.status).toBe(200);
        expect(order).toEqual(['configLevel', 'routerLevel']);
    });

    it('runs a middleware registered at BOTH levels once in total', async () =>
    {
        // Declared semantics: a named middleware runs at most once per route. The two
        // registrations name one middleware reached by two paths, not two middlewares.
        const auth = countingMiddleware('auth');

        const app = await createServer(
            baseConfig()
                .middlewares([auth.middleware])
                .routes(defineRouter({ ping }).use([auth.middleware]))
                .build(),
        );

        const res = await app.request('/ping');

        expect(res.status).toBe(200);
        expect(auth.count()).toBe(1);
    });

    it('keeps unnamed middlewares distinct instead of collapsing them by empty name', async () =>
    {
        const first = anonymousCounter();
        const second = anonymousCounter();

        const app = await createServer(
            baseConfig()
                .middlewares([first.middleware, second.middleware])
                .routes(defineRouter({ ping }))
                .build(),
        );

        const res = await app.request('/ping');

        expect(res.status).toBe(200);
        expect(first.count()).toBe(1);
        expect(second.count()).toBe(1);
    });

    it('still honours .skip() against a router-level middleware', async () =>
    {
        const auth = countingMiddleware('auth');

        const publicRoute = route.get('/public')
            .skip(['auth'])
            .handler(async () => ({ ok: true }));

        const app = await createServer(
            baseConfig()
                .routes(defineRouter({ ping, publicRoute }).use([auth.middleware]))
                .build(),
        );

        expect((await app.request('/public')).status).toBe(200);
        expect(auth.count()).toBe(0);

        expect((await app.request('/ping')).status).toBe(200);
        expect(auth.count()).toBe(1);
    });

    it('applies each router\'s .use() to its own routes, once', async () =>
    {
        const appMw = countingMiddleware('appLevel');
        const pkgMw = countingMiddleware('pkgLevel');

        const pkgPing = route.get('/pkg/ping').handler(async () => ({ ok: true }));
        const pkgRouter = defineRouter({ pkgPing }).use([pkgMw.middleware]);

        const app = await createServer(
            baseConfig()
                .routes(defineRouter({ ping }).packages([pkgRouter]).use([appMw.middleware]))
                .build(),
        );

        // App route: the app router's middleware only.
        expect((await app.request('/ping')).status).toBe(200);
        expect(appMw.count()).toBe(1);
        expect(pkgMw.count()).toBe(0);

        // Package route: the app router's middleware (it covers package routes too)
        // plus the package router's own — each once.
        expect((await app.request('/pkg/ping')).status).toBe(200);
        expect(appMw.count()).toBe(2);
        expect(pkgMw.count()).toBe(1);
    });

    it('leaves router-level middleware out of config.middlewares', async () =>
    {
        const auth = countingMiddleware('auth');

        const config = baseConfig()
            .routes(defineRouter({ ping }).use([auth.middleware]))
            .build();

        expect(config.middlewares).toBeUndefined();
    });
});

describe('resolveEndpointMiddlewares', () =>
{
    it('guards server-registered endpoints with both levels of middleware', () =>
    {
        const configMw = countingMiddleware('configLevel').middleware;
        const routerMw = countingMiddleware('routerLevel').middleware;
        const pkgMw = countingMiddleware('pkgLevel').middleware;

        const pkgPing = route.get('/pkg/ping').handler(async () => ({ ok: true }));
        const pkgRouter = defineRouter({ pkgPing }).use([pkgMw]);

        const config = defineServerConfig()
            .middlewares([configMw])
            .routes(defineRouter({ ping }).packages([pkgRouter]).use([routerMw]))
            .build();

        expect(resolveEndpointMiddlewares(config).map(mw => mw.name))
            .toEqual(['configLevel', 'routerLevel', 'pkgLevel']);
    });

    it('names a middleware registered at both levels once', () =>
    {
        const auth = countingMiddleware('auth').middleware;

        const config = defineServerConfig()
            .middlewares([auth])
            .routes(defineRouter({ ping }).use([auth]))
            .build();

        expect(resolveEndpointMiddlewares(config).map(mw => mw.name)).toEqual(['auth']);
    });
});
