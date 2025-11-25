import chalk from 'chalk';
import { runWithSpinner, validateDatabasePrerequisites } from './utils/drizzle.js';
import { dbBackup } from './backup.js';

import "@spfn/core/config";

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

    // First, execute function package migrations
    const { discoverFunctionMigrations, executeFunctionMigrations } = await import('../../utils/function-migrations.js');

    const functions = discoverFunctionMigrations(process.cwd());
    if (functions.length > 0)
    {
        console.log(chalk.blue('📦 Applying function package migrations:'));
        functions.forEach(func =>
        {
            console.log(chalk.dim(`  - ${func.packageName}`));
        });

        try
        {
            await executeFunctionMigrations(functions);
            console.log(chalk.green('✅ Function migrations applied\n'));
        }
        catch (error)
        {
            console.error(chalk.red('\n❌ Failed to apply function migrations'));
            console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
            process.exit(1);
        }
    }

    // Then, run project migrations
    await runWithSpinner(
        'Running project migrations...',
        'migrate',
        'Project migrations applied successfully',
        'Failed to run project migrations'
    );
}