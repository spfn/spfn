/**
 * Route Scanner Tests
 *
 * Tests for route grouping utilities
 */

import { describe, it, expect } from 'vitest';
import { groupByResource } from '../route-scanner.js';
import type { RouteContractMapping } from '../types.js';

describe('Route Scanner', () =>
{
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