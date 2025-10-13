/**
 * Database management commands
 * Wraps Drizzle Kit with auto-generated config
 */

import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import ora from 'ora';

const execAsync = promisify(exec);

/**
 * Generate temporary drizzle.config.ts and run command
 */
async function runDrizzleCommand(command: string): Promise<void>
{
    const hasUserConfig = existsSync('./drizzle.config.ts');
    const tempConfigPath = `./drizzle.config.${process.pid}.${Date.now()}.temp.ts`;

    try
    {
        // Use user's config if exists, otherwise generate temp config
        const configPath = hasUserConfig ? './drizzle.config.ts' : tempConfigPath;

        if (!hasUserConfig)
        {
            // Check if DATABASE_URL exists
            if (!process.env.DATABASE_URL)
            {
                console.error(chalk.red('❌ DATABASE_URL not found in environment'));
                console.log(chalk.yellow('\n💡 Tip: Add DATABASE_URL to your .env file'));
                process.exit(1);
            }

            // Generate temporary config
            const { generateDrizzleConfigFile } = await import('@spfn/core');
            const configContent = generateDrizzleConfigFile();

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
 * Generate database migrations
 */
export async function dbGenerate(): Promise<void>
{
    const spinner = ora('Generating database migrations...').start();

    try
    {
        spinner.stop();
        await runDrizzleCommand('generate');
        console.log(chalk.green('✅ Migrations generated successfully'));
    }
    catch (error)
    {
        spinner.fail('Failed to generate migrations');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Push database schema changes
 */
export async function dbPush(): Promise<void>
{
    const spinner = ora('Pushing schema changes to database...').start();

    try
    {
        spinner.stop();
        await runDrizzleCommand('push');
        console.log(chalk.green('✅ Schema pushed successfully'));
    }
    catch (error)
    {
        spinner.fail('Failed to push schema');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Run database migrations
 */
export async function dbMigrate(): Promise<void>
{
    const spinner = ora('Running database migrations...').start();

    try
    {
        spinner.stop();
        await runDrizzleCommand('migrate');
        console.log(chalk.green('✅ Migrations applied successfully'));
    }
    catch (error)
    {
        spinner.fail('Failed to run migrations');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Open Drizzle Studio
 */
export async function dbStudio(port: number = 4983): Promise<void>
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
export async function dbDrop(): Promise<void>
{
    console.log(chalk.yellow('⚠️  WARNING: This will drop all tables in your database!'));

    // TODO: Add confirmation prompt
    const spinner = ora('Dropping all tables...').start();

    try
    {
        spinner.stop();
        await runDrizzleCommand('drop');
        console.log(chalk.green('✅ All tables dropped'));
    }
    catch (error)
    {
        spinner.fail('Failed to drop tables');
        console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
        process.exit(1);
    }
}

/**
 * Check database connection
 */
export async function dbCheck(): Promise<void>
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
