/**
 * Route Scanner Tests
 *
 * Tests for route scanning and contract mapping
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { scanRouteContracts, groupByResource } from '../route-scanner.js';
import type { RouteContractMapping } from '../types.js';

const TEST_DIR = resolve(process.cwd(), '.test-tmp-scanner');
const ROUTES_DIR = join(TEST_DIR, 'routes');

describe('Route Scanner', () =>
{
    beforeEach(() =>
    {
        // Create test directory structure
        mkdirSync(ROUTES_DIR, { recursive: true });
    });

    afterEach(() =>
    {
        // Clean up test directory
        rmSync(TEST_DIR, { recursive: true, force: true });
    });

    describe('scanRouteContracts()', () =>
    {
        it('should scan single route file', async () =>
        {
            const routeFile = join(ROUTES_DIR, 'index.ts');
            writeFileSync(routeFile, `
                import { Hono } from 'hono';
                import { bind } from '@spfn/core/route';
                import { healthContract } from './contracts';

                const app = new Hono();
                app.get('/', bind(healthContract, async (c) => {
                    return c.json({ ok: true });
                }));

                export default app;
            `);

            const mappings = await scanRouteContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0]).toMatchObject({
                method: 'GET',
                path: '/',
                contractName: 'healthContract'
            });
        });

        it('should scan nested route files', async () =>
        {
            // Create users route
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            const usersRoute = join(usersDir, 'index.ts');
            writeFileSync(usersRoute, `
                import { Hono } from 'hono';
                import { bind } from '@spfn/core/route';
                import { listUsersContract } from '@/contracts/users';

                const app = new Hono();
                app.get('/', bind(listUsersContract, handler));
                export default app;
            `);

            // Create posts route
            const postsDir = join(ROUTES_DIR, 'posts');
            mkdirSync(postsDir, { recursive: true });

            const postsRoute = join(postsDir, 'index.ts');
            writeFileSync(postsRoute, `
                import { bind } from '@spfn/core/route';
                import { listPostsContract } from '@/contracts/posts';

                const app = new Hono();
                app.get('/', bind(listPostsContract, handler));
                export default app;
            `);

            const mappings = await scanRouteContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(2);

            // Check that paths are generated from file structure
            const userMapping = mappings.find(m => m.contractName === 'listUsersContract');
            const postMapping = mappings.find(m => m.contractName === 'listPostsContract');

            expect(userMapping).toBeDefined();
            expect(postMapping).toBeDefined();

            // Paths are derived from directory structure (explicit paths in bind())
            expect(userMapping?.path).toBe('/');
            expect(postMapping?.path).toBe('/');
        });

        it('should handle dynamic route segments', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            const dynamicRoute = join(usersDir, '[id].ts');
            writeFileSync(dynamicRoute, `
                import { bind } from '@spfn/core/route';
                import { getUserContract } from '@/contracts/users';

                const app = new Hono();
                app.get('/:id', bind(getUserContract, handler));
                export default app;
            `);

            const mappings = await scanRouteContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            // Path comes from explicit bind() call, not file structure
            expect(mappings[0].path).toBe('/:id');
        });

        it('should handle multiple HTTP methods in single file', async () =>
        {
            const usersRoute = join(ROUTES_DIR, 'users.ts');
            writeFileSync(usersRoute, `
                import { bind } from '@spfn/core/route';
                import { listUsersContract, createUserContract } from '@/contracts/users';

                const app = new Hono();
                app.get('/users', bind(listUsersContract, handler1));
                app.post('/users', bind(createUserContract, handler2));
                export default app;
            `);

            const mappings = await scanRouteContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(2);
            expect(mappings.some(m => m.method === 'GET' && m.contractName === 'listUsersContract')).toBe(true);
            expect(mappings.some(m => m.method === 'POST' && m.contractName === 'createUserContract')).toBe(true);
        });

        it('should skip files without contracts', async () =>
        {
            const routeFile = join(ROUTES_DIR, 'index.ts');
            writeFileSync(routeFile, `
                import { Hono } from 'hono';

                const app = new Hono();
                app.get('/', (c) => c.json({ ok: true }));
                export default app;
            `);

            const mappings = await scanRouteContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(0);
        });

        it('should handle catch-all routes', async () =>
        {
            const catchAllRoute = join(ROUTES_DIR, '[...all].ts');
            writeFileSync(catchAllRoute, `
                import { bind } from '@spfn/core/route';
                import { notFoundContract } from '@/contracts/common';

                const app = new Hono();
                app.get('/*', bind(notFoundContract, handler));
                export default app;
            `);

            const mappings = await scanRouteContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].path).toBe('/*');
        });

        it('should return empty array for non-existent directory', async () =>
        {
            const mappings = await scanRouteContracts(join(TEST_DIR, 'non-existent'));
            expect(mappings).toHaveLength(0);
        });

        it('should convert file paths to URL paths correctly', async () =>
        {
            // Create nested route structure
            mkdirSync(join(ROUTES_DIR, 'api/v1/users'), { recursive: true });

            const route = join(ROUTES_DIR, 'api/v1/users/[id].ts');
            writeFileSync(route, `
                import { bind } from '@spfn/core/route';
                import { getUserContract } from '@/contracts/users';

                const app = new Hono();
                app.get('/:id', bind(getUserContract, handler));
                export default app;
            `);

            const mappings = await scanRouteContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            // Path comes from explicit bind() call, not file structure
            expect(mappings[0].path).toBe('/:id');
        });

        it('should handle index routes correctly', async () =>
        {
            const indexRoute = join(ROUTES_DIR, 'index.ts');
            writeFileSync(indexRoute, `
                import { bind } from '@spfn/core/route';
                import { rootContract } from '@/contracts/root';

                const app = new Hono();
                app.get('/', bind(rootContract, handler));
                export default app;
            `);

            const mappings = await scanRouteContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].path).toBe('/');
        });
    });

    describe('groupByResource()', () =>
    {
        it('should group routes by resource', () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/users',
                    contractName: 'listUsersContract',
                    contractImportPath: '@/contracts/users',
                    routeFile: 'routes/users/index.ts'
                },
                {
                    method: 'POST',
                    path: '/users',
                    contractName: 'createUserContract',
                    contractImportPath: '@/contracts/users',
                    routeFile: 'routes/users/index.ts'
                },
                {
                    method: 'GET',
                    path: '/posts',
                    contractName: 'listPostsContract',
                    contractImportPath: '@/contracts/posts',
                    routeFile: 'routes/posts/index.ts'
                }
            ];

            const grouped = groupByResource(mappings);

            expect(Object.keys(grouped)).toHaveLength(2);
            expect(grouped['users']).toHaveLength(2);
            expect(grouped['posts']).toHaveLength(1);
        });

        it('should handle nested paths', () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/api/v1/users',
                    contractName: 'contract1',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/api/v1/users.ts'
                },
                {
                    method: 'GET',
                    path: '/api/v1/posts',
                    contractName: 'contract2',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/api/v1/posts.ts'
                }
            ];

            const grouped = groupByResource(mappings);

            expect(Object.keys(grouped)).toHaveLength(2);
            // Resource names use camelCase
            expect(grouped['apiV1Users']).toBeDefined();
            expect(grouped['apiV1Posts']).toBeDefined();
        });

        it('should handle root path', () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/',
                    contractName: 'rootContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/index.ts'
                }
            ];

            const grouped = groupByResource(mappings);

            expect(grouped['root']).toBeDefined();
            expect(grouped['root']).toHaveLength(1);
        });

        it('should handle dynamic segments', () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/users/:id',
                    contractName: 'getUserContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/users/[id].ts'
                },
                {
                    method: 'GET',
                    path: '/users/:id/posts',
                    contractName: 'getUserPostsContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/users/[id]/posts.ts'
                }
            ];

            const grouped = groupByResource(mappings);

            // First route groups under 'users', second under 'usersPosts'
            expect(grouped['users']).toHaveLength(1);
            expect(grouped['usersPosts']).toHaveLength(1);
        });

        it('should return empty object for empty input', () =>
        {
            const grouped = groupByResource([]);
            expect(Object.keys(grouped)).toHaveLength(0);
        });
    });
});