/**
 * Contract Scanner Tests
 *
 * Tests for co-located contract scanning (routes/star-star/contract.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { scanContracts } from '../contract-scanner.js';

const TEST_DIR = resolve(process.cwd(), '.test-tmp-contract-scanner');
const ROUTES_DIR = join(TEST_DIR, 'routes');

describe('Contract Scanner', () =>
{
    beforeEach(() =>
    {
        mkdirSync(ROUTES_DIR, { recursive: true });
    });

    afterEach(() =>
    {
        rmSync(TEST_DIR, { recursive: true, force: true });
    });

    describe('Co-located Contracts', () =>
    {
        it('should scan single contract from routes/users/contract.ts', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'contract.ts'), `
                export const listUsersContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0]).toMatchObject({
                method: 'GET',
                path: '/users',
                contractName: 'listUsersContract'
            });
            expect(mappings[0].contractImportPath).toBe('@/server/routes/users/contract');
        });

        it('should combine base path with contract path', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'contract.ts'), `
                export const listContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };

                export const createContract = {
                    method: 'POST',
                    path: '/',
                    response: {}
                };

                export const getByIdContract = {
                    method: 'GET',
                    path: '/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(3);
            expect(mappings.find(m => m.method === 'GET' && m.path === '/users')).toBeDefined();
            expect(mappings.find(m => m.method === 'POST' && m.path === '/users')).toBeDefined();
            expect(mappings.find(m => m.method === 'GET' && m.path === '/users/:id')).toBeDefined();
        });

        it('should handle dynamic parameters in directory names', async () =>
        {
            const userIdDir = join(ROUTES_DIR, 'users', '[id]');
            mkdirSync(userIdDir, { recursive: true });

            writeFileSync(join(userIdDir, 'contract.ts'), `
                export const getUserContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };

                export const updateUserContract = {
                    method: 'PATCH',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(2);
            expect(mappings[0].path).toBe('/users/:id');
            expect(mappings[1].path).toBe('/users/:id');
        });

        it('should handle nested dynamic parameters', async () =>
        {
            const nestedDir = join(ROUTES_DIR, 'users', '[userId]', 'posts', '[postId]');
            mkdirSync(nestedDir, { recursive: true });

            writeFileSync(join(nestedDir, 'contract.ts'), `
                export const getPostContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].path).toBe('/users/:userId/posts/:postId');
        });

        it('should handle root index route', async () =>
        {
            const indexDir = join(ROUTES_DIR, 'index');
            mkdirSync(indexDir, { recursive: true });

            writeFileSync(join(indexDir, 'contract.ts'), `
                export const rootContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].path).toBe('/');
        });

        it('should skip index segments in paths', async () =>
        {
            const postsIndexDir = join(ROUTES_DIR, 'posts', 'index');
            mkdirSync(postsIndexDir, { recursive: true });

            writeFileSync(join(postsIndexDir, 'contract.ts'), `
                export const listPostsContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].path).toBe('/posts');
        });
    });

    describe('Multiple Contract Files', () =>
    {
        it('should scan contracts from multiple directories', async () =>
        {
            // Users contracts
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });
            writeFileSync(join(usersDir, 'contract.ts'), `
                export const listUsersContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            // Posts contracts
            const postsDir = join(ROUTES_DIR, 'posts');
            mkdirSync(postsDir, { recursive: true });
            writeFileSync(join(postsDir, 'contract.ts'), `
                export const listPostsContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(2);
            expect(mappings.some(m => m.path === '/users')).toBe(true);
            expect(mappings.some(m => m.path === '/posts')).toBe(true);
        });

        it('should handle deeply nested routes', async () =>
        {
            const apiDir = join(ROUTES_DIR, 'api', 'v1', 'users');
            mkdirSync(apiDir, { recursive: true });

            writeFileSync(join(apiDir, 'contract.ts'), `
                export const listUsersContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].path).toBe('/api/v1/users');
            expect(mappings[0].contractImportPath).toBe('@/server/routes/api/v1/users/contract');
        });
    });

    describe('Contract Validation', () =>
    {
        it('should skip contracts without method', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'contract.ts'), `
                export const invalidContract = {
                    path: '/',
                    response: {}
                };

                export const validContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('validContract');
        });

        it('should skip contracts without path', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'contract.ts'), `
                export const invalidContract = {
                    method: 'GET',
                    response: {}
                };

                export const validContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('validContract');
        });

        it('should skip non-contract exports', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'contract.ts'), `
                // Regular constants
                export const API_URL = 'http://example.com';
                export const MAX_USERS = 100;

                // Function
                export function helper() {
                    return 'helper';
                }

                // Valid contract
                export const getUserContract = {
                    method: 'GET',
                    path: '/:id',
                    response: {}
                };

                // Type
                export type UserType = { id: string };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('getUserContract');
        });
    });

    describe('HTTP Methods', () =>
    {
        it('should handle all HTTP methods', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'contract.ts'), `
                export const getContract = {
                    method: 'GET',
                    path: '/',
                    response: {}
                };

                export const postContract = {
                    method: 'POST',
                    path: '/',
                    response: {}
                };

                export const putContract = {
                    method: 'PUT',
                    path: '/:id',
                    response: {}
                };

                export const patchContract = {
                    method: 'PATCH',
                    path: '/:id',
                    response: {}
                };

                export const deleteContract = {
                    method: 'DELETE',
                    path: '/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(5);
            expect(mappings.map(m => m.method).sort()).toEqual(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);
        });
    });

    describe('Contract Naming', () =>
    {
        it('should recognize contract suffix', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'contract.ts'), `
                export const getUserContract = {
                    method: 'GET',
                    path: '/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('getUserContract');
        });

        it('should recognize schema suffix', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'contract.ts'), `
                export const getUserSchema = {
                    method: 'GET',
                    path: '/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('getUserSchema');
        });
    });

    describe('Edge Cases', () =>
    {
        it('should return empty array for non-existent directory', async () =>
        {
            const mappings = await scanContracts(join(TEST_DIR, 'non-existent'));
            expect(mappings).toHaveLength(0);
        });

        it('should handle directory without contract files', async () =>
        {
            const usersDir = join(ROUTES_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            // Create non-contract file
            writeFileSync(join(usersDir, 'index.ts'), `
                export default function handler() {
                    return { status: 200 };
                }
            `);

            const mappings = await scanContracts(ROUTES_DIR);

            expect(mappings).toHaveLength(0);
        });
    });
});