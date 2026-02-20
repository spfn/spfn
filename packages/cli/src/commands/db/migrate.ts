import chalk from 'chalk';
import { join } from 'path';
import { existsSync } from 'fs';
import { validateDatabasePrerequisites } from './utils/drizzle.js';
import { dbBackup } from './backup.js';

import { env } from "@spfn/core/config";
import { loadEnv } from "@spfn/core/server";

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

    // Setup DB connection for programmatic migrations
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const postgres = await import('postgres');

    loadEnv();
    if (!env.DATABASE_URL)
    {
        console.error(chalk.red('❌ DATABASE_URL not found in environment'));
        process.exit(1);
    }

    const connection = postgres.default(env.DATABASE_URL, { max: 1 });
    const db = drizzle(connection);

    try
    {
        // First, execute function package migrations
        const { discoverFunctionMigrations } = await import('../../utils/function-migrations.js');

        const functions = discoverFunctionMigrations(process.cwd());
        if (functions.length > 0)
        {
            console.log(chalk.blue('📦 Applying function package migrations:'));
            functions.forEach(func =>
            {
                console.log(chalk.dim(`  - ${func.packageName}`));
            });

            for (const func of functions)
            {
                console.log(chalk.blue(`\n  📦 Running ${func.packageName} migrations...`));
                await migrate(db, { migrationsFolder: func.migrationsDir });
                console.log(chalk.green(`  ✓ ${func.packageName} migrations applied`));
            }

            console.log(chalk.green('✅ Function migrations applied\n'));
        }

        // Then, run project migrations
        const projectMigrationsDir = join(process.cwd(), 'src/server/drizzle');
        if (existsSync(projectMigrationsDir))
        {
            console.log(chalk.blue('📦 Running project migrations...'));
            await migrate(db, { migrationsFolder: projectMigrationsDir });
            console.log(chalk.green('✅ Project migrations applied successfully'));
        }
        else
        {
            console.log(chalk.dim('No project migrations found (src/server/drizzle)'));
        }
    }
    catch (error)
    {
        console.error(chalk.red('\n❌ Failed to apply migrations'));
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
    finally
    {
        await connection.end();
    }
}