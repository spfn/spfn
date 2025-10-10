/**
 * Skip Middlewares Test
 *
 * Tests contract-based skipMiddlewares functionality
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createApp } from '../create-app.js';
import { Type as t } from '@sinclair/typebox';
import type { RouteContract } from '../types.js';

describe('Skip Middlewares', () =>
{
    it('should skip middlewares for contract with skipMiddlewares meta', async () =>
    {
        // Track middleware executions
        const executions: string[] = [];

        // Create contracts
        const publicContract: RouteContract = {
            method: 'GET',
            path: '/public',
            response: t.Object({ message: t.String() }),
            meta: {
                skipMiddlewares: ['auth'],
            },
        };

        const privateContract: RouteContract = {
            method: 'GET',
            path: '/private',
            response: t.Object({ message: t.String() }),
        };

        // Create route app
        const routeApp = createApp();

        routeApp.bind(publicContract, async (c) =>
        {
            return c.json({ message: 'public' });
        });

        routeApp.bind(privateContract, async (c) =>
        {
            return c.json({ message: 'private' });
        });

        // Create main app with auth middleware
        const app = new Hono();

        // Simulate auto-loader: check _contractMetas
        const hasContractMetas = routeApp._contractMetas && routeApp._contractMetas.size > 0;

        if (hasContractMetas)
        {
            // Register meta-setting middleware
            app.use('/*', (c, next) =>
            {
                const method = c.req.method;
                const path = new URL(c.req.url).pathname;
                const key = `${method} ${path}`;
                const meta = routeApp._contractMetas?.get(key);
                if (meta?.skipMiddlewares)
                {
                    c.set('_skipMiddlewares', meta.skipMiddlewares);
                }
                return next();
            });

            // Wrap auth middleware
            app.use('/*', async (c, next) =>
            {
                const skipList = c.get('_skipMiddlewares') || [];
                if (skipList.includes('auth'))
                {
                    return next(); // Skip auth
                }
                executions.push('auth');
                return next();
            });
        }

        // Mount route app
        app.route('/', routeApp);

        // Test public endpoint (should skip auth)
        executions.length = 0;
        const res1 = await app.request('/public');
        expect(res1.status).toBe(200);
        expect(executions).not.toContain('auth');

        // Test private endpoint (should execute auth)
        executions.length = 0;
        const res2 = await app.request('/private');
        expect(res2.status).toBe(200);
        expect(executions).toContain('auth');
    });

    it('should support multiple skipMiddlewares', async () =>
    {
        const executions: string[] = [];

        const contract: RouteContract = {
            method: 'GET',
            path: '/skip-both',
            response: t.Object({ message: t.String() }),
            meta: {
                skipMiddlewares: ['auth', 'rateLimit'],
            },
        };

        const routeApp = createApp();
        routeApp.bind(contract, async (c) => c.json({ message: 'ok' }));

        const app = new Hono();

        // Meta-setting middleware
        app.use('/*', (c, next) =>
        {
            const method = c.req.method;
            const path = new URL(c.req.url).pathname;
            const key = `${method} ${path}`;
            const meta = routeApp._contractMetas?.get(key);
            if (meta?.skipMiddlewares)
            {
                c.set('_skipMiddlewares', meta.skipMiddlewares);
            }
            return next();
        });

        // Multiple middlewares
        for (const name of ['auth', 'rateLimit', 'logging'])
        {
            app.use('/*', async (c, next) =>
            {
                const skipList = c.get('_skipMiddlewares') || [];
                if (skipList.includes(name))
                {
                    return next();
                }
                executions.push(name);
                return next();
            });
        }

        app.route('/', routeApp);

        const res = await app.request('/skip-both');
        expect(res.status).toBe(200);
        expect(executions).not.toContain('auth');
        expect(executions).not.toContain('rateLimit');
        expect(executions).toContain('logging');
    });

    it('should work with method-specific skips on same path', async () =>
    {
        const executions: string[] = [];

        const getContract: RouteContract = {
            method: 'GET',
            path: '/resource',
            response: t.Object({ message: t.String() }),
            meta: {
                skipMiddlewares: ['auth'], // GET is public
            },
        };

        const postContract: RouteContract = {
            method: 'POST',
            path: '/resource',
            body: t.Object({ data: t.String() }),
            response: t.Object({ message: t.String() }),
            // No skipMiddlewares → auth required
        };

        const routeApp = createApp();
        routeApp.bind(getContract, async (c) => c.json({ message: 'get' }));
        routeApp.bind(postContract, async (c) => c.json({ message: 'post' }));

        const app = new Hono();

        // Meta-setting middleware
        app.use('/*', (c, next) =>
        {
            const method = c.req.method;
            const path = new URL(c.req.url).pathname;
            const key = `${method} ${path}`;
            const meta = routeApp._contractMetas?.get(key);
            if (meta?.skipMiddlewares)
            {
                c.set('_skipMiddlewares', meta.skipMiddlewares);
            }
            return next();
        });

        // Auth middleware
        app.use('/*', async (c, next) =>
        {
            const skipList = c.get('_skipMiddlewares') || [];
            if (skipList.includes('auth'))
            {
                return next();
            }
            executions.push('auth');
            return next();
        });

        app.route('/', routeApp);

        // GET /resource should skip auth
        executions.length = 0;
        const res1 = await app.request('/resource', { method: 'GET' });
        expect(res1.status).toBe(200);
        expect(executions).not.toContain('auth');

        // POST /resource should execute auth
        executions.length = 0;
        const res2 = await app.request('/resource', {
            method: 'POST',
            body: JSON.stringify({ data: 'test' }),
            headers: { 'Content-Type': 'application/json' },
        });
        expect(res2.status).toBe(200);
        expect(executions).toContain('auth');
    });
});