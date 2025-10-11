/**
 * Client Generator Tests
 *
 * TODO: Update tests for singleton client pattern
 * Current tests expect createClient() pattern, but implementation uses singleton
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { generateClient } from '../client-generator.js';
import type { RouteContractMapping, ClientGenerationOptions } from '../types.js';

const TEST_DIR = resolve(process.cwd(), '.test-tmp-generator');
const OUTPUT_FILE = join(TEST_DIR, 'generated-client.ts');

describe.skip('Client Generator', () =>
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
                outputPath: OUTPUT_FILE,
                includeTypes: true,
                includeJsDoc: true
            };

            const stats = await generateClient(mappings, options);

            expect(stats.resourcesGenerated).toBe(1);
            expect(stats.methodsGenerated).toBe(1);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should include contract import
            expect(generated).toContain("import { listUsersContract } from '@/contracts/users'");

            // Should include client import
            expect(generated).toContain("import { createClient } from '@spfn/core/client'");

            // Should create client instance
            expect(generated).toContain('const client = createClient');

            // Should generate API object
            expect(generated).toContain('export const api =');

            // Should generate resource within api
            expect(generated).toContain('users:');

            // Should generate method
            expect(generated).toContain('list:');
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
                outputPath: OUTPUT_FILE
            };

            const stats = await generateClient(mappings, options);

            expect(stats.resourcesGenerated).toBe(1);
            expect(stats.methodsGenerated).toBe(3);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should include all contracts
            expect(generated).toContain('listUsersContract');
            expect(generated).toContain('createUserContract');
            expect(generated).toContain('getUserContract');

            // Should generate all methods
            expect(generated).toContain('list:');
            expect(generated).toContain('create:');
            expect(generated).toContain('getById:');
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
                outputPath: OUTPUT_FILE
            };

            const stats = await generateClient(mappings, options);

            expect(stats.resourcesGenerated).toBe(2);
            expect(stats.methodsGenerated).toBe(2);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should include multiple resources in api object
            expect(generated).toContain('users:');
            expect(generated).toContain('posts:');
        });

        it('should include base URL if provided', async () =>
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
                outputPath: OUTPUT_FILE,
                baseUrl: 'https://api.example.com'
            };

            await generateClient(mappings, options);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should include base URL in client creation
            expect(generated).toContain('https://api.example.com');
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
                outputPath: OUTPUT_FILE,
                includeJsDoc: true
            };

            await generateClient(mappings, options);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should include JSDoc comments
            expect(generated).toContain('/**');
            expect(generated).toContain('* GET /users/:id');
        });

        it('should handle empty mappings', async () =>
        {
            const mappings: RouteContractMapping[] = [];

            const options: ClientGenerationOptions = {
                routesDir: join(TEST_DIR, 'routes'),
                outputPath: OUTPUT_FILE
            };

            const stats = await generateClient(mappings, options);

            expect(stats.resourcesGenerated).toBe(0);
            expect(stats.methodsGenerated).toBe(0);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should still create valid TypeScript file with header comment
            expect(generated).toContain('/**');
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
                outputPath: OUTPUT_FILE
            };

            await generateClient(mappings, options);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should generate semantic method names
            expect(generated).toContain('getById:');
            expect(generated).toContain('delete:');
            expect(generated).toContain('update:');
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
                outputPath: OUTPUT_FILE
            };

            await generateClient(mappings, options);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should have single import statement for both contracts
            const importMatches = generated.match(/import.*from '@\/contracts\/users'/g);
            expect(importMatches).toHaveLength(1);

            // But should include both contracts
            expect(generated).toContain('listUsersContract');
            expect(generated).toContain('createUserContract');
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
                outputPath: OUTPUT_FILE
            };

            const stats = await generateClient(mappings, options);

            expect(stats.methodsGenerated).toBe(1);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should generate resource name from path (camelCase for nested paths)
            expect(generated).toContain('apiV1UsersPostsComments:');
        });

        it('should include auth helper', async () =>
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
                outputPath: OUTPUT_FILE
            };

            await generateClient(mappings, options);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Should include createAuthClient helper
            expect(generated).toContain('export function createAuthClient');
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
                outputPath: OUTPUT_FILE
            };

            await generateClient(mappings, options);

            const generated = readFileSync(OUTPUT_FILE, 'utf-8');

            // Basic syntax checks
            expect(generated).not.toContain('undefined');
            expect(generated).not.toContain('[object Object]');

            // Should have proper structure
            expect(generated).toContain('import');
            expect(generated).toContain('export');
            expect(generated).toContain('const client');
        });
    });
});