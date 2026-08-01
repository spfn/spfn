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
});
