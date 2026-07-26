/**
 * Migration status inspection
 *
 * Shared by `spfn db status` and the `spfn dev` startup warning.
 * Compares each migration folder (function packages + project, both drizzle-kit
 * layouts) against the applied-migration tracking tables.
 */

import { join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';

import { env } from '@spfn/core/config';
import { loadEnv } from '@spfn/core/server';

import {
    discoverFunctionMigrations,
    readMigrationEntries,
    type FunctionMigrationEntry,
} from './function-migrations.js';

export type MigrationTargetStatus = {
    name: string;
    total: number;
    applied: number;
    pending: number;
    pendingTags: string[];
};

export type MigrationStatus = {
    packages: MigrationTargetStatus[];
    project: MigrationTargetStatus | null;
};

/**
 * Per-package migrations table name — must match executeFunctionMigrations()
 */
export function functionMigrationsTable(packageName: string): string
{
    return `__spfn_fn_${packageName.replace('@spfn/', '')}_migrations`;
}

/**
 * An entry counts as applied when its name is recorded (drizzle-orm 1.0
 * projects) or its timestamp is not newer than the last applied record —
 * the rule the CLI's function-migration runner and drizzle-orm ≤0.45 share.
 */
export function filterPendingEntries(
    entries: FunctionMigrationEntry[],
    lastAppliedMillis: number,
    appliedNames: Set<string>,
): FunctionMigrationEntry[]
{
    return entries.filter(entry => entry.millis > lastAppliedMillis && !appliedNames.has(entry.name));
}

/**
 * drizzle-orm 1.0 records a `name` column and treats a migration as applied
 * when its name is present; CLI-owned per-package tables have no such column.
 */
async function readAppliedNames(sql: any, tableName: string): Promise<Set<string>>
{
    const columnCheck = await sql`
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'drizzle' AND table_name = ${tableName} AND column_name = 'name'
        ) AS "exists"`;

    if (!columnCheck[0]?.exists)
    {
        return new Set();
    }

    const rows: { name: string }[] = await sql`
        SELECT name FROM drizzle.${sql(tableName)} WHERE name IS NOT NULL`;

    return new Set(rows.map(row => row.name));
}

async function collectTargetStatus(
    sql: any,
    name: string,
    migrationsDir: string,
    tableName: string,
): Promise<MigrationTargetStatus>
{
    const entries = readMigrationEntries(migrationsDir, name);

    const tableCheck = await sql`
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'drizzle' AND table_name = ${tableName}
        ) AS "exists"`;

    let lastApplied = 0;
    let appliedNames = new Set<string>();

    if (tableCheck[0]?.exists)
    {
        const rows = await sql`
            SELECT created_at FROM drizzle.${sql(tableName)}
            ORDER BY created_at DESC LIMIT 1`;
        lastApplied = rows[0]?.created_at ? Number(rows[0].created_at) : 0;
        appliedNames = await readAppliedNames(sql, tableName);
    }

    const pendingEntries = filterPendingEntries(entries, lastApplied, appliedNames);

    return {
        name,
        total: entries.length,
        applied: entries.length - pendingEntries.length,
        pending: pendingEntries.length,
        pendingTags: pendingEntries.map(e => e.name),
    };
}

/**
 * Collect applied/pending status for all function packages and the project.
 * Throws when DATABASE_URL is missing or the database is unreachable.
 */
export async function getMigrationStatus(
    cwd: string = process.cwd(),
    databaseUrl?: string,
): Promise<MigrationStatus>
{
    loadEnv();
    const url = databaseUrl ?? env.DATABASE_URL;

    if (!url)
    {
        throw new Error('DATABASE_URL not found in environment');
    }

    const postgres = await import('postgres');
    const sql = postgres.default(url, { max: 1, connect_timeout: 5 });

    try
    {
        const packages: MigrationTargetStatus[] = [];

        for (const func of discoverFunctionMigrations(cwd))
        {
            packages.push(await collectTargetStatus(
                sql,
                func.packageName,
                func.migrationsDir,
                functionMigrationsTable(func.packageName),
            ));
        }

        const projectDir = join(cwd, 'src', 'server', 'drizzle');
        const project = existsSync(projectDir)
            ? await collectTargetStatus(sql, 'project (src/server/drizzle)', projectDir, '__drizzle_migrations')
            : null;

        return { packages, project: project && project.total > 0 ? project : null };
    }
    finally
    {
        await sql.end();
    }
}

/**
 * Warn (non-fatal) about pending migrations — used at `spfn dev` startup.
 * Silent when DATABASE_URL is absent or the database is unreachable:
 * dev must keep starting regardless.
 */
export async function warnPendingMigrations(cwd: string, databaseUrl?: string): Promise<void>
{
    let status: MigrationStatus;

    try
    {
        status = await getMigrationStatus(cwd, databaseUrl);
    }
    catch
    {
        return;
    }

    const targets = [...status.packages, ...(status.project ? [status.project] : [])]
        .filter(t => t.pending > 0);

    if (targets.length === 0)
    {
        return;
    }

    console.warn('');
    for (const target of targets)
    {
        console.warn(chalk.yellow(`⚠️  ${target.name}: ${target.pending} pending migration(s)`));
    }
    console.warn(chalk.yellow('   Missing tables will fail at request time — run: pnpm spfn db migrate\n'));
}
