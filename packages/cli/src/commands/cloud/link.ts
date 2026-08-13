/**
 * `spfn cloud link` — one-time account/project connection.
 *
 * Collects a Vercel access token and a Supabase personal access token (hidden
 * prompt, `VERCEL_TOKEN` / `SUPABASE_ACCESS_TOKEN` env, or a token already in the
 * keychain from an earlier link — never a CLI flag, which would land in shell
 * history), validates each against its API, stores them in the OS keychain, and
 * records the chosen project identifiers in `.spfn/cloud.json`. Project choice is
 * a prompt, or `--vercel-project` / `--supabase-project` for non-interactive runs.
 * Token values never appear in output.
 */

import { basename } from 'path';
import prompts from 'prompts';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { storeCloudToken, getCloudToken, deleteCloudToken, type CloudProvider } from '../../utils/cloud/tokens.js';
import { readCloudConfig, writeCloudConfig, cloudConfigPath } from '../../utils/cloud/config.js';
import { getVercelUser, listVercelProjects } from '../../utils/cloud/vercel-api.js';
import { listSupabaseOrganizations, listSupabaseProjects, type SupabaseProject } from '../../utils/cloud/supabase-api.js';

export interface LinkOptions
{
    vercelProject?: string;
    supabaseProject?: string;
    replace?: boolean;
}

export async function cloudLink(options: LinkOptions): Promise<void>
{
    const cwd = process.cwd();
    const config = readCloudConfig(cwd);

    try
    {
        if (options.replace)
        {
            await deleteCloudToken('vercel');
            await deleteCloudToken('supabase');
            logger.info('Stored tokens discarded — you will be asked for fresh ones.');
        }

        // Persist after each provider: a Supabase failure must not throw away a
        // Vercel link the user just watched succeed.
        await linkVercel(config, cwd, options);
        writeCloudConfig(cwd, config);
        await linkSupabase(config, options);
        writeCloudConfig(cwd, config);
    }
    catch (error)
    {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    logger.success(`Link state saved to ${chalk.cyan(cloudConfigPath(cwd))} (identifiers only — tokens stay in the keychain).`);
    logger.info('Next: `spfn cloud status` for limits vs usage, `spfn cloud env pull` for project keys.');
}

async function linkVercel(config: { vercel?: { projectId: string; projectName: string } }, cwd: string, options: LinkOptions): Promise<void>
{
    const token = await obtainToken('vercel', 'Vercel access token', 'VERCEL_TOKEN', 'https://vercel.com/account/settings/tokens');
    const user = await getVercelUser(token);

    logger.success(`Vercel token verified (account: ${user.user.username}).`);
    await storeCloudToken('vercel', token);

    const projects = await listVercelProjects(token);

    if (projects.length === 0)
    {
        logger.warn('No Vercel projects found — deploy once, then re-run `spfn cloud link`.');

        return;
    }

    let projectId: string | undefined;

    if (options.vercelProject)
    {
        projectId = projects.find(p => p.name === options.vercelProject || p.id === options.vercelProject)?.id;

        if (!projectId)
        {
            throw new Error(`No Vercel project named "${options.vercelProject}" — available: ${projects.map(p => p.name).join(', ')}.`);
        }
    }
    else
    {
        const defaultIndex = Math.max(0, projects.findIndex(p => p.name === basename(cwd)));
        ({ projectId } = await prompts({
            type: 'select',
            name: 'projectId',
            message: 'Which Vercel project is this app?',
            initial: defaultIndex,
            choices: projects.map(p => ({ title: p.name, value: p.id })),
        }));
    }

    if (!projectId)
    {
        throw new Error('Cancelled — no Vercel project selected.');
    }

    const project = projects.find(p => p.id === projectId)!;
    config.vercel = { projectId: project.id, projectName: project.name };
    logger.success(`Vercel project linked: ${project.name}`);
}

async function linkSupabase(config: { supabase?: { projectRef: string; projectName: string; orgSlug: string; region?: string } }, options: LinkOptions): Promise<void>
{
    const token = await obtainToken('supabase', 'Supabase personal access token', 'SUPABASE_ACCESS_TOKEN', 'https://supabase.com/dashboard/account/tokens');
    const orgs = await listSupabaseOrganizations(token);

    logger.success(`Supabase token verified (${orgs.length} organization${orgs.length === 1 ? '' : 's'}).`);
    await storeCloudToken('supabase', token);

    const projects = await listSupabaseProjects(token);

    if (projects.length === 0)
    {
        logger.warn('No Supabase projects found — create one, then re-run `spfn cloud link`.');

        return;
    }

    let ref: string | undefined;

    if (options.supabaseProject)
    {
        const match = projects.find(p => projectRef(p) === options.supabaseProject || p.name === options.supabaseProject);

        if (!match)
        {
            throw new Error(`No Supabase project "${options.supabaseProject}" — available: ${projects.map(p => p.name).join(', ')}.`);
        }

        ref = projectRef(match);
    }
    else
    {
        ({ ref } = await prompts({
            type: 'select',
            name: 'ref',
            message: 'Which Supabase project is this app?',
            choices: projects.map(p => ({ title: `${p.name} (${p.region}, ${p.status})`, value: projectRef(p) })),
        }));
    }

    if (!ref)
    {
        throw new Error('Cancelled — no Supabase project selected.');
    }

    const project = projects.find(p => projectRef(p) === ref)!;
    const org = orgs.find(o => o.id === project.organization_id);

    config.supabase = {
        projectRef: ref,
        projectName: project.name,
        orgSlug: org?.slug ?? project.organization_id,
        region: project.region,
    };
}

/** The Management API names a project's ref `id`; keep one accessor in case that drifts. */
function projectRef(project: SupabaseProject): string
{
    return project.ref ?? project.id;
}

async function obtainToken(provider: CloudProvider, label: string, envVar: string, createUrl: string): Promise<string>
{
    const fromEnv = process.env[envVar];

    if (fromEnv)
    {
        logger.info(`Using ${label} from ${envVar} (value not shown).`);

        return fromEnv;
    }

    const fromKeychain = await getCloudToken(provider);

    if (fromKeychain)
    {
        logger.info(`Using the ${label} already in the keychain (value not shown). To enter a new one, run \`spfn cloud link --replace\`.`);

        return fromKeychain;
    }

    logger.info(`Create one at ${chalk.cyan(createUrl)} if you don't have it yet.`);

    const { token } = await prompts({
        type: 'password',
        name: 'token',
        message: label,
    });

    if (!token)
    {
        throw new Error(`Cancelled — no ${label} entered.`);
    }

    return token;
}
