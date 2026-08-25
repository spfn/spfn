/**
 * `spfn add vercel` — scaffold the Vercel serverless target
 *
 * Generates the three artifacts a Next.js + SPFN app needs to deploy the Hono API
 * as Vercel Functions (the runtime lives in `@spfn/core/server`'s
 * `createServerlessApp()`):
 *
 *   1. src/app/api/backend/[[...route]]/route.ts — hono/vercel adapter
 *   2. vercel.json — build with `spfn:build`
 *   3. .npmrc — which registry the @spfn scope resolves to. No credential: pnpm 10
 *      and later refuse to expand an environment variable in a registry credential
 *      that came from a project .npmrc, so the token goes in Vercel's NPM_RC
 *      environment variable instead (see registryEnvValue below).
 *
 * Existing files are never overwritten — they are reported and skipped.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
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
        description: 'points the @spfn scope at the private registry (no credential)',
    },
];

/**
 * The value Vercel's `NPM_RC` environment variable has to carry.
 *
 * Vercel writes that variable into the build container's *user-level* `~/.npmrc`,
 * and pnpm still expands environment variables there — it only refuses to do so
 * for a credential that came from a project `.npmrc`, because that file is
 * committed and a hostile edit could redirect the secret. So the registry mapping
 * stays in the project file and the credential lives here.
 *
 * The scope lines are read from the template rather than repeated, because two
 * copies of a registry mapping drift and the failure is silent: a scope that
 * resolves to the public registry installs whatever happens to carry that name.
 *
 * `registry=` names the public registry explicitly. `NPM_RC` replaces the whole
 * user-level file, and Vercel installs its own runtimes from npmjs.
 */
export function registryEnvValue(templatesDir: string): string
{
    const scopeLines = readFileSync(join(templatesDir, 'npmrc'), 'utf8').trim();
    const registryUrl = scopeLines.split('\n')[0].split('=')[1];
    // npm and pnpm match a stored credential against the registry URI as
    // written, and `//host/npm` does not match a registry of `//host/npm/`.
    const authKey = `${registryUrl.replace(/^https?:/, '').replace(/\/*$/, '/')}:_authToken`;

    return [
        'registry=https://registry.npmjs.org/',
        scopeLines,
        `${authKey}=\${GITEA_NPM_TOKEN}`,
        `${authKey.replace(':_authToken', '')}:always-auth=true`,
    ].join('\n');
}

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
    console.log(chalk.gray('       NPM_RC            — the block below, verbatim. Vercel writes it to the'));
    console.log(chalk.gray('                           build container\'s ~/.npmrc, which is the only place'));
    console.log(chalk.gray('                           pnpm 10+ still expands a token from the environment:'));
    console.log();
    console.log(registryEnvValue(templatesDir).split('\n').map(line => `         ${line}`).join('\n'));
    console.log();
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
