/**
 * `spfn provision` — deploy-time infrastructure provisioning
 *
 * Loads the app's server.config and runs `provisionInfrastructure()` from
 * `@spfn/core/server`: DB init + the config's provisioning lifecycle hooks
 * (`beforeInfrastructure` / `afterInfrastructure`, e.g. admin seeding + RBAC init).
 *
 * Run this ONCE per deploy — from a build step or deploy hook — instead of paying
 * the seed/RBAC cost on every serverless cold start or pod restart. Always-on
 * targets call it before `spfn start`; serverless targets call it from the
 * build/deploy pipeline.
 *
 * Migrations are NOT run here — run `spfn db migrate` (against the direct,
 * non-pooler connection) before provisioning.
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { execa } from 'execa';
import { logger } from '../utils/logger.js';
import { detectPackageManager } from '../utils/package-manager.js';
import { resolveKeychainEnv } from '../utils/secret-store/index.js';

// Same discovery order as startServer() (built output first, then source)
const CONFIG_FILE_PATHS = [
    '.spfn/server/server.config.mjs',
    '.spfn/server/server.config.js',
    'src/server/server.config.ts',
    'src/server/server.config.js',
] as const;

function findServerConfig(cwd: string): string | undefined
{
    return CONFIG_FILE_PATHS.map((path) => join(cwd, path)).find(existsSync);
}

export const provisionCommand = new Command('provision')
    .description('Run deploy-time provisioning (seed/RBAC lifecycle hooks) — once per deploy, not per cold start')
    .action(async () =>
    {
        if (!process.env.NODE_ENV)
        {
            process.env.NODE_ENV = 'production';
        }

        const cwd = process.cwd();
        const configPath = findServerConfig(cwd);

        if (!configPath)
        {
            logger.error('server.config not found.');
            logger.info(`Looked for: ${CONFIG_FILE_PATHS.join(', ')}`);
            logger.info('Run "spfn init" first, or run this command from the app root.');
            process.exit(1);
        }

        // Mirror dev.ts: resolve secret:keychain: refs from .env.server so local runs
        // get real values; CI/deploy environments have plain env and resolve nothing.
        const { env: keychainEnv, missing: keychainMissing } = await resolveKeychainEnv(cwd);

        if (Object.keys(keychainEnv).length > 0)
        {
            logger.info(`[SPFN] Injecting ${Object.keys(keychainEnv).length} secret(s) from the keychain`);
        }

        if (keychainMissing.length > 0)
        {
            logger.warn(`[SPFN] Could not resolve keychain secret(s): ${keychainMissing.join(', ')} — run \`spfn secret set <KEY>\``);
        }

        // Temp runner spawned via tsx so a TS server.config and its path aliases
        // (@/server/...) resolve the same way `spfn dev` resolves them.
        const tempDir = join(cwd, '.spfn');
        const runnerEntry = join(tempDir, 'provision.mjs');

        mkdirSync(tempDir, { recursive: true });

        writeFileSync(runnerEntry, `
if (!process.env.NODE_ENV)
{
    process.env.NODE_ENV = 'production';
}

// The Vercel Supabase integration injects POSTGRES_URL but not DATABASE_URL,
// which is what SPFN reads. Map it so build-step provisioning connects too.
process.env.DATABASE_URL ??= process.env.POSTGRES_URL;

// Load environment variables FIRST (before any imports that depend on them)
await import('@spfn/core/config');

const { provisionInfrastructure } = await import('@spfn/core/server');

const config = (await import(${JSON.stringify(pathToFileURL(configPath).href)})).default;

await provisionInfrastructure(config);

// provisionInfrastructure leaves the DB pool open — exit explicitly.
process.exit(0);
`);

        logger.info(`[SPFN] Provisioning with config: ${configPath.replace(cwd + '/', '')}\n`);

        const pm = detectPackageManager(cwd);
        const runnerCmd = pm === 'npm' ? 'npx' : pm;
        const runnerArgs = pm === 'npm'
            ? ['tsx', runnerEntry]
            : ['exec', 'tsx', runnerEntry];

        const result = await execa(runnerCmd, runnerArgs, {
            cwd,
            stdio: 'inherit',
            reject: false,
            env: { ...process.env, ...keychainEnv },
        });

        if (result.exitCode !== 0)
        {
            logger.error(`Provisioning failed (exit code ${result.exitCode})`);
            process.exit(result.exitCode ?? 1);
        }

        logger.info('[SPFN] Provisioning complete');
    });
