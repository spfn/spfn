/**
 * `spfn cloud keepalive` — keep the Supabase Free project from pausing (~7 idle
 * days pauses it; a few DB requests per day keep it active).
 *
 * Primary path: a Vercel cron in `vercel.json` hitting the SPFN health endpoint.
 * The endpoint only touches the database in detailed mode, so the command points
 * the cron at `?detailed=true` — a plain 200 without a DB query would keep Vercel
 * happy and still let Supabase pause. Hobby allows one cron, at most daily.
 *
 * Fallback (`--github-actions --url <deployed-url>`): a scheduled workflow that
 * curls the same endpoint, for apps not deployed on Vercel cron-compatible plans.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { readCloudConfig, writeCloudConfig } from '../../utils/cloud/config.js';

/** Health path as mounted by `spfn add vercel` (SPFN app under /api/backend). */
const DEFAULT_HEALTH_PATH = '/api/backend/_core/health?detailed=true';
const DEFAULT_SCHEDULE = '0 3 * * *';

interface KeepaliveOptions
{
    path?: string;
    githubActions?: boolean;
    url?: string;
}

export async function cloudKeepalive(options: KeepaliveOptions): Promise<void>
{
    const cwd = process.cwd();
    const healthPath = options.path ?? DEFAULT_HEALTH_PATH;

    if (!healthPath.startsWith('/'))
    {
        logger.error(`--path must start with a slash (got "${healthPath}") — both Vercel crons and the workflow URL treat it as absolute.`);
        process.exit(1);
    }

    if (options.githubActions)
    {
        setupGithubActions(cwd, healthPath, options.url);
    }
    else
    {
        setupVercelCron(cwd, healthPath);
    }

    try
    {
        const config = readCloudConfig(cwd);
        config.keepalive = { path: healthPath, schedule: DEFAULT_SCHEDULE };
        writeCloudConfig(cwd, config);
    }
    catch (error)
    {
        logger.warn(error instanceof Error ? error.message : String(error));
    }

    logger.info('The DB ping needs detailed health checks: keep `healthCheck: { detailed: true }` in your server config.');
}

function setupVercelCron(cwd: string, healthPath: string): void
{
    const vercelJsonPath = join(cwd, 'vercel.json');
    let vercelJson: Record<string, unknown> = {};

    if (existsSync(vercelJsonPath))
    {
        let parsed: unknown;

        try
        {
            parsed = JSON.parse(readFileSync(vercelJsonPath, 'utf-8'));
        }
        catch
        {
            logger.error('vercel.json is not valid JSON (comments and trailing commas are not allowed) — fix it and re-run.');
            process.exit(1);
        }

        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        {
            logger.error('vercel.json does not contain a JSON object — fix it and re-run.');
            process.exit(1);
        }

        vercelJson = parsed as Record<string, unknown>;
    }

    const result = addCron(vercelJson, healthPath);

    if (result === 'exists')
    {
        logger.success(`vercel.json already has a cron for ${healthPath} — nothing to do.`);

        return;
    }

    if (result === 'occupied')
    {
        logger.error('vercel.json already has a cron job, and Vercel Hobby allows only one.');
        logger.info(`Point the existing cron at ${chalk.cyan(healthPath)} yourself, or use \`--github-actions --url <deployed-url>\`.`);
        process.exit(1);
    }

    writeFileSync(vercelJsonPath, JSON.stringify(vercelJson, null, 4) + '\n', 'utf-8');
    logger.success(`vercel.json: daily cron added (${DEFAULT_SCHEDULE} UTC → ${healthPath}). Deploy to activate.`);
    warnIfBackendRouteMissing(cwd);
}

/**
 * Add our cron to a parsed vercel.json. Exported for tests.
 * `exists` — ours is already there; `occupied` — a different cron holds the one
 * Hobby slot; `added` — mutated in place.
 */
export function addCron(vercelJson: Record<string, unknown>, healthPath: string): 'exists' | 'occupied' | 'added'
{
    const crons = Array.isArray(vercelJson.crons) ? vercelJson.crons as { path?: string }[] : [];

    if (crons.some(cron => cron.path === healthPath))
    {
        return 'exists';
    }

    if (crons.length > 0)
    {
        return 'occupied';
    }

    vercelJson.crons = [{ path: healthPath, schedule: DEFAULT_SCHEDULE }];

    return 'added';
}

function setupGithubActions(cwd: string, healthPath: string, url?: string): void
{
    if (!url)
    {
        logger.error('`--github-actions` needs `--url <deployed-url>` — the workflow runs outside your app and must know where it lives.');
        process.exit(1);
    }

    const workflowPath = join(cwd, '.github', 'workflows', 'spfn-keepalive.yml');

    if (existsSync(workflowPath))
    {
        logger.success(`${workflowPath} already exists — nothing to do.`);

        return;
    }

    const base = normalizeDeployUrl(url);

    if (!base)
    {
        logger.error(`--url "${url}" is not a valid URL. Pass the deployed app origin, e.g. https://myapp.vercel.app.`);
        process.exit(1);
    }

    mkdirSync(dirname(workflowPath), { recursive: true });
    writeFileSync(workflowPath, githubWorkflow(new URL(healthPath, base).toString()), 'utf-8');
    logger.success('.github/workflows/spfn-keepalive.yml: daily keep-alive workflow added. Commit and push to activate.');
}

/**
 * Accept what the Vercel dashboard shows: a bare deployment domain without a
 * scheme. Returns an absolute https origin, or null when the input cannot be one —
 * a non-http scheme, a path posing as a host, or a dotless hostname would produce
 * a plausible-looking workflow that curls a host that does not exist.
 * Exported for tests.
 */
export function normalizeDeployUrl(url: string): string | null
{
    // An explicit scheme other than http(s) is a different protocol, not a typo.
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:\/\//i.test(url))
    {
        return null;
    }

    let parsed: URL;

    try
    {
        parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    }
    catch
    {
        return null;
    }

    if (!parsed.hostname.includes('.'))
    {
        return null;
    }

    return parsed.origin + '/';
}

function githubWorkflow(healthUrl: string): string
{
    return `# Keeps the Supabase Free project from pausing: one DB-touching request per day.
# Generated by \`spfn cloud keepalive --github-actions\`.
name: spfn-keepalive

on:
    schedule:
        - cron: '${DEFAULT_SCHEDULE}'
    workflow_dispatch:

jobs:
    ping:
        runs-on: ubuntu-latest
        steps:
            - name: Ping health endpoint (detailed = includes a DB query)
              run: curl --fail --silent --show-error --max-time 30 '${healthUrl}'
`;
}

function warnIfBackendRouteMissing(cwd: string): void
{
    const routePath = join(cwd, 'src', 'app', 'api', 'backend', '[[...route]]', 'route.ts');

    if (!existsSync(routePath))
    {
        logger.warn('src/app/api/backend/[[...route]]/route.ts not found — the cron path answers only after `spfn add vercel`.');
    }
}
