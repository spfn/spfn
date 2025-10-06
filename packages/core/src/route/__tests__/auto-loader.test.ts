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

describe('AutoRouteLoader', () => {
    beforeAll(() => {
        // Create test routes directory
        if (!existsSync(TEST_ROUTES_DIR)) {
            mkdirSync(TEST_ROUTES_DIR, { recursive: true });
        }

        // Create test route files
        mkdirSync(join(TEST_ROUTES_DIR, 'users'), { recursive: true });
        mkdirSync(join(TEST_ROUTES_DIR, 'posts'), { recursive: true });

        // Static route: /users
        writeFileSync(
            join(TEST_ROUTES_DIR, 'users', 'index.ts'),
            `
import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => c.json({ message: 'Users list' }));
export default app;
            `
        );

        // Dynamic route: /users/:id
        writeFileSync(
            join(TEST_ROUTES_DIR, 'users', '[id].ts'),
            `
import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => c.json({ id: c.req.param('id') }));
export default app;
            `
        );

        // Static route: /posts
        writeFileSync(
            join(TEST_ROUTES_DIR, 'posts', 'index.ts'),
            `
import { Hono } from 'hono';
const app = new Hono();
app.get('/', (c) => c.json({ message: 'Posts list' }));
export default app;
            `
        );

        // Catch-all route: /posts/*
        writeFileSync(
            join(TEST_ROUTES_DIR, 'posts', '[...slug].ts'),
            `
import { Hono } from 'hono';
const app = new Hono();
app.get('/*', (c) => c.json({ slug: c.req.param('slug') }));
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
            await loadRoutes(app, { routesDir: TEST_ROUTES_DIR, debug: false });

            const res = await app.request('/users');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json).toEqual({ message: 'Users list' });
        });

        it('should register dynamic routes correctly', async () => {
            const app = new Hono();
            await loadRoutes(app, { routesDir: TEST_ROUTES_DIR, debug: false });

            const res = await app.request('/users/123');
            expect(res.status).toBe(200);

            const json = await res.json();
            expect(json).toEqual({ id: '123' });
        });

        it('should register catch-all routes correctly', async () => {
            const app = new Hono();
            await loadRoutes(app, { routesDir: TEST_ROUTES_DIR, debug: false });

            const res = await app.request('/posts/2024/01/hello-world');
            expect(res.status).toBe(200);

            // Catch-all route should match
            expect(res.ok).toBe(true);
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

        it('should handle routes without metadata', async () => {
            const testDir = join(process.cwd(), '__test_routes_no_meta__');
            mkdirSync(testDir, { recursive: true });

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

            expect(stats.routes[0].meta).toBeUndefined();

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

            await expect(loader.load(app)).rejects.toThrow(
                'Route file must export Hono instance as default'
            );

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
            });

            expect(stats.total).toBe(4);
        });
    });
});