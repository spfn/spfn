/**
 * AST Parser Tests
 *
 * Tests for TypeScript AST parsing and contract detection
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, join } from 'path';
import {
    extractContractImports,
    extractBindCalls,
    filterContractImports,
    isLikelyContract,
    resolveImportPath
} from '../ast-parser.js';

const TEST_DIR = resolve(process.cwd(), '.test-tmp');

describe('AST Parser', () =>
{
    beforeEach(() =>
    {
        // Create test directory
        mkdirSync(TEST_DIR, { recursive: true });
    });

    afterEach(() =>
    {
        // Clean up test directory
        rmSync(TEST_DIR, { recursive: true, force: true });
    });

    describe('extractContractImports()', () =>
    {
        it('should extract named imports', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                import { getUserContract, createUserContract } from '@/contracts/users';
                import { Hono } from 'hono';
            `);

            const imports = extractContractImports(testFile);

            expect(imports).toHaveLength(3);
            expect(imports[0]).toEqual({
                name: 'getUserContract',
                importPath: '@/contracts/users',
                isDefault: false
            });
            expect(imports[1]).toEqual({
                name: 'createUserContract',
                importPath: '@/contracts/users',
                isDefault: false
            });
        });

        it('should extract default imports', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                import UserContract from '@/contracts/users';
            `);

            const imports = extractContractImports(testFile);

            expect(imports).toHaveLength(1);
            expect(imports[0]).toEqual({
                name: 'UserContract',
                importPath: '@/contracts/users',
                isDefault: true
            });
        });

        it('should handle mixed imports', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                import DefaultContract, { namedContract } from '@/contracts/mixed';
            `);

            const imports = extractContractImports(testFile);

            expect(imports).toHaveLength(2);
            expect(imports.some(i => i.name === 'DefaultContract' && i.isDefault)).toBe(true);
            expect(imports.some(i => i.name === 'namedContract' && !i.isDefault)).toBe(true);
        });

        it('should handle relative imports', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                import { contract } from './contracts';
                import { schema } from '../schemas/user';
            `);

            const imports = extractContractImports(testFile);

            expect(imports).toHaveLength(2);
            expect(imports[0].importPath).toBe('./contracts');
            expect(imports[1].importPath).toBe('../schemas/user');
        });

        it('should return empty array for file with no imports', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                const app = new Hono();
                app.get('/', (c) => c.json({ ok: true }));
            `);

            const imports = extractContractImports(testFile);
            expect(imports).toHaveLength(0);
        });
    });

    describe('extractBindCalls()', () =>
    {
        it('should extract bind() calls with GET method', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                import { bind } from '@spfn/core/route';

                const app = new Hono();
                app.get('/users/:id', bind(getUserContract, async (c) => {
                    return c.json({ id: c.params.id });
                }));
            `);

            const bindCalls = extractBindCalls(testFile);

            expect(bindCalls).toHaveLength(1);
            expect(bindCalls[0]).toEqual({
                method: 'GET',
                contractName: 'getUserContract',
                path: '/users/:id'
            });
        });

        it('should extract multiple bind() calls', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                import { bind } from '@spfn/core/route';

                const app = new Hono();
                app.get('/users', bind(listUsersContract, handler1));
                app.post('/users', bind(createUserContract, handler2));
                app.delete('/users/:id', bind(deleteUserContract, handler3));
            `);

            const bindCalls = extractBindCalls(testFile);

            expect(bindCalls).toHaveLength(3);
            expect(bindCalls[0].method).toBe('GET');
            expect(bindCalls[1].method).toBe('POST');
            expect(bindCalls[2].method).toBe('DELETE');
        });

        it('should handle various HTTP methods', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                const app = new Hono();
                app.get('/', bind(getContract, h1));
                app.post('/', bind(postContract, h2));
                app.put('/', bind(putContract, h3));
                app.patch('/', bind(patchContract, h4));
                app.delete('/', bind(deleteContract, h5));
                app.head('/', bind(headContract, h6));
                app.options('/', bind(optionsContract, h7));
            `);

            const bindCalls = extractBindCalls(testFile);

            expect(bindCalls).toHaveLength(7);
            expect(bindCalls.map(bc => bc.method)).toEqual([
                'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'
            ]);
        });

        it('should extract path parameters', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                app.get('/users/:userId/posts/:postId', bind(contract, handler));
            `);

            const bindCalls = extractBindCalls(testFile);

            expect(bindCalls[0].path).toBe('/users/:userId/posts/:postId');
        });

        it('should return empty array when no bind() calls found', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                const app = new Hono();
                app.get('/', (c) => c.json({ ok: true }));
            `);

            const bindCalls = extractBindCalls(testFile);
            expect(bindCalls).toHaveLength(0);
        });

        it('should handle bind calls without explicit path', () =>
        {
            const testFile = join(TEST_DIR, 'route.ts');
            writeFileSync(testFile, `
                const app = new Hono();
                const path = '/dynamic';
                app.get(path, bind(contract, handler));
            `);

            const bindCalls = extractBindCalls(testFile);

            expect(bindCalls).toHaveLength(1);
            expect(bindCalls[0].path).toBeUndefined();
        });
    });

    describe('isLikelyContract()', () =>
    {
        it('should identify contract names', () =>
        {
            expect(isLikelyContract('getUserContract')).toBe(true);
            expect(isLikelyContract('UserContract')).toBe(true);
            expect(isLikelyContract('createusercontract')).toBe(true);
        });

        it('should identify schema names', () =>
        {
            expect(isLikelyContract('userSchema')).toBe(true);
            expect(isLikelyContract('UserSchema')).toBe(true);
            expect(isLikelyContract('CreateUserSchema')).toBe(true);
        });

        it('should reject non-contract names', () =>
        {
            expect(isLikelyContract('Hono')).toBe(false);
            expect(isLikelyContract('handler')).toBe(false);
            expect(isLikelyContract('app')).toBe(false);
            expect(isLikelyContract('bind')).toBe(false);
        });
    });

    describe('filterContractImports()', () =>
    {
        it('should filter contract imports', () =>
        {
            const imports = [
                { name: 'getUserContract', importPath: '@/contracts', isDefault: false },
                { name: 'Hono', importPath: 'hono', isDefault: false },
                { name: 'bind', importPath: '@spfn/core/route', isDefault: false },
                { name: 'userSchema', importPath: '@/schemas', isDefault: false }
            ];

            const filtered = filterContractImports(imports);

            expect(filtered).toHaveLength(2);
            expect(filtered[0].name).toBe('getUserContract');
            expect(filtered[1].name).toBe('userSchema');
        });

        it('should return empty array when no contracts found', () =>
        {
            const imports = [
                { name: 'Hono', importPath: 'hono', isDefault: false },
                { name: 'bind', importPath: '@spfn/core/route', isDefault: false }
            ];

            const filtered = filterContractImports(imports);
            expect(filtered).toHaveLength(0);
        });
    });

    describe('resolveImportPath()', () =>
    {
        it('should resolve relative imports', () =>
        {
            const fromFile = join(TEST_DIR, 'routes/users/index.ts');
            const importPath = './contracts';

            const resolved = resolveImportPath(importPath, fromFile);

            expect(resolved).toContain('routes/users/contracts.ts');
        });

        it('should resolve parent directory imports', () =>
        {
            const fromFile = join(TEST_DIR, 'routes/users/index.ts');
            const importPath = '../contracts/user';

            const resolved = resolveImportPath(importPath, fromFile);

            expect(resolved).toContain('routes/contracts/user.ts');
        });

        it('should resolve @/ alias to src/', () =>
        {
            const fromFile = join(TEST_DIR, 'routes/users/index.ts');
            const importPath = '@/contracts/users';

            const resolved = resolveImportPath(importPath, fromFile);

            expect(resolved).toContain('src/contracts/users.ts');
        });

        it('should return null for node_modules imports', () =>
        {
            const fromFile = join(TEST_DIR, 'route.ts');
            const importPath = 'hono';

            const resolved = resolveImportPath(importPath, fromFile);

            expect(resolved).toBeNull();
        });

        it('should add .ts extension if missing', () =>
        {
            const fromFile = join(TEST_DIR, 'route.ts');
            const importPath = './contract';

            const resolved = resolveImportPath(importPath, fromFile);

            expect(resolved).toMatch(/\.ts$/);
        });
    });
});