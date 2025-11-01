/**
 * Contract Scanner Tests
 *
 * Tests for lib/contracts scanning (centralized contract directory)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { scanContracts } from '../scanners/contract-scanner';

const TEST_DIR = resolve(process.cwd(), '.test-tmp-contract-scanner');
const SRC_DIR = join(TEST_DIR, 'src');
const CONTRACTS_DIR = join(SRC_DIR, 'lib', 'contracts');

describe('Contract Scanner', () =>
{
    beforeEach(() =>
    {
        mkdirSync(CONTRACTS_DIR, { recursive: true });
    });

    afterEach(() =>
    {
        rmSync(TEST_DIR, { recursive: true, force: true });
    });

    describe('lib/contracts Directory', () =>
    {
        it('should scan single contract from lib/contracts/users.ts', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const listUsersContract = {
                    method: 'GET',
                    path: '/users',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0]).toMatchObject({
                method: 'GET',
                path: '/users',
                contractName: 'listUsersContract'
            });
            expect(mappings[0].contractImportPath).toBe('@/lib/contracts/users');
        });

        it('should scan multiple contracts from single file', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const listContract = {
                    method: 'GET',
                    path: '/users',
                    response: {}
                };

                export const createContract = {
                    method: 'POST',
                    path: '/users',
                    response: {}
                };

                export const getByIdContract = {
                    method: 'GET',
                    path: '/users/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(3);
            expect(mappings.find(m => m.method === 'GET' && m.path === '/users')).toBeDefined();
            expect(mappings.find(m => m.method === 'POST' && m.path === '/users')).toBeDefined();
            expect(mappings.find(m => m.method === 'GET' && m.path === '/users/:id')).toBeDefined();
        });

        it('should handle dynamic parameters in paths', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const getUserContract = {
                    method: 'GET',
                    path: '/users/:id',
                    response: {}
                };

                export const updateUserContract = {
                    method: 'PATCH',
                    path: '/users/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(2);
            expect(mappings[0].path).toBe('/users/:id');
            expect(mappings[1].path).toBe('/users/:id');
        });

        it('should handle nested dynamic parameters', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'posts.ts'), `
                export const getPostContract = {
                    method: 'GET',
                    path: '/users/:userId/posts/:postId',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].path).toBe('/users/:userId/posts/:postId');
        });
    });

    describe('Multiple Contract Files', () =>
    {
        it('should scan contracts from multiple files', async () =>
        {
            // Users contracts
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const listUsersContract = {
                    method: 'GET',
                    path: '/users',
                    response: {}
                };
            `);

            // Posts contracts
            writeFileSync(join(CONTRACTS_DIR, 'posts.ts'), `
                export const listPostsContract = {
                    method: 'GET',
                    path: '/posts',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(2);
            expect(mappings.some(m => m.path === '/users')).toBe(true);
            expect(mappings.some(m => m.path === '/posts')).toBe(true);
        });

        it('should handle nested directory structure', async () =>
        {
            const apiDir = join(CONTRACTS_DIR, 'api');
            mkdirSync(apiDir, { recursive: true });

            writeFileSync(join(apiDir, 'users.ts'), `
                export const listUsersContract = {
                    method: 'GET',
                    path: '/api/v1/users',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].path).toBe('/api/v1/users');
            expect(mappings[0].contractImportPath).toBe('@/lib/contracts/api/users');
        });
    });

    describe('Contract Validation', () =>
    {
        it('should skip contracts without method', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const invalidContract = {
                    path: '/users',
                    response: {}
                };

                export const validContract = {
                    method: 'GET',
                    path: '/users',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('validContract');
        });

        it('should skip contracts without path', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const invalidContract = {
                    method: 'GET',
                    response: {}
                };

                export const validContract = {
                    method: 'GET',
                    path: '/users',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('validContract');
        });

        it('should skip non-contract exports', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
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
                    path: '/users/:id',
                    response: {}
                };

                // Type
                export type UserType = { id: string };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('getUserContract');
        });
    });

    describe('HTTP Methods', () =>
    {
        it('should handle all HTTP methods', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const getContract = {
                    method: 'GET',
                    path: '/users',
                    response: {}
                };

                export const postContract = {
                    method: 'POST',
                    path: '/users',
                    response: {}
                };

                export const putContract = {
                    method: 'PUT',
                    path: '/users/:id',
                    response: {}
                };

                export const patchContract = {
                    method: 'PATCH',
                    path: '/users/:id',
                    response: {}
                };

                export const deleteContract = {
                    method: 'DELETE',
                    path: '/users/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(5);
            expect(mappings.map(m => m.method).sort()).toEqual(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);
        });
    });

    describe('Contract Naming', () =>
    {
        it('should recognize contract suffix', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const getUserContract = {
                    method: 'GET',
                    path: '/users/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('getUserContract');
        });

        it('should recognize schema suffix', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.ts'), `
                export const getUserSchema = {
                    method: 'GET',
                    path: '/users/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

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
            // Create non-contract file
            writeFileSync(join(CONTRACTS_DIR, 'index.ts'), `
                export default function handler() {
                    return { status: 200 };
                }
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(0);
        });

        it('should handle .js and .mjs files', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.js'), `
                export const getUserContract = {
                    method: 'GET',
                    path: '/users/:id',
                    response: {}
                };
            `);

            writeFileSync(join(CONTRACTS_DIR, 'posts.mjs'), `
                export const getPostContract = {
                    method: 'GET',
                    path: '/posts/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(2);
            expect(mappings.some(m => m.contractName === 'getUserContract')).toBe(true);
            expect(mappings.some(m => m.contractName === 'getPostContract')).toBe(true);
        });
    });
});