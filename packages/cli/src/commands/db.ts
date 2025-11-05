/**
 * Database Management Commands
 *
 * Wraps Drizzle Kit commands with auto-generated config
 */

import { Command } from 'commander';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';
import prompts from 'prompts';

const execAsync = promisify(exec);

/**
 * Generate temporary drizzle.config.ts and run drizzle-kit command
 */
async function runDrizzleCommand(command: string): Promise<void>
{
    // Load environment variables first
    const { loadEnvironment } = await import('@spfn/core/env');
    loadEnvironment({ debug: false });

    const hasUserConfig = existsSync('./drizzle.config.ts');
    const tempConfigPath = `./drizzle.config.${process.pid}.${Date.now()}.temp.ts`;

    try
    {
        const configPath = hasUserConfig ? './drizzle.config.ts' : tempConfigPath;

        if (!hasUserConfig)
        {
            if (!process.env.DATABASE_URL)
            {
                console.error(chalk.red('❌ DATABASE_URL not found in environment'));
                console.log(chalk.yellow('\n💡 Tip: Add DATABASE_URL to your .env file'));
                process.exit(1);
            }

            // Generate temporary config
            const { generateDrizzleConfigFile } = await import('@spfn/core/db');
            const configContent = generateDrizzleConfigFile({
                cwd: process.cwd(),
                // Exclude package schemas to avoid .ts/.js mixing (packages use migrations instead)
                disablePackageDiscovery: true
            });

            writeFileSync(tempConfigPath, configContent);
            console.log(chalk.dim('Using auto-generated Drizzle config\n'));
        }

        // Run drizzle-kit command
        const fullCommand = `drizzle-kit ${command} --config=${configPath}`;
        const { stdout, stderr } = await execAsync(fullCommand);

        if (stdout)
        {
            console.log(stdout);
        }

        if (stderr)
        {
            console.error(stderr);
        }
    }
    finally
    {
        // Clean up temp config
        if (!hasUserConfig && existsSync(tempConfigPath))
        {
            unlinkSync(tempConfigPath);
        }
    }
}

/**
 * Helper: Run drizzle command with spinner
 */
async function runWithSpinner(
    spinnerText: string,
    command: string,
    successMessage: string,
    failMessage: string
): Promise<void>
{
    const spinner = ora(spinnerText).start();

    try
    {
        spinner.stop();
        await runDrizzleCommand(command);
        console.log(chalk.green(`✅ ${successMessage}`));
    }
    catch (error)
    {
        spinner.fail(failMessage);
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Generate database migrations from schema changes
 */
async function dbGenerate(): Promise<void>
{
    await runWithSpinner(
        'Generating database migrations...',
        'generate',
        'Migrations generated successfully',
        'Failed to generate migrations'
    );
}

/**
 * Push schema changes directly to database (no migrations)
 * Also applies function package migrations if available
 */
async function dbPush(): Promise<void>
{
    // Load environment variables first (required for DATABASE_URL)
    const { loadEnvironment } = await import('@spfn/core/env');
    loadEnvironment({ debug: false });

    // First, push schema changes
    await runWithSpinner(
        'Pushing schema changes to database...',
        'push',
        'Schema pushed successfully',
        'Failed to push schema'
    );

    // Then, execute function package migrations
    const { discoverFunctionMigrations, executeFunctionMigrations } = await import('../utils/function-migrations.js');

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

/**
 * Run pending migrations
 *
 * This command applies migrations created by `spfn db generate`.
 * Also applies function package migrations if available.
 * Use this in both development and production environments.
 */
async function dbMigrate(): Promise<void>
{
    // Load environment variables first (required for DATABASE_URL)
    const { loadEnvironment } = await import('@spfn/core/env');
    loadEnvironment({ debug: false });

    // First, execute function package migrations
    const { discoverFunctionMigrations, executeFunctionMigrations } = await import('../utils/function-migrations.js');

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

/**
 * Open Drizzle Studio (database GUI)
 */
async function dbStudio(port: number = 4983): Promise<void>
{
    console.log(chalk.blue('🎨 Opening Drizzle Studio...\n'));

    try
    {
        await runDrizzleCommand(`studio --port ${port}`);
    }
    catch (error)
    {
        console.error(chalk.red('❌ Failed to start Drizzle Studio'));
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Drop all database tables (dangerous!)
 */
async function dbDrop(): Promise<void>
{
    console.log(chalk.yellow('⚠️  WARNING: This will drop all tables in your database!'));

    // Confirmation prompt
    const { confirm } = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to drop all tables?',
        initial: false,
    });

    if (!confirm)
    {
        console.log(chalk.gray('Cancelled.'));
        process.exit(0);
    }

    await runWithSpinner(
        'Dropping all tables...',
        'drop',
        'All tables dropped',
        'Failed to drop tables'
    );
}

/**
 * Check database connection
 */
async function dbCheck(): Promise<void>
{
    const spinner = ora('Checking database connection...').start();

    try
    {
        await runDrizzleCommand('check');
        spinner.succeed('Database connection OK');
    }
    catch (error)
    {
        spinner.fail('Database connection failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Database command group
 */
export const dbCommand = new Command('db')
    .description('Database management commands (wraps Drizzle Kit)');

dbCommand
    .command('generate')
    .alias('g')
    .description('Generate database migrations from schema changes')
    .action(dbGenerate);

dbCommand
    .command('push')
    .description('Push schema changes directly to database (no migrations)')
    .action(dbPush);

dbCommand
    .command('migrate')
    .alias('m')
    .description('Run pending migrations')
    .action(dbMigrate);

dbCommand
    .command('studio')
    .description('Open Drizzle Studio (database GUI)')
    .option('-p, --port <port>', 'Studio port', '4983')
    .action((options) => dbStudio(Number(options.port)));

dbCommand
    .command('drop')
    .description('Drop all database tables (⚠️  dangerous!)')
    .action(dbDrop);

dbCommand
    .command('check')
    .description('Check database connection')
    .action(dbCheck);