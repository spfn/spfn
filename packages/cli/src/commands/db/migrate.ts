import chalk from 'chalk';
import { join } from 'path';
import { existsSync } from 'fs';
import { validateDatabasePrerequisites } from './utils/drizzle.js';
import { dbBackup } from './backup.js';

import { env } from "@spfn/core/config";
import { loadEnv } from "@spfn/core/server";

/**
 * Migration table names - separated to prevent timestamp conflicts
 * between function package migrations and project migrations.
 *
 * drizzle-orm's migrate() uses max(created_at) to skip "already applied" entries.
 * If function packages have newer timestamps than project migrations,
 * project migrations get incorrectly skipped.
 */
const FUNCTION_MIGRATIONS_TABLE = '__spfn_fn_migrations';
const PROJECT_MIGRATIONS_TABLE = '__drizzle_migrations';

/**
 * Run pending migrations
 *
 * This command applies migrations created by `spfn db generate`.
 * Also applies function package migrations if available.
 * Use this in both development and production environments.
 */
export async function dbMigrate(options: { withBackup?: boolean } = {}): Promise<void>
{
    // Validate prerequisites before starting any migrations
    try
    {
        validateDatabasePrerequisites();
    }
    catch (error)
    {
        // Error already logged in validateDatabasePrerequisites
        process.exit(1);
    }

    // Create backup before migration if requested
    if (options.withBackup)
    {
        console.log(chalk.blue('📦 Creating pre-migration backup...\n'));
        await dbBackup({
            format: 'custom',
            tag: 'pre-migration',
            env: process.env.NODE_ENV
        });
        console.log('');
    }

    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const postgres = await import('postgres');

    loadEnv();
    if (!env.DATABASE_URL)
    {
        console.error(chalk.red('❌ DATABASE_URL not found in environment'));
        process.exit(1);
    }

    // First, execute function package migrations
    const { discoverFunctionMigrations } = await import('../../utils/function-migrations.js');
    const functions = discoverFunctionMigrations(process.cwd());

    if (functions.length > 0)
    {
        const fnConn = postgres.default(env.DATABASE_URL, { max: 1 });
        const fnDb = drizzle(fnConn);

        try
        {
            console.log(chalk.blue('📦 Applying function package migrations:'));
            functions.forEach(func =>
            {
                console.log(chalk.dim(`  - ${func.packageName}`));
            });

            for (const func of functions)
            {
                console.log(chalk.blue(`\n  📦 Running ${func.packageName} migrations...`));
                await migrate(fnDb, {
                    migrationsFolder: func.migrationsDir,
                    migrationsTable: FUNCTION_MIGRATIONS_TABLE,
                });
                console.log(chalk.green(`  ✓ ${func.packageName} migrations applied`));
            }

            console.log(chalk.green('✅ Function migrations applied\n'));
        }
        finally
        {
            await fnConn.end();
        }
    }

    // Then, run project migrations (separate table to avoid timestamp conflicts)
    const projectMigrationsDir = join(process.cwd(), 'src/server/drizzle');
    if (existsSync(projectMigrationsDir))
    {
        const projConn = postgres.default(env.DATABASE_URL, { max: 1 });
        const projDb = drizzle(projConn);

        try
        {
            console.log(chalk.blue('📦 Running project migrations...'));
            await migrate(projDb, {
                migrationsFolder: projectMigrationsDir,
                migrationsTable: PROJECT_MIGRATIONS_TABLE,
            });
            console.log(chalk.green('✅ Project migrations applied successfully'));
        }
        finally
        {
            await projConn.end();
        }
    }
    else
    {
        console.log(chalk.dim('No project migrations found (src/server/drizzle)'));
    }
}
