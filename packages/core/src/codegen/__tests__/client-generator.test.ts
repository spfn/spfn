/**
 * Client Generator Tests
 *
 * Tests for singleton client pattern
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { generateClient } from '../built-in/contract/emitter';
import type { RouteContractMapping, ClientGenerationOptions } from '../core/types';

const TEST_DIR = resolve(process.cwd(), '.test-tmp-generator');
const OUTPUT_DIR = join(TEST_DIR, 'api');

describe('Client Generator', () =>
{
    beforeEach(() =>
    {
        mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() =>
    {
        rmSync(TEST_DIR, { recursive: true, force: true });
    });

    describe('generateClient()', () =>
    {
        it('should generate client with single route', async () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/users',
                    contractName: 'listUsersContract',
                    contractImportPath: '@/contracts/users',
                    routeFile: 'routes/users/index.ts'
                }
            ];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR,
                includeTypes: true,
                includeJsDoc: true
            };

            const stats = await generateClient(mappings, options);

            expect(stats.resourcesGenerated).toBe(1);
            expect(stats.methodsGenerated).toBe(1);

            // Check that directory structure was created
            expect(existsSync(OUTPUT_DIR)).toBe(true);
            expect(existsSync(join(OUTPUT_DIR, 'users.ts'))).toBe(true);
            expect(existsSync(join(OUTPUT_DIR, 'index.ts'))).toBe(true);

            // Read the users resource file
            const usersFile = readFileSync(join(OUTPUT_DIR, 'users.ts'), 'utf-8');

            // Should include contract import
            expect(usersFile).toContain("import { listUsersContract } from '@/contracts/users'");

            // Should include singleton client import
            expect(usersFile).toContain("import { client } from '@spfn/core/client'");

            // Should export individual functions (not object)
            expect(usersFile).toContain('export const listUsers =');

            // Read the index file
            const indexFile = readFileSync(join(OUTPUT_DIR, 'index.ts'), 'utf-8');

            // Should export types from users
            expect(indexFile).toContain("export type {");
            expect(indexFile).toContain("from './users.js'");

            // Should export client
            expect(indexFile).toContain("export { client } from '@spfn/core/client'");
        });

        it('should generate client with multiple routes', async () =>
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
                    path: '/users/:id',
                    contractName: 'getUserContract',
                    contractImportPath: '@/contracts/users',
                    routeFile: 'routes/users/[id].ts'
                }
            ];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR
            };

            const stats = await generateClient(mappings, options);

            expect(stats.resourcesGenerated).toBe(1);
            expect(stats.methodsGenerated).toBe(3);

            const usersFile = readFileSync(join(OUTPUT_DIR, 'users.ts'), 'utf-8');

            // Should include all contracts
            expect(usersFile).toContain('listUsersContract');
            expect(usersFile).toContain('createUserContract');
            expect(usersFile).toContain('getUserContract');

            // Should generate all functions
            expect(usersFile).toContain('export const listUsers =');
            expect(usersFile).toContain('export const createUser =');
            expect(usersFile).toContain('export const getUser =');
        });

        it('should generate client with multiple resources', async () =>
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
                    method: 'GET',
                    path: '/posts',
                    contractName: 'listPostsContract',
                    contractImportPath: '@/contracts/posts',
                    routeFile: 'routes/posts/index.ts'
                }
            ];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR
            };

            const stats = await generateClient(mappings, options);

            expect(stats.resourcesGenerated).toBe(2);
            expect(stats.methodsGenerated).toBe(2);

            // Check both resource files exist
            expect(existsSync(join(OUTPUT_DIR, 'users.ts'))).toBe(true);
            expect(existsSync(join(OUTPUT_DIR, 'posts.ts'))).toBe(true);

            // Check index file exports types from both resources
            const indexFile = readFileSync(join(OUTPUT_DIR, 'index.ts'), 'utf-8');
            expect(indexFile).toContain("export type {");
            expect(indexFile).toContain("from './users.js'");
            expect(indexFile).toContain("from './posts.js'");

            // Check that api object combines all functions flattened
            expect(indexFile).toContain('export const api =');
            expect(indexFile).toContain('listUsers');
            expect(indexFile).toContain('listPosts');
        });


        it('should include JSDoc comments when enabled', async () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/users/:id',
                    contractName: 'getUserContract',
                    contractImportPath: '@/contracts/users',
                    routeFile: 'routes/users/[id].ts'
                }
            ];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR,
                includeJsDoc: true
            };

            await generateClient(mappings, options);

            const usersFile = readFileSync(join(OUTPUT_DIR, 'users.ts'), 'utf-8');

            // Should include JSDoc comments
            expect(usersFile).toContain('/**');
            expect(usersFile).toContain('* GET /users/:id');
        });

        it('should handle empty mappings', async () =>
        {
            const mappings: RouteContractMapping[] = [];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR
            };

            const stats = await generateClient(mappings, options);

            expect(stats.resourcesGenerated).toBe(0);
            expect(stats.methodsGenerated).toBe(0);

            // Should still create index file with header
            const indexFile = readFileSync(join(OUTPUT_DIR, 'index.ts'), 'utf-8');
            expect(indexFile).toContain('/**');
        });

        it('should generate method names from paths', async () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/users/:id',
                    contractName: 'getUserContract',
                    contractImportPath: '@/contracts/users',
                    routeFile: 'routes/users/[id].ts'
                },
                {
                    method: 'DELETE',
                    path: '/users/:id',
                    contractName: 'deleteUserContract',
                    contractImportPath: '@/contracts/users',
                    routeFile: 'routes/users/[id].ts'
                },
                {
                    method: 'PATCH',
                    path: '/users/:id',
                    contractName: 'updateUserContract',
                    contractImportPath: '@/contracts/users',
                    routeFile: 'routes/users/[id].ts'
                }
            ];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR
            };

            await generateClient(mappings, options);

            const usersFile = readFileSync(join(OUTPUT_DIR, 'users.ts'), 'utf-8');

            // Should generate semantic function names based on contract names
            expect(usersFile).toContain('export const getUser =');
            expect(usersFile).toContain('export const deleteUser =');
            expect(usersFile).toContain('export const updateUser =');
        });

        it('should deduplicate contract imports', async () =>
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
                }
            ];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR
            };

            await generateClient(mappings, options);

            const usersFile = readFileSync(join(OUTPUT_DIR, 'users.ts'), 'utf-8');

            // Should have single import statement for both contracts
            const importMatches = usersFile.match(/import.*from '@\/contracts\/users'/g);
            expect(importMatches).toHaveLength(1);

            // But should include both contracts
            expect(usersFile).toContain('listUsersContract');
            expect(usersFile).toContain('createUserContract');
        });

        it('should handle complex nested paths', async () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/api/v1/users/:userId/posts/:postId/comments',
                    contractName: 'getCommentsContract',
                    contractImportPath: '@/contracts/comments',
                    routeFile: 'routes/api/v1/users/[userId]/posts/[postId]/comments.ts'
                }
            ];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR
            };

            const stats = await generateClient(mappings, options);

            expect(stats.methodsGenerated).toBe(1);

            // Check index file for resource export (kebab-case)
            const indexFile = readFileSync(join(OUTPUT_DIR, 'index.ts'), 'utf-8');
            expect(indexFile).toContain("export type {");
            expect(indexFile).toContain("from './api-v1users-posts-comments.js'");

            // Check that api object has the function flattened
            expect(indexFile).toContain('export const api =');
            expect(indexFile).toContain('getComments');
        });


        it('should generate valid TypeScript', async () =>
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
                }
            ];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_DIR
            };

            await generateClient(mappings, options);

            const usersFile = readFileSync(join(OUTPUT_DIR, 'users.ts'), 'utf-8');

            // Basic syntax checks
            expect(usersFile).not.toContain('undefined');
            expect(usersFile).not.toContain('[object Object]');

            // Should have proper structure
            expect(usersFile).toContain('import');
            expect(usersFile).toContain('export');
            expect(usersFile).toContain('client');
        });
    });
});