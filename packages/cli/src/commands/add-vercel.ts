/**
 * `spfn add vercel` — scaffold the Vercel serverless target
 *
 * Generates the three artifacts a Next.js + SPFN app needs to deploy the Hono API
 * as Vercel Functions (the runtime lives in `@spfn/core/server`'s
 * `createServerlessApp()`):
 *
 *   1. src/app/api/backend/[[...route]]/route.ts — hono/vercel adapter
 *   2. vercel.json — build with `spfn:build`
 *   3. .npmrc — @spfn registry (token via GITEA_NPM_TOKEN env, never committed)
 *
 * Existing files are never overwritten — they are reported and skipped.
 */

import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import chalk from 'chalk';
import { findTemplatesPath } from './init/utils/templates.js';

interface GeneratedFile
{
    template: string;
    target: string;
    description: string;
}

const FILES: GeneratedFile[] = [
    {
        template: 'route.ts',
        target: join('src', 'app', 'api', 'backend', '[[...route]]', 'route.ts'),
        description: 'hono/vercel adapter (mounts the SPFN app under /api/backend)',
    },
    {
        template: 'vercel.json',
        target: 'vercel.json',
        description: 'Vercel build config (pnpm spfn:build)',
    },
    {
        template: 'npmrc',
        target: '.npmrc',
        description: '@spfn registry auth (reads GITEA_NPM_TOKEN from env)',
    },
];

export async function addVercel(): Promise<void>
{
    console.log(chalk.blue('\n📦 Setting up the Vercel serverless target...\n'));

    const cwd = process.cwd();
    const templatesDir = join(findTemplatesPath(), 'vercel');

    for (const file of FILES)
    {
        const targetPath = join(cwd, file.target);

        if (existsSync(targetPath))
        {
            console.log(chalk.yellow(`⏭️  ${file.target} already exists — skipped (not overwritten)`));
            continue;
        }

        mkdirSync(dirname(targetPath), { recursive: true });
        copyFileSync(join(templatesDir, file.template), targetPath);
        console.log(chalk.green(`✅ ${file.target}`) + chalk.gray(` — ${file.description}`));
    }

    console.log(chalk.green('\n✅ Vercel target ready!\n'));

    console.log(chalk.cyan('📚 Next steps:'));
    console.log(chalk.gray('  1. Make sure `hono` is a direct dependency (hono/vercel must resolve from the app):'));
    console.log(chalk.gray('       pnpm add hono'));
    console.log(chalk.gray('  2. Set Vercel project env vars:'));
    console.log(chalk.gray('       GITEA_NPM_TOKEN   — @spfn registry token (install step)'));
    console.log(chalk.gray('       SPFN_AUTH_*       — auth secrets (same as local .env.server)'));
    console.log(chalk.gray('       SPFN_API_URL      — https://<your-domain>/api/backend (RPC proxy origin)'));
    console.log(chalk.gray('       DATABASE_URL      — set automatically from POSTGRES_URL if you use the'));
    console.log(chalk.gray('                           Vercel Supabase integration (mapped in route.ts)'));
    console.log(chalk.gray('  3. Run migrations against the DIRECT (non-pooler) connection before deploying:'));
    console.log(chalk.gray('       DATABASE_URL=<direct-url> pnpm spfn db migrate'));
    console.log(chalk.gray('  4. Seed/RBAC provisioning runs once per deploy, not per cold start:'));
    console.log(chalk.gray('       pnpm spfn provision   (e.g. from the build step or a deploy hook)'));
    console.log(chalk.gray('  5. Jobs (config.jobs) are NOT processed on serverless — drain the queue from a'));
    console.log(chalk.gray('     scheduled endpoint (Vercel Cron) or run workers on an always-on target.\n'));
}
