/**
 * AutoRouteLoader Tests
 *
 * Tests for the simplified file-based routing system
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { AutoRouteLoader, loadRoutes } from '../auto-loader.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_ROUTES_DIR = join(process.cwd(), '__test_routes__');
// Use absolute path from src/route directory
const CREATE_APP_PATH = join(process.cwd(), 'src', 'route', 'create-app.js');

describe('AutoRouteLoader', () => {
    beforeAll(() => {
        // Create test routes directory
        if (!existsSync(TEST_ROUTES_DIR)) {
            mkdirSync(TEST_ROUTES_DIR, { recursive: true });
        }

        // Create test route directories (each route needs its own directory with index.ts)
        mkdirSync(join(TEST_ROUTES_DIR, 'users'), { recursive: true });
        mkdirSync(join(TEST_ROUTES_DIR, 'users', '[id]'), { recursive: true });
        mkdirSync(join(TEST_ROUTES_DIR, 'posts'), { recursive: true });
        mkdirSync(join(TEST_ROUTES_DIR, 'posts', '[...slug]'), { recursive: true });

        // Static route: /users (contract-based)
        writeFileSync(
            join(TEST_ROUTES_DIR, 'users', 'index.ts'),
            `
import { Type } from '@sinclair/typebox';
import { createApp } from '${CREATE_APP_PATH}';

const app = createApp();

const listContract = {
    method: 'GET',
    path: '/users',
    response: Type.Object({
        message: Type.String(),
    }),
} as const;

app.bind(listContract, async (c) => {
    return c.json({ message: 'Users list' });
});

export default app;
            `
        );

        // Dynamic route: /users/:id (contract-based)
        writeFileSync(
            join(TEST_ROUTES_DIR, 'users', '[id]', 'index.ts'),
            `
import { Type } from '@sinclair/typebox';
import { createApp } from '${CREATE_APP_PATH}';

const app = createApp();

const getContract = {
    method: 'GET',
    path: '/users/:id',
    params: Type.Object({
        id: Type.String(),
    }),
    response: Type.Object({
        id: Type.String(),
    }),
} as const;

app.bind(getContract, async (c) => {
    return c.json({ id: c.params.id });
});

export default app;
            `
        );

        // Static route: /posts (contract-based)
        writeFileSync(
            join(TEST_ROUTES_DIR, 'posts', 'index.ts'),
            `
import { Type } from '@sinclair/typebox';
import { createApp } from '${CREATE_APP_PATH}';

const app = createApp();

const listContract = {
    method: 'GET',
    path: '/posts',
    response: Type.Object({
        message: Type.String(),
    }),
} as const;

app.bind(listContract, async (c) => {
    return c.json({ message: 'Posts list' });
});

export default app;
            `
        );

        // Catch-all route: /posts/* (contract-based)
        writeFileSync(
            join(TEST_ROUTES_DIR, 'posts', '[...slug]', 'index.ts'),
            `
import { Type } from '@sinclair/typebox';
import { createApp } from '${CREATE_APP_PATH}';

const app = createApp();

const catchAllContract = {
    method: 'GET',
    path: '/posts/*',
    response: Type.Object({
        matched: Type.Boolean(),
    }),
} as const;

app.bind(catchAllContract, async (c) => {
    // Hono's /* wildcard - just return success
    return c.json({ matched: true });
});

export default app;
            `
        );
    });

    afterAll(() => {
        // Clean up test directory
        if (existsSync(TEST_ROUTES_DIR)) {
            rmSync(TEST_ROUTES_DIR, { recursive: true, force: true });
        }
    });

    describe('Route Loading', () => {
        it('should load all routes from directory', async () => {
            const app = new Hono();
            const loader = new AutoRouteLoader(TEST_ROUTES_DIR, false);
            const stats = await loader.load(app);

            expect(stats.total).toBe(4);
        });

        it('should correctly categorize routes by priority', async () => {
            const app = new Hono();
            const loader = new AutoRouteLoader(TEST_ROUTES_DIR, false);
            const stats = await loader.load(app);

            expect(stats.byPriority.static).toBe(2); // /users, /posts
            expect(stats.byPriority.dynamic).toBe(1); // /users/:id
            expect(stats.byPriority.catchAll).toBe(1); // /posts/*
        });

        it('should have empty tag counts (meta removed from files)', async () => {
            const app = new Hono();
            const loader = new AutoRouteLoader(TEST_ROUTES_DIR, false);
            const stats = await loader.load(app);

            // No module.meta exports, so byTag should be empty
            expect(Object.keys(stats.byTag).length).toBe(0);
        });

        it('should convert file paths to URL paths correctly', async () => {
            const app = new Hono();
            const loader = new AutoRouteLoader(TEST_ROUTES_DIR, false);
            const stats = await loader.load(app);

            const paths = stats.routes.map((r) => r.path).sort();
            expect(paths).toEqual([
                '/posts',
                '/posts/*',
                '/users',
                '/users/:id',
            ]);
        });
    });

    describe('Route Registration', () => {
        it('should register static routes correctly', async () => {
            const app = new Hono();
            await loadRoutes(app, {
                routesDir: TEST_ROUTES_DIR,
                debug: false,
                includeFunctionRoutes: false
            });

            const res = await app.request('/users');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json).toEqual({ message: 'Users list' });
        });

        it('should register dynamic routes correctly', async () => {
            const app = new Hono();
            await loadRoutes(app, {
                routesDir: TEST_ROUTES_DIR,
                debug: false,
                includeFunctionRoutes: false
            });

            const res = await app.request('/users/123');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json).toEqual({ id: '123' });
        });

        it('should register catch-all routes correctly', async () => {
            const app = new Hono();
            const stats = await loadRoutes(app, {
                routesDir: TEST_ROUTES_DIR,
                debug: false,
                includeFunctionRoutes: false
            });

            // Verify catch-all route is registered
            const catchAllRoute = stats.routes.find(r => r.path === '/posts/*');
            expect(catchAllRoute).toBeDefined();
            expect(catchAllRoute?.priority).toBe(3); // Catch-all priority

            // Test actual routing behavior - Hono's /* matches all paths
            const res1 = await app.request('/posts/hello');
            expect(res1.status).toBe(200);

            const res2 = await app.request('/posts/2024/01/hello');
            expect(res2.status).toBe(200);
        });
    });

    describe('Route Metadata', () => {
        it('should not have module-level metadata (moved to contract.meta)', async () => {
            const app = new Hono();
            const loader = new AutoRouteLoader(TEST_ROUTES_DIR, false);
            const stats = await loader.load(app);

            // Meta is now in contract, not in module exports
            const usersRoute = stats.routes.find((r) => r.path === '/users');
            expect(usersRoute?.meta).toBeUndefined();
        });

        it('should reject routes without contract-based routing', async () => {
            const testDir = join(process.cwd(), '__test_routes_no_contract__');
            mkdirSync(testDir, { recursive: true });

            // Create a route without contract-based routing
            writeFileSync(
                join(testDir, 'index.ts'),
                `
import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => c.json({ ok: true }));
export default app;
                `
            );

            const app = new Hono();
            const loader = new AutoRouteLoader(testDir, false);
            const stats = await loader.load(app);

            // Should not load routes without contracts
            expect(stats.total).toBe(0);

            rmSync(testDir, { recursive: true, force: true });
        });
    });

    describe('Error Handling', () => {
        it('should handle missing default export', async () => {
            const testDir = join(process.cwd(), '__test_routes_error__');
            mkdirSync(testDir, { recursive: true });

            writeFileSync(
                join(testDir, 'index.ts'),
                `export const test = 'no default export';`
            );

            const app = new Hono();
            const loader = new AutoRouteLoader(testDir, false);

            // Should not throw, but should skip the invalid route
            const stats = await loader.load(app);
            expect(stats.total).toBe(0); // No routes loaded

            rmSync(testDir, { recursive: true, force: true });
        });

        it('should handle empty directory gracefully', async () => {
            const testDir = join(process.cwd(), '__test_routes_empty__');
            mkdirSync(testDir, { recursive: true });

            const app = new Hono();
            const loader = new AutoRouteLoader(testDir, false);
            const stats = await loader.load(app);

            expect(stats.total).toBe(0);

            rmSync(testDir, { recursive: true, force: true });
        });
    });

    describe('loadRoutes Helper', () => {
        it('should use default routes directory', async () => {
            const app = new Hono();

            // This will fail if directory doesn't exist, but tests the path resolution
            const defaultDir = join(process.cwd(), 'src', 'server', 'routes');

            if (!existsSync(defaultDir)) {
                mkdirSync(defaultDir, { recursive: true });
            }

            try {
                await loadRoutes(app, { debug: false });
            } catch (error) {
                // Expected to fail if no routes, but shouldn't crash
            }
        });

        it('should accept custom routes directory', async () => {
            const app = new Hono();
            const stats = await loadRoutes(app, {
                routesDir: TEST_ROUTES_DIR,
                debug: false,
                includeFunctionRoutes: false,
            });

            expect(stats.total).toBe(4);
        });
    });

    describe('Skip Middlewares (Integration)', () => {
        it('should actually skip middlewares when using createApp with skipMiddlewares', async () => {
            const testDir = join(process.cwd(), '__test_routes_skip__');
            mkdirSync(testDir, { recursive: true });

            // Create route file using createApp with skipMiddlewares
            writeFileSync(
                join(testDir, 'index.ts'),
                `
import { createApp } from '${CREATE_APP_PATH}';

const app = createApp();

// Contract with skipMiddlewares
const publicContract = {
    method: 'GET',
    path: '/public',
    response: null,
    meta: {
        skipMiddlewares: ['auth']
    }
};

// Contract without skipMiddlewares
const privateContract = {
    method: 'GET',
    path: '/private',
    response: null
};

app.bind(publicContract, async (c) => {
    return c.json({ message: 'public' });
});

app.bind(privateContract, async (c) => {
    return c.json({ message: 'private' });
});

export default app;
                `
            );

            // Track middleware executions
            const executions = [];
            const authMiddleware = async (c, next) => {
                executions.push('auth');
                return next();
            };

            const app = new Hono();
            const loader = new AutoRouteLoader(
                testDir,
                false,
                [{ name: 'auth', handler: authMiddleware }]
            );

            await loader.load(app);

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

            rmSync(testDir, { recursive: true, force: true });
        });
    });

    describe('External Routes (loadExternalRoutes)', () => {
        it('should load external routes with prefix', async () => {
            const externalDir = join(process.cwd(), '__test_external_routes__');
            mkdirSync(join(externalDir, 'api'), { recursive: true });

            // Create external route with prefix in contract path
            writeFileSync(
                join(externalDir, 'api', 'index.ts'),
                `
import { Type } from '@sinclair/typebox';
import { createApp } from '${CREATE_APP_PATH}';

const app = createApp();

const testContract = {
    method: 'GET',
    path: '/external/test', // Contract path must include prefix
    response: Type.Object({
        external: Type.Boolean(),
    }),
} as const;

app.bind(testContract, async (c) => {
    return c.json({ external: true });
});

export default app;
                `
            );

            const app = new Hono();
            const loader = new AutoRouteLoader(TEST_ROUTES_DIR, false);

            // Load external routes with prefix validation
            const stats = await loader.loadExternalRoutes(
                app,
                externalDir,
                'test-package',
                '/external'
            );

            expect(stats.total).toBe(1);
            expect(stats.routes[0].path).toBe('/external/test');

            // Test actual route with prefix
            const res = await app.request('/external/test');
            expect(res.status).toBe(200);
            const json = await res.json();
            expect(json.external).toBe(true);

            rmSync(externalDir, { recursive: true, force: true });
        });

        it('should reject routes without prefix when prefix is required', async () => {
            const externalDir = join(process.cwd(), '__test_external_routes_invalid__');
            mkdirSync(join(externalDir, 'api'), { recursive: true });

            // Create external route WITHOUT prefix in contract path
            writeFileSync(
                join(externalDir, 'api', 'index.ts'),
                `
import { Type } from '@sinclair/typebox';
import { createApp } from '${CREATE_APP_PATH}';

const app = createApp();

const testContract = {
    method: 'GET',
    path: '/test', // Missing required prefix!
    response: Type.Object({
        external: Type.Boolean(),
    }),
} as const;

app.bind(testContract, async (c) => {
    return c.json({ external: true });
});

export default app;
                `
            );

            const app = new Hono();
            const loader = new AutoRouteLoader(TEST_ROUTES_DIR, false);

            // Load external routes with prefix - should fail validation
            const stats = await loader.loadExternalRoutes(
                app,
                externalDir,
                'test-package',
                '/external'
            );

            // Route should be rejected due to missing prefix
            expect(stats.total).toBe(0);

            rmSync(externalDir, { recursive: true, force: true });
        });
    });

    describe('Middleware Options', () => {
        it('should accept middlewares option in loadRoutes', async () => {
            const executions: string[] = [];

            const logMiddleware = async (c: any, next: any) => {
                executions.push('log');
                return next();
            };

            const app = new Hono();
            await loadRoutes(app, {
                routesDir: TEST_ROUTES_DIR,
                debug: false,
                includeFunctionRoutes: false,
                middlewares: [{ name: 'log', handler: logMiddleware }]
            });

            const res = await app.request('/users');
            expect(res.status).toBe(200);
            expect(executions).toContain('log');
        });
    });
});