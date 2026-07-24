import { describe, expect, it } from 'vitest';

import { filterPendingEntries, functionMigrationsTable } from '../migration-status.js';
import type { FunctionMigrationEntry } from '../function-migrations.js';

function entry(name: string, millis: number): FunctionMigrationEntry
{
    return { name, millis, hash: `hash-${name}`, statements: [] };
}

describe('filterPendingEntries', () =>
{
    it('treats entries newer than the last applied timestamp as pending', () =>
    {
        const entries = [entry('0000_first', 1000), entry('0001_second', 2000)];

        const pending = filterPendingEntries(entries, 1000, new Set());

        expect(pending.map(e => e.name)).toEqual(['0001_second']);
    });

    it('treats entries whose name is recorded as applied (drizzle-orm 1.0 projects)', () =>
    {
        const entries = [
            entry('20260101000000_first', Date.UTC(2026, 0, 1)),
            entry('20260102000000_second', Date.UTC(2026, 0, 2)),
        ];

        const pending = filterPendingEntries(entries, 0, new Set(['20260101000000_first']));

        expect(pending.map(e => e.name)).toEqual(['20260102000000_second']);
    });

    it('reports everything pending against an empty database', () =>
    {
        const entries = [entry('0000_first', 1000), entry('0001_second', 2000)];

        expect(filterPendingEntries(entries, 0, new Set())).toHaveLength(2);
    });
});

describe('functionMigrationsTable', () =>
{
    it('matches the per-package table naming of the migration runner', () =>
    {
        expect(functionMigrationsTable('@spfn/cms')).toBe('__spfn_fn_cms_migrations');
    });
});
