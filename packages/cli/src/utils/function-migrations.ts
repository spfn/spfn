/**
 * Function Package Migration Discovery
 *
 * Discovers and manages migrations from SPFN function packages (e.g., @spfn/cms)
 */

import chalk from 'chalk';
import { join } from 'path';

import { env } from "@spfn/core/config";
import { loadEnvFiles } from "@spfn/core/server";
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
                    chalk.yellow(`⚠️  Package @spfn/${pkg} specifies migrations but directory not found: ${migrationsDir}`)
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
 * Execute function package migrations directly (no copying)
 * Returns the number of migrations executed
 */
export async function executeFunctionMigrations(
    functionMigrations: FunctionMigrationInfo[]
): Promise<number>
{
    let executedCount = 0;

    // Import drizzle-orm dynamically
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    const postgres = await import('postgres');

    loadEnvFiles();
    if (!env.DATABASE_URL)
    {
        throw new Error('DATABASE_URL not found in environment');
    }

    const connection = postgres.default(env.DATABASE_URL, { max: 1 });
    const db = drizzle(connection);

    try
    {
        for (const func of functionMigrations)
        {
            console.log(chalk.blue(`\n  📦 Running ${func.packageName} migrations...`));

            // Execute migrations from package directory
            await migrate(db, { migrationsFolder: func.migrationsDir });

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
