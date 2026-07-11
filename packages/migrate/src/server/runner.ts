/**
 * @spfn/migrate - Data Migrator Runner
 */

import { getDatabase, runInTransaction } from '@spfn/core/db';
import { logger } from '@spfn/core/logger';
import { DataMigrationRepository } from './repositories';
import type { DataMigration } from './types';

export interface DataMigratorOptions
{
    logLabel?: string;   // Default 'data-migrate'
}

export interface MigrateResult
{
    applied: string[];
    pending: string[];
}

export interface DataMigrator
{
    /** Apply all pending migrations in alphabetical order. */
    apply(): Promise<MigrateResult>;
    /** Check for pending migrations without applying them. */
    check(): Promise<MigrateResult>;
    /** Get status of all registered migrations. */
    status(): Promise<{ applied: string[]; pending: string[] }>;
    /** Mark all registered migrations as applied without executing them. */
    baseline(): Promise<string[]>;
}

export function createDataMigrator(migrations: DataMigration[], opts: DataMigratorOptions = {}): DataMigrator
{
    const log = logger.child(opts.logLabel ?? 'data-migrate');

    // BaseRepository resolves the ambient transaction context (AsyncLocalStorage)
    // first, so a single instance writes on the tx inside runInTransaction and on
    // the global write instance otherwise.
    const repo = new DataMigrationRepository();

    function pendingOf(applied: Set<string>): DataMigration[]
    {
        return migrations
            .filter((m) => !applied.has(m.name))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async function applyOne(m: DataMigration): Promise<void>
    {
        if (m.transaction === false)
        {
            log.warn('applying non-transactional migration; ensure idempotency', { name: m.name });
            const db = getDatabase('write');

            await m.up({ db, log });
            await repo.recordApplied(m.name);
        }
        else
        {
            await runInTransaction(async (tx) =>
            {
                await m.up({ db: tx, log });
                await repo.recordApplied(m.name);
            });
        }
        log.info('data migration applied', { name: m.name });
    }

    return {
        async apply(): Promise<MigrateResult>
        {
            const applied = new Set(await repo.findAppliedNames());
            const pending = pendingOf(applied);

            for (const m of pending)
            {
                await applyOne(m);
            }

            return { applied: pending.map((m) => m.name), pending: [] };
        },

        async check(): Promise<MigrateResult>
        {
            const applied = new Set(await repo.findAppliedNames());

            return { applied: [], pending: pendingOf(applied).map((m) => m.name) };
        },

        async status(): Promise<{ applied: string[]; pending: string[] }>
        {
            const applied = new Set(await repo.findAppliedNames());

            return {
                applied: migrations.filter((m) => applied.has(m.name)).map((m) => m.name).sort(),
                pending: pendingOf(applied).map((m) => m.name),
            };
        },

        async baseline(): Promise<string[]>
        {
            const applied = new Set(await repo.findAppliedNamesOnPrimary());
            const toMark = migrations.filter((m) => !applied.has(m.name));

            for (const m of toMark)
            {
                await repo.recordApplied(m.name);
            }

            return toMark.map((m) => m.name);
        },
    };
}
