import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

import { env } from "@spfn/core/config";
import { loadEnv } from "@spfn/core/server";

/**
 * Validate prerequisites for database operations
 * Ensures DATABASE_URL is available
 * @throws Error if DATABASE_URL is not found
 */
export function validateDatabasePrerequisites(): void
{
    loadEnv();
    if (!env.DATABASE_URL)
    {
        console.error(chalk.red('❌ DATABASE_URL not found in environment'));
        console.log(chalk.yellow('\n💡 Tip: Add DATABASE_URL to your .env file'));
        throw new Error('DATABASE_URL is required for database operations');
    }
}

/**
 * Generate temporary drizzle.config.ts and run drizzle-kit command
 * Uses spawn to support interactive prompts from drizzle-kit
 */
export async function runDrizzleCommand(command: string): Promise<void>
{
    const hasUserConfig = existsSync('./drizzle.config.ts');
    const tempConfigPath = `./drizzle.config.${process.pid}.${Date.now()}.temp.ts`;

    const configPath = hasUserConfig ? './drizzle.config.ts' : tempConfigPath;

    if (!hasUserConfig)
    {
        loadEnv();
        if (!env.DATABASE_URL)
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
            disablePackageDiscovery: true,
            // Expand globs and auto-detect PostgreSQL schemas for push/generate compatibility
            expandGlobs: true,
            autoDetectSchemas: true
        });

        writeFileSync(tempConfigPath, configContent);
        console.log(chalk.dim('Using auto-generated Drizzle config\n'));
    }

    // Run drizzle-kit command with spawn to support interactive prompts
    const args = command.split(' ');
    args.push(`--config=${configPath}`);

    return new Promise<void>((resolve, reject) =>
    {
        const drizzleProcess = spawn('drizzle-kit', args, {
            stdio: 'inherit', // Allow interactive input
            shell: true
        });

        const cleanup = () =>
        {
            // Clean up temp config
            if (!hasUserConfig && existsSync(tempConfigPath))
            {
                unlinkSync(tempConfigPath);
            }
        };

        drizzleProcess.on('close', (code) =>
        {
            cleanup();
            if (code === 0)
            {
                resolve();
            }
            else
            {
                reject(new Error(`drizzle-kit ${command} exited with code ${code}`));
            }
        });

        drizzleProcess.on('error', (error) =>
        {
            cleanup();
            reject(error);
        });
    });
}

/**
 * Helper: Run drizzle command with spinner
 */
export async function runWithSpinner(
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