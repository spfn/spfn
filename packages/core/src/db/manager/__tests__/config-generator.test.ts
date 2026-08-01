/**
 * Config Generator Unit Tests
 *
 * Tests drizzle config schema discovery — barrel files (index.*, config.*)
 * must be excluded on both POSIX and Windows path separators.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getDrizzleConfig } from '../config-generator';
import { toPosixPath } from '../path-utils';

const DB_URL = 'postgresql://user:pass@localhost:5432/testdb';

describe('getDrizzleConfig schema discovery', () =>
{
    let cwd: string;

    beforeEach(() =>
    {
        cwd = mkdtempSync(join(tmpdir(), 'spfn-config-gen-'));

        const entitiesDir = join(cwd, 'src', 'server', 'entities');
        mkdirSync(entitiesDir, { recursive: true });

        writeFileSync(join(entitiesDir, 'user.entity.ts'), 'export const users = {};');
        writeFileSync(join(entitiesDir, 'house.entity.ts'), 'export const houses = {};');
        writeFileSync(join(entitiesDir, 'index.ts'), "export * from './user.entity';");
        writeFileSync(join(entitiesDir, 'config.ts'), "export * from './user.entity';\nexport * from './house.entity';");
    });

    afterEach(() =>
    {
        rmSync(cwd, { recursive: true, force: true });
    });

    it('excludes config.ts barrel from expanded schemas (POSIX paths)', () =>
    {
        const config = getDrizzleConfig({
            databaseUrl: DB_URL,
            cwd,
            expandGlobs: true,
            disablePackageDiscovery: true,
        });

        const schemas = Array.isArray(config.schema) ? config.schema : [config.schema];

        expect(schemas.some(s => s.endsWith('user.entity.ts'))).toBe(true);
        expect(schemas.some(s => s.endsWith('house.entity.ts'))).toBe(true);
        expect(schemas.some(s => s.endsWith('config.ts'))).toBe(false);
        expect(schemas.some(s => s.endsWith('index.ts'))).toBe(false);
    });

    it('collects each entity file exactly once', () =>
    {
        const config = getDrizzleConfig({
            databaseUrl: DB_URL,
            cwd,
            expandGlobs: true,
            disablePackageDiscovery: true,
        });

        const schemas = Array.isArray(config.schema) ? config.schema : [config.schema];

        expect(schemas).toHaveLength(2);
        expect(new Set(schemas).size).toBe(schemas.length);
    });

    it('filters package schemas by packageFilter', () =>
    {
        const pkgDir = join(cwd, 'node_modules', '@spfn', 'fake-pkg');
        mkdirSync(join(pkgDir, 'entities'), { recursive: true });
        writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
            name: '@spfn/fake-pkg',
            spfn: { schemas: ['entities/*.ts'] },
        }));
        writeFileSync(join(pkgDir, 'entities', 'thing.entity.ts'), 'export const things = {};');

        const config = getDrizzleConfig({
            databaseUrl: DB_URL,
            cwd,
            packageFilter: '@spfn/fake-pkg',
        });

        const schemas = Array.isArray(config.schema) ? config.schema : [config.schema];

        expect(schemas).toHaveLength(1);
        expect(schemas[0].endsWith('thing.entity.ts')).toBe(true);
    });
});

describe('toPosixPath', () =>
{
    it('normalizes Windows separators to forward slashes', () =>
    {
        expect(toPosixPath('C:\\app\\node_modules\\@spfn\\pkg\\entities\\config.ts'))
            .toBe('C:/app/node_modules/@spfn/pkg/entities/config.ts');
    });

    it('leaves POSIX paths unchanged', () =>
    {
        expect(toPosixPath('/app/src/server/entities/config.ts'))
            .toBe('/app/src/server/entities/config.ts');
    });
});
