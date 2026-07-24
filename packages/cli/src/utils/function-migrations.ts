/**
 * Function Package Migration Discovery & Execution
 *
 * Discovers migrations shipped by SPFN function packages (e.g., @spfn/cms) and
 * applies them with a built-in runner. The runner reads both migration layouts —
 * drizzle-kit ≤0.31 (`NNNN_name.sql` + `meta/_journal.json`) and drizzle-kit 1.0
 * (`<YYYYMMDDHHMMSS>_name/migration.sql`) — so installed packages keep working
 * regardless of which drizzle-orm version the CLI bundles.
 */

import chalk from 'chalk';
import { createHash } from 'crypto';
import { join } from 'path';

import { env } from '@spfn/core/config';
import { loadEnv } from '@spfn/core/server';
import { existsSync, readdirSync, readFileSync } from 'fs';

export type FunctionMigrationInfo = {
    packageName: string;
    migrationsDir: string;
    packagePath: string;
};

export type FunctionMigrationEntry = {
    name: string;
    statements: string[];
    hash: string;
    millis: number;
};

export type FunctionMigrationPlan = FunctionMigrationInfo & {
    entries: FunctionMigrationEntry[];
};

/**
 * Minimal DB surface the runner needs. Adapters exist for postgres.js (runtime)
 * and PGlite (tests).
 */
export interface MigrationDb
{
    query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
    transaction<T>(fn: (tx: MigrationDb) => Promise<T>): Promise<T>;
}

/**
 * Discover all SPFN function packages with pre-generated migrations
 */
export function discoverFunctionMigrations(cwd: string = process.cwd()): FunctionMigrationInfo[]
{
    const nodeModulesPath = join(cwd, 'node_modules');

    if (!existsSync(nodeModulesPath))
    {
        return [];
    }

    const functions: FunctionMigrationInfo[] = [];

    // Check @spfn/* packages
    const spfnDir = join(nodeModulesPath, '@spfn');
    if (!existsSync(spfnDir))
    {
        return [];
    }

    const packages = readdirSync(spfnDir);

    for (const pkg of packages)
    {
        const packagePath = join(spfnDir, pkg);
        const packageJsonPath = join(packagePath, 'package.json');

        if (!existsSync(packageJsonPath))
        {
            continue;
        }

        try
        {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
            const spfnConfig = packageJson.spfn;

            if (!spfnConfig?.migrations)
            {
                continue;
            }

            const migrationsDir = join(packagePath, spfnConfig.migrations.dir);

            if (!existsSync(migrationsDir))
            {
                console.warn(
                    chalk.yellow(`⚠️  Package @spfn/${pkg} specifies migrations but directory not found: ${migrationsDir}`),
                );
                continue;
            }

            functions.push({
                packageName: `@spfn/${pkg}`,
                migrationsDir,
                packagePath,
            });
        }
        catch (error)
        {
            console.warn(chalk.yellow(`⚠️  Failed to parse package.json for @spfn/${pkg}`));
        }
    }

    return functions;
}

/**
 * Read a package's migration entries, auto-detecting the folder layout.
 *
 * A `meta/_journal.json` marks the drizzle-kit ≤0.31 layout; without it the
 * directory is read as the drizzle-kit 1.0 layout.
 */
export function readMigrationEntries(migrationsDir: string, packageName: string): FunctionMigrationEntry[]
{
    const journalPath = join(migrationsDir, 'meta', '_journal.json');

    return existsSync(journalPath)
        ? readJournalEntries(migrationsDir, journalPath, packageName)
        : readFolderEntries(migrationsDir, packageName);
}

/**
 * Parse migration folders for all packages up front, so a broken package fails
 * before anything touches the database.
 */
export function loadFunctionMigrationPlans(functionMigrations: FunctionMigrationInfo[]): FunctionMigrationPlan[]
{
    return functionMigrations.map(func => ({
        ...func,
        entries: readMigrationEntries(func.migrationsDir, func.packageName),
    }));
}

function readJournalEntries(
    migrationsDir: string,
    journalPath: string,
    packageName: string,
): FunctionMigrationEntry[]
{
    let journal: { entries?: unknown };
    try
    {
        journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
    }
    catch
    {
        journal = {};
    }

    if (!Array.isArray(journal.entries))
    {
        throw new Error(`${packageName}: invalid migration journal at ${journalPath}`);
    }

    const entries = [...journal.entries] as { idx: number; tag: string; when: number }[];
    entries.sort((a, b) => a.idx - b.idx);

    return entries.map(entry =>
    {
        if (typeof entry?.tag !== 'string' || typeof entry?.when !== 'number')
        {
            throw new Error(`${packageName}: invalid journal entry in ${journalPath}`);
        }

        const sqlPath = join(migrationsDir, `${entry.tag}.sql`);
        if (!existsSync(sqlPath))
        {
            throw new Error(`${packageName}: migration file not found: ${entry.tag}.sql`);
        }

        return toEntry(entry.tag, readFileSync(sqlPath, 'utf-8'), entry.when);
    });
}

function readFolderEntries(migrationsDir: string, packageName: string): FunctionMigrationEntry[]
{
    const folders = readdirSync(migrationsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(name => existsSync(join(migrationsDir, name, 'migration.sql')))
        .sort((a, b) => a.localeCompare(b));

    return folders.map(name => toEntry(
        name,
        readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf-8'),
        folderTimestampMillis(name, packageName),
    ));
}

/**
 * Folder names in the drizzle-kit 1.0 layout start with a UTC YYYYMMDDHHMMSS
 * timestamp — the same interpretation drizzle-orm's own migrator uses.
 */
function folderTimestampMillis(name: string, packageName: string): number
{
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name);
    if (!match)
    {
        throw new Error(`${packageName}: migration folder name must start with a YYYYMMDDHHMMSS timestamp: ${name}`);
    }

    const [, year, month, day, hour, minute, second] = match;

    return Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
    );
}

function toEntry(name: string, content: string, millis: number): FunctionMigrationEntry
{
    return {
        name,
        millis,
        hash: createHash('sha256').update(content).digest('hex'),
        statements: content
            .split('--> statement-breakpoint')
            .map(statement => statement.trim())
            .filter(statement => statement.length > 0),
    };
}

function functionMigrationsTable(packageName: string): string
{
    return `__spfn_fn_${packageName.replace('@spfn/', '')}_migrations`;
}

/**
 * Migrate legacy shared __spfn_fn_migrations table to per-package tables.
 *
 * Previous versions used a single shared table for all packages, causing
 * index-based hash conflicts. This copies each package's migration hashes
 * from the legacy table (matched by hash) into per-package tables,
 * then drops the legacy table.
 */
async function migrateLegacyTable(
    db: MigrationDb,
    plans: FunctionMigrationPlan[],
): Promise<void>
{
    const legacyCheck = await db.query(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'drizzle' AND table_name = '__spfn_fn_migrations'
        ) AS "exists"`,
    );

    if (!legacyCheck[0]?.exists)
    {
        return;
    }

    console.log(chalk.dim('\n  Migrating legacy shared migration table to per-package tables...'));

    const legacyRows = await db.query(
        `SELECT hash, created_at FROM drizzle."__spfn_fn_migrations" ORDER BY id`,
    ) as { hash: string; created_at: string }[];

    if (legacyRows.length === 0)
    {
        await db.query(`DROP TABLE drizzle."__spfn_fn_migrations"`);

        return;
    }

    const legacyHashes = new Set(legacyRows.map(row => row.hash));

    for (const plan of plans)
    {
        const tableName = functionMigrationsTable(plan.packageName);

        await ensureMigrationsTable(db, tableName);

        // Skip packages that already have per-package records
        const existing = await db.query(
            `SELECT COUNT(*) AS "count" FROM drizzle."${tableName}"`,
        );

        if (Number(existing[0]?.count) > 0)
        {
            continue;
        }

        // The legacy table stores sha256 hashes of migration SQL content, so a
        // hash match identifies which legacy rows belong to this package.
        let copied = 0;
        for (const entry of plan.entries)
        {
            if (!legacyHashes.has(entry.hash))
            {
                continue;
            }

            await db.query(
                `INSERT INTO drizzle."${tableName}" (hash, created_at) VALUES ($1, $2)`,
                [entry.hash, entry.millis],
            );
            copied++;
        }

        if (copied > 0)
        {
            console.log(chalk.dim(`    ✓ ${plan.packageName}: copied ${copied} migration record(s)`));
        }
    }

    await db.query(`DROP TABLE drizzle."__spfn_fn_migrations"`);
    console.log(chalk.dim('    ✓ Legacy migration table removed\n'));
}

async function ensureMigrationsTable(db: MigrationDb, tableName: string): Promise<void>
{
    await db.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await db.query(
        `CREATE TABLE IF NOT EXISTS drizzle."${tableName}" (
            id serial PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
        )`,
    );
}

/**
 * Apply one package's pending migrations inside a transaction.
 *
 * Pending = entries newer than the last applied record — the same
 * timestamp-based rule drizzle-orm ≤0.45 used for these tables, so databases
 * migrated by earlier CLI versions continue seamlessly.
 */
export async function applyFunctionMigrationPlan(
    db: MigrationDb,
    plan: FunctionMigrationPlan,
): Promise<number>
{
    const tableName = functionMigrationsTable(plan.packageName);

    await ensureMigrationsTable(db, tableName);

    const rows = await db.query(
        `SELECT created_at FROM drizzle."${tableName}" ORDER BY created_at DESC LIMIT 1`,
    );
    const lastMillis = rows.length > 0 ? Number(rows[0]?.created_at) : Number.NEGATIVE_INFINITY;
    const pending = plan.entries.filter(entry => entry.millis > lastMillis);

    if (pending.length === 0)
    {
        return 0;
    }

    await db.transaction(async tx =>
    {
        for (const entry of pending)
        {
            for (const statement of entry.statements)
            {
                await tx.query(statement);
            }

            await tx.query(
                `INSERT INTO drizzle."${tableName}" (hash, created_at) VALUES ($1, $2)`,
                [entry.hash, entry.millis],
            );
        }
    });

    return pending.length;
}

function createPostgresJsMigrationDb(client: any): MigrationDb
{
    return {
        query: (text, params) => client.unsafe(text, params ?? []),
        transaction: fn => client.begin((tx: any) => fn(createPostgresJsMigrationDb(tx))),
    };
}

/**
 * Execute function package migrations directly (no copying)
 * Returns the number of migrations applied
 */
export async function executeFunctionMigrations(
    plans: FunctionMigrationPlan[],
): Promise<number>
{
    const postgres = await import('postgres');

    loadEnv();
    if (!env.DATABASE_URL)
    {
        throw new Error('DATABASE_URL not found in environment');
    }

    const connection = postgres.default(env.DATABASE_URL, { max: 1 });
    const db = createPostgresJsMigrationDb(connection);
    let appliedCount = 0;

    try
    {
        // Migrate legacy shared table to per-package tables (one-time)
        await migrateLegacyTable(db, plans);

        for (const plan of plans)
        {
            console.log(chalk.blue(`\n  📦 Running ${plan.packageName} migrations...`));

            const applied = await applyFunctionMigrationPlan(db, plan);

            console.log(applied > 0
                ? chalk.green(`  ✓ ${plan.packageName}: ${applied} migration(s) applied`)
                : chalk.dim(`  – ${plan.packageName}: up to date`));
            appliedCount += applied;
        }
    }
    finally
    {
        await connection.end();
    }

    return appliedCount;
}
