/**
 * Function Package Migration Discovery
 *
 * Discovers and manages migrations from SPFN function packages (e.g., @spfn/cms)
 */

import chalk from 'chalk';
import { join } from 'path';

import { env } from '@spfn/core/config';
import { loadEnv } from '@spfn/core/server';
import { existsSync, readdirSync, readFileSync } from 'fs';

export type FunctionMigrationInfo = {
    packageName: string;
    migrationsDir: string;
    packagePath: string;
};

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
 * Migrate legacy shared __spfn_fn_migrations table to per-package tables.
 *
 * Previous versions used a single shared table for all packages, causing
 * index-based hash conflicts. This copies each package's migration hashes
 * from the legacy table (matched by journal) into per-package tables,
 * then drops the legacy table.
 */
async function migrateLegacyTable(
    db: any,
    functionMigrations: FunctionMigrationInfo[],
): Promise<void>
{
    // Check if legacy table exists
    const legacyCheck = await db.execute(
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

    // Read all legacy records ordered by id
    const legacyRows: { hash: string; created_at: string }[] = await db.execute(
        `SELECT hash, created_at FROM drizzle."__spfn_fn_migrations" ORDER BY id`,
    );

    if (legacyRows.length === 0)
    {
        await db.execute(`DROP TABLE drizzle."__spfn_fn_migrations"`);

        return;
    }

    // For each package, read its journal and match hashes by index
    for (const func of functionMigrations)
    {
        const journalPath = join(func.migrationsDir, 'meta', '_journal.json');
        if (!existsSync(journalPath))
        {
            continue;
        }

        const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
        const entries: { idx: number; tag: string; when: number }[] = journal.entries || [];

        const tableName = `__spfn_fn_${func.packageName.replace('@spfn/', '')}_migrations`;

        // Create per-package table if not exists
        await db.execute(
            `CREATE SCHEMA IF NOT EXISTS drizzle`,
        );
        await db.execute(
            `CREATE TABLE IF NOT EXISTS drizzle."${tableName}" (
                id serial PRIMARY KEY,
                hash text NOT NULL,
                created_at bigint
            )`,
        );

        // Check if already has records (skip if so)
        const existing = await db.execute(
            `SELECT COUNT(*) AS "count" FROM drizzle."${tableName}"`,
        );

        if (Number(existing[0]?.count) > 0)
        {
            continue;
        }

        // Match: legacy rows were inserted in order by the first package (auth)
        // that ran. Each package's journal entries correspond to legacy rows
        // only if the hash matches. We need to find which legacy hashes
        // belong to this package by reading migration SQL files and computing hashes.
        //
        // Simpler approach: copy ALL legacy hashes into each package table.
        // drizzle's migrate() compares by hash, not index.
        // If a hash doesn't match the journal, it's ignored.
        // If it does match, it prevents re-execution.
        //
        // Actually drizzle uses hash from the SQL file content, and the legacy
        // table stores those hashes. The simplest correct approach:
        // compute each package's migration file hashes and check if they exist
        // in the legacy table.

        const { createHash } = await import('crypto');
        let copied = 0;

        for (const entry of entries)
        {
            const sqlPath = join(func.migrationsDir, `${entry.tag}.sql`);
            if (!existsSync(sqlPath))
            {
                continue;
            }

            const sqlContent = readFileSync(sqlPath, 'utf-8');
            const hash = createHash('sha256').update(sqlContent).digest('hex');

            // Check if this hash exists in legacy table
            const found = legacyRows.find(r => r.hash === hash);
            if (found)
            {
                await db.execute(
                    `INSERT INTO drizzle."${tableName}" (hash, created_at) VALUES ('${hash}', ${entry.when})`,
                );
                copied++;
            }
        }

        if (copied > 0)
        {
            console.log(chalk.dim(`    ✓ ${func.packageName}: copied ${copied} migration record(s)`));
        }
    }

    // Drop legacy table
    await db.execute(`DROP TABLE drizzle."__spfn_fn_migrations"`);
    console.log(chalk.dim('    ✓ Legacy migration table removed\n'));
}

/**
 * Execute function package migrations directly (no copying)
 * Returns the number of migrations executed
 */
export async function executeFunctionMigrations(
    functionMigrations: FunctionMigrationInfo[],
): Promise<number>
{
    let executedCount = 0;

    // Import drizzle-orm dynamically
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const postgres = await import('postgres');

    loadEnv();
    if (!env.DATABASE_URL)
    {
        throw new Error('DATABASE_URL not found in environment');
    }

    const connection = postgres.default(env.DATABASE_URL, { max: 1 });
    const db = drizzle({ client: connection });

    try
    {
        // Migrate legacy shared table to per-package tables (one-time)
        await migrateLegacyTable(db, functionMigrations);

        for (const func of functionMigrations)
        {
            console.log(chalk.blue(`\n  📦 Running ${func.packageName} migrations...`));

            // Execute migrations from package directory
            // Each package uses its own table to avoid index conflicts between packages
            const tableName = `__spfn_fn_${func.packageName.replace('@spfn/', '')}_migrations`;
            await migrate(db, {
                migrationsFolder: func.migrationsDir,
                migrationsTable: tableName,
            });

            console.log(chalk.green(`  ✓ ${func.packageName} migrations applied`));
            executedCount++;
        }
    }
    finally
    {
        await connection.end();
    }

    return executedCount;
}
