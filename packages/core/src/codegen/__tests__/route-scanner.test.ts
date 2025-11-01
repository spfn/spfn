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

        it('should handle paths with only dynamic segments', () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/:id',
                    contractName: 'getByIdContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/[id].ts'
                },
                {
                    method: 'GET',
                    path: '/:id/:slug',
                    contractName: 'getByIdSlugContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/[id]/[slug].ts'
                }
            ];

            const grouped = groupByResource(mappings);

            // Should group under 'root' when only dynamic segments
            expect(grouped['root']).toBeDefined();
        });

        it('should handle paths with hyphens in names', () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'POST',
                    path: '/upload-and-analyze',
                    contractName: 'uploadContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/upload-and-analyze.ts'
                },
                {
                    method: 'GET',
                    path: '/video-processing/status',
                    contractName: 'statusContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/video-processing/status.ts'
                }
            ];

            const grouped = groupByResource(mappings);

            // Should convert hyphens to camelCase
            expect(grouped['uploadAndAnalyze']).toBeDefined();
            expect(grouped['videoProcessingStatus']).toBeDefined();
        });

        it('should handle paths with underscores in names', () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/user_profile',
                    contractName: 'profileContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/user_profile.ts'
                },
                {
                    method: 'GET',
                    path: '/admin_panel/settings',
                    contractName: 'settingsContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/admin_panel/settings.ts'
                }
            ];

            const grouped = groupByResource(mappings);

            // Should convert underscores to camelCase
            expect(grouped['userProfile']).toBeDefined();
            expect(grouped['adminPanelSettings']).toBeDefined();
        });

        it('should handle mixed static and dynamic segments', () =>
        {
            const mappings: RouteContractMapping[] = [
                {
                    method: 'GET',
                    path: '/users/:userId/posts/:postId',
                    contractName: 'getUserPostContract',
                    contractImportPath: '@/contracts',
                    routeFile: 'routes/users/[userId]/posts/[postId].ts'
                }
            ];

            const grouped = groupByResource(mappings);

            // Should group by static segments only
            expect(grouped['usersPosts']).toBeDefined();
            expect(grouped['usersPosts']).toHaveLength(1);
        });
    });
});