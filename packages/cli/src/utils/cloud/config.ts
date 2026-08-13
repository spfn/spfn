/**
 * Non-secret cloud link state for `spfn cloud`.
 *
 * `.spfn/cloud.json` holds only identifiers (project ids, org slug, region) — never
 * tokens or keys, which live in the OS keychain. The file is gitignored because the
 * identifiers are per-student account state, not app source.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { ensureGitignored } from '../env-file.js';

export interface CloudConfig
{
    vercel?: {
        projectId: string;
        projectName: string;
        teamId?: string;
    };
    supabase?: {
        projectRef: string;
        projectName: string;
        orgSlug: string;
        region?: string;
    };
    keepalive?: {
        path: string;
        schedule: string;
    };
}

const CONFIG_REL_PATH = join('.spfn', 'cloud.json');

export function cloudConfigPath(cwd: string): string
{
    return join(cwd, CONFIG_REL_PATH);
}

export function readCloudConfig(cwd: string): CloudConfig
{
    const path = cloudConfigPath(cwd);

    if (!existsSync(path))
    {
        return {};
    }

    try
    {
        return JSON.parse(readFileSync(path, 'utf-8')) as CloudConfig;
    }
    catch
    {
        throw new Error(`${path} is not valid JSON — delete it and run \`spfn cloud link\` again.`);
    }
}

export function writeCloudConfig(cwd: string, config: CloudConfig): void
{
    const path = cloudConfigPath(cwd);

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(config, null, 4) + '\n', 'utf-8');
    ensureGitignored(cwd, [{ pattern: '.spfn/cloud.json', comment: 'spfn cloud link state (per-user accounts)' }]);
}

/** Fail with a consistent message when a command needs a link that does not exist yet. */
export function requireLinked<K extends 'vercel' | 'supabase'>(config: CloudConfig, provider: K): NonNullable<CloudConfig[K]>
{
    const linked = config[provider];

    if (!linked)
    {
        throw new Error(`No ${provider} project is linked. Run \`spfn cloud link\` first.`);
    }

    return linked;
}
