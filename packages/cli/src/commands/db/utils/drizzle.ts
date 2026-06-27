import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';
import chalk from 'chalk';
import ora from 'ora';

import { env } from '@spfn/core/config';
import { loadEnv } from '@spfn/core/server';

/**
 * Whether to relax TLS certificate verification for the DB connection.
 *
 * Only for explicit local hosts (localhost/127.0.0.1/::1) or an opt-in env
 * (SPFN_DB_INSECURE_TLS=1) — NEVER unconditionally. Disabling verification for a
 * remote/production DATABASE_URL lets a network MITM capture the credentials and
 * tamper with migration traffic.
 */
export function shouldRelaxDbTls(databaseUrl: string | undefined): boolean
{
    if (process.env.SPFN_DB_INSECURE_TLS === '1' || process.env.SPFN_DB_INSECURE_TLS === 'true')
    {
        return true;
    }

    if (!databaseUrl)
    {
        return false;
    }

    try
    {
        const host = new URL(databaseUrl).hostname.replace(/^\[|\]$/g, '');

        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    }
    catch
    {
        return false;
    }
}

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
            autoDetectSchemas: true,
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
            shell: true,
            env: shouldRelaxDbTls(env.DATABASE_URL)
                ? { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
                : { ...process.env },
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
    failMessage: string,
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
 * Check if tsx ESM loader is available.
 *
 * On Node.js 22+, tsx must be loaded via --import tsx at process start
 * (handled by bin/spfn.js). Calling tsx.register() at runtime causes
 * ERR_REQUIRE_CYCLE_MODULE due to CJS/ESM interop issues.
 *
 * This function is kept for backwards compatibility but is now a no-op.
 * The bin entry point handles tsx loader registration via process re-spawn.
 */
async function ensureTsxLoader(): Promise<void>
{
    // No-op: tsx loader is registered at process start via --import tsx
    // See bin/spfn.js for the re-spawn mechanism
}

/**
 * Dynamically import schema files and merge all exports into a single object.
 * Used to build the `imports` parameter for drizzle-kit's `pushSchema()`.
 */
export async function loadSchemaImports(schemaFiles: string[]): Promise<Record<string, unknown>>
{
    // Ensure tsx loader is registered so .ts files can be imported
    const hasTsFiles = schemaFiles.some(f => f.endsWith('.ts'));
    if (hasTsFiles)
    {
        await ensureTsxLoader();
    }

    const imports: Record<string, unknown> = {};

    for (const file of schemaFiles)
    {
        const moduleUrl = pathToFileURL(file).href;
        const mod = await import(moduleUrl);

        for (const [key, value] of Object.entries(mod))
        {
            if (key !== 'default')
            {
                imports[key] = value;
            }
        }
    }

    return imports;
}

/**
 * Create a drizzle-orm PgDatabase instance for pushSchema().
 * Uses `pg` (node-postgres) driver because drizzle-kit's internal adapter
 * expects `execute()` to return `{ rows: [...] }`, which `pg` provides
 * but `postgres.js` does not.
 */
export async function createPushConnection(): Promise<{ db: any; close: () => Promise<void> }>
{
    loadEnv();

    if (!env.DATABASE_URL)
    {
        throw new Error('DATABASE_URL is required');
    }

    const pg = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');

    // Relax TLS verification only for local/opt-in connections — per-connection,
    // not by mutating process.env (which would weaken every TLS client in-process).
    const pool = new pg.default.Pool({
        connectionString: env.DATABASE_URL,
        max: 1,
        ...(shouldRelaxDbTls(env.DATABASE_URL) ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    const db = drizzle(pool);

    return {
        db,
        close: () => pool.end(),
    };
}
