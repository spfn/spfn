/**
 * Shared data collection for `spfn cloud usage` and `spfn cloud status`.
 *
 * Every number here is best-effort: a provider endpoint that fails or answers in an
 * unknown shape becomes a `null`/empty field with the error kept aside, so one
 * broken feed never blanks the whole report.
 */

import { readCloudConfig, requireLinked, type CloudConfig } from '../../utils/cloud/config.js';
import { requireCloudToken } from '../../utils/cloud/tokens.js';
import { getVercelUsage, type VercelServiceUsage } from '../../utils/cloud/vercel-api.js';
import {
    getSupabaseProject,
    getSupabaseDbSizeBytes,
    getSupabaseDailyApiCount,
} from '../../utils/cloud/supabase-api.js';
import { VERCEL_HOBBY_LIMITS, type PlanLimit } from '../../utils/cloud/limits-data.js';

export interface CloudSnapshot
{
    config: CloudConfig;
    vercel: {
        projectName: string;
        /** Rolling 30 days — the window Hobby limits are enforced over. */
        services: VercelServiceUsage[];
    } | null;
    supabase: {
        projectName: string;
        status: string;
        dbSizeBytes: number | null;
        dailyApiCount: number | null;
    } | null;
    /** Feeds that failed, as `provider: message` lines for the report footer. */
    problems: string[];
}

export async function collectSnapshot(cwd: string): Promise<CloudSnapshot>
{
    let config: CloudConfig;

    try
    {
        config = readCloudConfig(cwd);
    }
    catch (error)
    {
        return {
            config: {},
            vercel: null,
            supabase: null,
            problems: [error instanceof Error ? error.message : String(error)],
        };
    }

    const snapshot: CloudSnapshot = { config, vercel: null, supabase: null, problems: [] };

    await Promise.all([
        collectVercel(config, snapshot),
        collectSupabase(config, snapshot),
    ]);

    return snapshot;
}

async function collectVercel(config: CloudConfig, snapshot: CloudSnapshot): Promise<void>
{
    try
    {
        const linked = requireLinked(config, 'vercel');
        const token = await requireCloudToken('vercel');
        const to = new Date();
        const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

        snapshot.vercel = {
            projectName: linked.projectName,
            services: await getVercelUsage(token, from, to, linked.teamId),
        };
    }
    catch (error)
    {
        snapshot.problems.push(`Vercel: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function collectSupabase(config: CloudConfig, snapshot: CloudSnapshot): Promise<void>
{
    let linked;
    let token;

    try
    {
        linked = requireLinked(config, 'supabase');
        token = await requireCloudToken('supabase');
    }
    catch (error)
    {
        snapshot.problems.push(`Supabase: ${error instanceof Error ? error.message : String(error)}`);

        return;
    }

    const project = await swallow(() => getSupabaseProject(token, linked.projectRef), 'Supabase project', snapshot);
    const status = project?.status ?? 'unknown';

    // A paused project's DB is unreachable: the query endpoint holds the
    // connection for ~30-90s and then fails (seen live, HTTP 544). Knowing the
    // status first, skip what cannot answer instead of timing out into warnings.
    if (isSupabasePaused(status))
    {
        snapshot.supabase = { projectName: project?.name ?? linked.projectName, status, dbSizeBytes: null, dailyApiCount: null };

        return;
    }

    const [dbSizeBytes, dailyApiCount] = await Promise.all([
        swallow(() => getSupabaseDbSizeBytes(token, linked.projectRef), 'Supabase DB size', snapshot),
        swallow(() => getSupabaseDailyApiCount(token, linked.projectRef), 'Supabase API counts', snapshot),
    ]);

    snapshot.supabase = {
        projectName: project?.name ?? linked.projectName,
        status,
        dbSizeBytes: dbSizeBytes ?? null,
        dailyApiCount: dailyApiCount ?? null,
    };
}

export function isSupabasePaused(status: string): boolean
{
    return ['INACTIVE', 'PAUSED', 'PAUSING', 'PAUSE_FAILED'].includes(status.toUpperCase());
}

async function swallow<T>(call: () => Promise<T>, label: string, snapshot: CloudSnapshot): Promise<T | null>
{
    try
    {
        return await call();
    }
    catch (error)
    {
        snapshot.problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);

        return null;
    }
}

/**
 * Match a FOCUS ServiceName to the Hobby limit it counts against, by normalized
 * label ("Fast Data Transfer" → fast-data-transfer). Feed names are provider-owned,
 * so an unmatched service is expected and rendered without a percentage.
 *
 * Only monthly limits participate: the usage window is a 30-day sum, so comparing
 * it against a per-day or concurrent ceiling would read 30x too high (120 deploys
 * over a month is 4/day, not 120% of the daily limit).
 */
export function matchVercelLimit(serviceName: string): PlanLimit | undefined
{
    const normalized = normalize(serviceName);

    return VERCEL_HOBBY_LIMITS.find(limit => limit.per === 'month'
        && (normalize(limit.label) === normalized || normalize(limit.key) === normalized));
}

function normalize(text: string): string
{
    return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}
