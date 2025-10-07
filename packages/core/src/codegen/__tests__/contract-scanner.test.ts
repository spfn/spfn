/**
 * Contract Scanner Tests
 *
 * Tests for scanning server/contracts directory
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import { scanContracts } from '../contract-scanner.js';

const TEST_DIR = resolve(process.cwd(), '.test-tmp-contract-scanner');
const CONTRACTS_DIR = join(TEST_DIR, 'contracts');

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

    describe('scanContracts()', () =>
    {
        it('should scan single contract file', async () =>
        {
            const contractFile = join(CONTRACTS_DIR, 'users.ts');
            writeFileSync(contractFile, `
                import { Type } from '@sinclair/typebox';

                export const getUserContract = {
                    method: 'GET',
                    path: '/users/:id',
                    params: Type.Object({ id: Type.String() }),
                    response: Type.Object({ id: Type.String(), name: Type.String() })
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0]).toMatchObject({
                method: 'GET',
                path: '/users/:id',
                contractName: 'getUserContract'
            });
            expect(mappings[0].contractImportPath).toContain('contracts/users');
        });

        it('should scan multiple contracts in single file', async () =>
        {
            const contractFile = join(CONTRACTS_DIR, 'users.ts');
            writeFileSync(contractFile, `
                import { Type } from '@sinclair/typebox';

                export const listUsersContract = {
                    method: 'GET',
                    path: '/users',
                    response: Type.Array(Type.Object({}))
                };

                export const createUserContract = {
                    method: 'POST',
                    path: '/users',
                    body: Type.Object({ name: Type.String() }),
                    response: Type.Object({ id: Type.String() })
                };

                export const getUserContract = {
                    method: 'GET',
                    path: '/users/:id',
                    params: Type.Object({ id: Type.String() }),
                    response: Type.Object({})
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(3);
            expect(mappings.some(m => m.method === 'GET' && m.path === '/users')).toBe(true);
            expect(mappings.some(m => m.method === 'POST' && m.path === '/users')).toBe(true);
            expect(mappings.some(m => m.method === 'GET' && m.path === '/users/:id')).toBe(true);
        });

        it('should scan nested contract files', async () =>
        {
            // Create users contracts
            const usersDir = join(CONTRACTS_DIR, 'users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'get.ts'), `
                export const getUserContract = {
                    method: 'GET',
                    path: '/users/:id',
                    response: {}
                };
            `);

            writeFileSync(join(usersDir, 'create.ts'), `
                export const createUserContract = {
                    method: 'POST',
                    path: '/users',
                    response: {}
                };
            `);

            // Create posts contracts
            const postsDir = join(CONTRACTS_DIR, 'posts');
            mkdirSync(postsDir, { recursive: true });

            writeFileSync(join(postsDir, 'list.ts'), `
                export const listPostsContract = {
                    method: 'GET',
                    path: '/posts',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(3);
            expect(mappings.some(m => m.contractName === 'getUserContract')).toBe(true);
            expect(mappings.some(m => m.contractName === 'createUserContract')).toBe(true);
            expect(mappings.some(m => m.contractName === 'listPostsContract')).toBe(true);
        });

        it('should skip contracts without method or path', async () =>
        {
            const contractFile = join(CONTRACTS_DIR, 'invalid.ts');
            writeFileSync(contractFile, `
                // Missing method
                export const invalidContract1 = {
                    path: '/test',
                    response: {}
                };

                // Missing path
                export const invalidContract2 = {
                    method: 'GET',
                    response: {}
                };

                // Valid
                export const validContract = {
                    method: 'GET',
                    path: '/valid',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('validContract');
        });

        it('should skip non-contract exports', async () =>
        {
            const contractFile = join(CONTRACTS_DIR, 'mixed.ts');
            writeFileSync(contractFile, `
                // Regular constant (not a contract)
                export const API_URL = 'http://example.com';

                // Function (not a contract)
                export function helper() {
                    return 'helper';
                }

                // Valid contract
                export const getUserContract = {
                    method: 'GET',
                    path: '/users/:id',
                    response: {}
                };

                // Type (not a contract)
                export type UserType = { id: string };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractName).toBe('getUserContract');
        });

        it('should skip test files', async () =>
        {
            writeFileSync(join(CONTRACTS_DIR, 'users.test.ts'), `
                export const testContract = {
                    method: 'GET',
                    path: '/test',
                    response: {}
                };
            `);

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

        it('should return empty array for non-existent directory', async () =>
        {
            const mappings = await scanContracts(join(TEST_DIR, 'non-existent'));
            expect(mappings).toHaveLength(0);
        });

        it('should handle all HTTP methods', async () =>
        {
            const contractFile = join(CONTRACTS_DIR, 'methods.ts');
            writeFileSync(contractFile, `
                export const getContract = {
                    method: 'GET',
                    path: '/resource',
                    response: {}
                };

                export const postContract = {
                    method: 'POST',
                    path: '/resource',
                    response: {}
                };

                export const putContract = {
                    method: 'PUT',
                    path: '/resource',
                    response: {}
                };

                export const patchContract = {
                    method: 'PATCH',
                    path: '/resource',
                    response: {}
                };

                export const deleteContract = {
                    method: 'DELETE',
                    path: '/resource',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(5);
            expect(mappings.map(m => m.method).sort()).toEqual(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);
        });

        it('should extract correct import paths', async () =>
        {
            const usersDir = join(CONTRACTS_DIR, 'api/v1/users');
            mkdirSync(usersDir, { recursive: true });

            writeFileSync(join(usersDir, 'get.ts'), `
                export const getUserContract = {
                    method: 'GET',
                    path: '/api/v1/users/:id',
                    response: {}
                };
            `);

            const mappings = await scanContracts(CONTRACTS_DIR);

            expect(mappings).toHaveLength(1);
            expect(mappings[0].contractImportPath).toBe('@/server/contracts/api/v1/users/get');
        });

        it('should handle contracts with schema suffix', async () =>
        {
            const contractFile = join(CONTRACTS_DIR, 'users.ts');
            writeFileSync(contractFile, `
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
});