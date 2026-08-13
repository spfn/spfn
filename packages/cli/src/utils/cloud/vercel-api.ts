/**
 * Minimal Vercel REST client for `spfn cloud` — only the calls the commands need.
 *
 * Usage comes from the FOCUS-format billing charges feed
 * (GET /v1/billing/charges, JSONL, one record per day × service × project),
 * which is the one programmatic usage surface available to Hobby accounts.
 * Endpoint shapes verified against the official REST docs on 2026-08-13.
 */

import { cloudFetch, cloudFetchJson } from './http.js';

const BASE = 'https://api.vercel.com';
const PROVIDER = 'Vercel';

export interface VercelUser
{
    user: { id: string; username: string };
}

export interface VercelProject
{
    id: string;
    name: string;
}

export async function getVercelUser(token: string): Promise<VercelUser>
{
    return cloudFetchJson<VercelUser>(`${BASE}/v2/user`, { token, provider: PROVIDER });
}

export async function listVercelProjects(token: string, teamId?: string): Promise<VercelProject[]>
{
    const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
    const data = await cloudFetchJson<{ projects: VercelProject[] }>(`${BASE}/v9/projects${query}`, { token, provider: PROVIDER });

    return data.projects;
}

/** One FOCUS record we care about; the feed carries more fields than these. */
export interface FocusCharge
{
    ServiceName?: string;
    ConsumedQuantity?: number | string;
    ConsumedUnit?: string;
}

export interface VercelServiceUsage
{
    serviceName: string;
    consumed: number;
    unit: string;
}

export async function getVercelUsage(token: string, from: Date, to: Date, teamId?: string): Promise<VercelServiceUsage[]>
{
    const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });

    if (teamId)
    {
        params.set('teamId', teamId);
    }

    // A Hobby account with no recorded usage 404s here ("Costs not found") —
    // that is "nothing consumed yet", not an error. Seen live on a fresh account.
    const response = await cloudFetch(`${BASE}/v1/billing/charges?${params}`, { token, provider: PROVIDER, allowNotFound: true });

    if (response === null)
    {
        return [];
    }

    return aggregateFocusCharges(await response.text());
}

/**
 * Sum per-day FOCUS records into one row per service. Lines that fail to parse or
 * carry no consumption are skipped — the feed is an external contract we render,
 * not one we validate.
 */
export function aggregateFocusCharges(jsonl: string): VercelServiceUsage[]
{
    const totals = new Map<string, VercelServiceUsage>();

    for (const line of jsonl.split('\n'))
    {
        const record = parseFocusLine(line);

        if (!record?.ServiceName)
        {
            continue;
        }

        const consumed = Number(record.ConsumedQuantity ?? 0);

        if (!Number.isFinite(consumed) || consumed === 0)
        {
            continue;
        }

        const existing = totals.get(record.ServiceName);

        if (existing)
        {
            existing.consumed += consumed;
        }
        else
        {
            totals.set(record.ServiceName, {
                serviceName: record.ServiceName,
                consumed,
                unit: record.ConsumedUnit ?? '',
            });
        }
    }

    return [...totals.values()].sort((a, b) => a.serviceName.localeCompare(b.serviceName));
}

function parseFocusLine(line: string): FocusCharge | null
{
    const trimmed = line.trim();

    if (!trimmed)
    {
        return null;
    }

    try
    {
        return JSON.parse(trimmed) as FocusCharge;
    }
    catch
    {
        return null;
    }
}

export interface VercelEnvVar
{
    key: string;
    value: string;
    /** `encrypted` for secrets, `plain` for public values. */
    type: 'encrypted' | 'plain';
    target: ('production' | 'preview' | 'development')[];
}

export async function upsertVercelEnvVars(token: string, projectId: string, vars: VercelEnvVar[], teamId?: string): Promise<void>
{
    const query = new URLSearchParams({ upsert: 'true' });

    if (teamId)
    {
        query.set('teamId', teamId);
    }

    await cloudFetch(`${BASE}/v10/projects/${encodeURIComponent(projectId)}/env?${query}`, {
        method: 'POST',
        token,
        provider: PROVIDER,
        body: vars,
    });
}
