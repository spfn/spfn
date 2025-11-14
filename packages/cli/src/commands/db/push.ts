import chalk from 'chalk';
import { loadEnvironment } from "@spfn/core/env";
import { runWithSpinner } from './utils/drizzle.js';

/**
 * Push schema changes directly to database (no migrations)
 * Also applies function package migrations if available
 */
export async function dbPush(): Promise<void>
{
    // Load environment variables first (required for DATABASE_URL)
    loadEnvironment({ debug: false });

    // First, push schema changes
    await runWithSpinner(
        'Pushing schema changes to database...',
        'push',
        'Schema pushed successfully',
        'Failed to push schema'
    );

    // Then, execute function package migrations
    const { discoverFunctionMigrations, executeFunctionMigrations } = await import('../../utils/function-migrations.js');

    const functions = discoverFunctionMigrations(process.cwd());

    if (functions.length > 0)
    {
        console.log(chalk.blue('\n📦 Applying function package migrations:'));
        functions.forEach(func =>
        {
            console.log(chalk.dim(`  - ${func.packageName}`));
        });

        try
        {
            await executeFunctionMigrations(functions);
            console.log(chalk.green('\n✅ All function migrations applied\n'));
        }
        catch (error)
        {
            console.error(chalk.red('\n❌ Failed to apply function migrations'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    }
}