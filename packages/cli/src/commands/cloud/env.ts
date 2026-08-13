/**
 * `spfn cloud env pull|push` — move project keys between the providers and the
 * local SPFN env layout without a value ever reaching the terminal.
 *
 * pull: Supabase keys → where each belongs. The anon key and project URL are
 * public by design and land in `.env.local`; the service-role key and (optionally)
 * `DATABASE_URL` go through the keychain path (`storeSecret`), leaving only a
 * `secret:keychain:` reference in `.env.server`.
 *
 * push: local env values → Vercel project env. Values resolve from the local env
 * files and the keychain; everything is sent `encrypted` except `NEXT_PUBLIC_*`.
 * Output reports key names and counts only.
 */

import { join } from 'path';
import prompts from 'prompts';
import chalk from 'chalk';
import { logger } from '../../utils/logger.js';
import { parseEnvFile, upsertEnvVar } from '../../utils/env-file.js';
import { storeSecret } from '../secret/store-value.js';
import { readCloudConfig, requireLinked } from '../../utils/cloud/config.js';
import { requireCloudToken } from '../../utils/cloud/tokens.js';
import { getSupabaseApiKeys, type SupabaseApiKey } from '../../utils/cloud/supabase-api.js';
import { upsertVercelEnvVars, type VercelEnvVar } from '../../utils/cloud/vercel-api.js';
import { KEYCHAIN_REF_PREFIX, resolveKeychainEnv } from '../../utils/secret-store/index.js';

export async function cloudEnvPull(options: { dbUrl?: boolean }): Promise<void>
{
    const cwd = process.cwd();

    try
    {
        const linked = requireLinked(readCloudConfig(cwd), 'supabase');
        const token = await requireCloudToken('supabase');
        const keys = await getSupabaseApiKeys(token, linked.projectRef);

        writePublicValues(cwd, linked.projectRef, keys);
        await storeServiceKey(cwd, keys);

        if (options.dbUrl)
        {
            await storeDatabaseUrl(cwd, linked.projectRef);
        }
    }
    catch (error)
    {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }

    logger.info('Values were written to files/keychain only — none were displayed.');
}

function writePublicValues(cwd: string, projectRef: string, keys: SupabaseApiKey[]): void
{
    const envLocalPath = join(cwd, '.env.local');

    upsertEnvVar(envLocalPath, 'NEXT_PUBLIC_SUPABASE_URL', `https://${projectRef}.supabase.co`);
    logger.success('NEXT_PUBLIC_SUPABASE_URL → .env.local');

    const anon = findKey(keys, ['anon', 'publishable']);

    if (anon)
    {
        upsertEnvVar(envLocalPath, 'NEXT_PUBLIC_SUPABASE_ANON_KEY', anon.api_key);
        logger.success(`NEXT_PUBLIC_SUPABASE_ANON_KEY → .env.local (from "${anon.name}"; public by design)`);
    }
    else
    {
        logger.warn('No anon/publishable key found on the project — skipped NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    }
}

async function storeServiceKey(cwd: string, keys: SupabaseApiKey[]): Promise<void>
{
    const service = findKey(keys, ['service_role', 'secret']);

    if (!service)
    {
        logger.warn('No service_role/secret key found on the project — skipped SUPABASE_SERVICE_ROLE_KEY.');

        return;
    }

    await storeSecret(cwd, 'local', 'SUPABASE_SERVICE_ROLE_KEY', service.api_key);
}

/** Match by key name first, then by type — the dashboard is migrating names (anon→publishable). */
function findKey(keys: SupabaseApiKey[], candidates: string[]): SupabaseApiKey | undefined
{
    return keys.find(key => candidates.includes(key.name))
        ?? keys.find(key => key.type !== undefined && candidates.includes(key.type));
}

async function storeDatabaseUrl(cwd: string, projectRef: string): Promise<void>
{
    const { password } = await prompts({
        type: 'password',
        name: 'password',
        message: 'Supabase database password (set at project creation; not retrievable via API)',
    });

    if (!password)
    {
        logger.warn('No password entered — skipped DATABASE_URL.');

        return;
    }

    const url = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
    await storeSecret(cwd, 'local', 'DATABASE_URL', url);
    logger.info('This is the direct (non-pooler) connection — right for migrations; serverless runtime should use the pooler URL.');
}

export async function cloudEnvPush(keys: string[]): Promise<void>
{
    const cwd = process.cwd();

    if (keys.length === 0)
    {
        logger.error('Name the env keys to push: `spfn cloud env push KEY [KEY...]` (values are looked up locally, never passed as arguments).');
        process.exit(1);
    }

    try
    {
        const linked = requireLinked(readCloudConfig(cwd), 'vercel');
        const token = await requireCloudToken('vercel');
        const { vars, missing } = await resolveLocalValues(cwd, keys);

        for (const key of missing)
        {
            logger.warn(`${key}: not found in .env/.env.local/.env.server or the keychain — skipped.`);
        }

        if (vars.length === 0)
        {
            logger.error('Nothing to push.');
            process.exit(1);
        }

        await upsertVercelEnvVars(token, linked.projectId, vars, linked.teamId);

        for (const envVar of vars)
        {
            logger.success(`${envVar.key} → Vercel ${chalk.cyan(linked.projectName)} (${envVar.type}, ${envVar.target.join('+')})`);
        }
    }
    catch (error)
    {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

async function resolveLocalValues(cwd: string, keys: string[]): Promise<{ vars: VercelEnvVar[]; missing: string[] }>
{
    const publicEnv = { ...parseEnvFile(join(cwd, '.env')), ...parseEnvFile(join(cwd, '.env.local')) };
    const serverEnv = parseEnvFile(join(cwd, '.env.server'));
    const keychain = await resolveKeychainEnv(cwd);

    const vars: VercelEnvVar[] = [];
    const missing: string[] = [];

    for (const key of keys)
    {
        const fromServer = keychain.env[key] ?? plainValue(serverEnv[key]);
        const value = fromServer ?? publicEnv[key];

        if (value === undefined)
        {
            missing.push(key);
            continue;
        }

        vars.push({
            key,
            value,
            type: key.startsWith('NEXT_PUBLIC_') ? 'plain' : 'encrypted',
            target: ['production', 'preview'],
        });
    }

    return { vars, missing };
}

/** A keychain reference whose item is gone must not be pushed as the literal reference string. */
function plainValue(value: string | undefined): string | undefined
{
    return value !== undefined && !value.startsWith(KEYCHAIN_REF_PREFIX) ? value : undefined;
}
