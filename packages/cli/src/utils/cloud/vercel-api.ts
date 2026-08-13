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

    const body = await response.text();

    // An unreadable body must become a visible problem, not a confident zero:
    // "no usage" suppresses the near-limit warning this command exists for.
    if (!focusFeedReadable(body))
    {
        throw new Error('Vercel billing feed answered in an unrecognized shape — usage is unavailable, not zero.');
    }

    return aggregateFocusCharges(body);
}

/**
 * Whether the charges body is JSONL we can read: empty means "no usage" (fine),
 * otherwise at least one line must parse to a record naming a service. Exported
 * for tests.
 */
export function focusFeedReadable(body: string): boolean
{
    const lines = body.split('\n').filter(line => line.trim() !== '');

    // Boolean(): the aggregator's own truthiness test, so a feed of ServiceName
    // null/"" records counts as unreadable here too rather than as zero usage.
    return lines.length === 0 || lines.some(line => Boolean(parseFocusLine(line)?.ServiceName));
}

/**
 * Sum per-day FOCUS records into one row per service and unit. Lines that fail to
 * parse or carry no consumption are skipped — the feed is an external contract we
 * render, not one we validate. Keying by unit too means a mid-window unit change
 * (MB one day, GB the next) yields two honest rows instead of one wrong sum.
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

        const unit = record.ConsumedUnit ?? '';
        const key = `${record.ServiceName}\u0000${unit}`;
        const existing = totals.get(key);

        if (existing)
        {
            existing.consumed += consumed;
        }
        else
        {
            totals.set(key, { serviceName: record.ServiceName, consumed, unit });
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

export interface VercelEnvPushResult
{
    /** Keys the provider rejected, with its reason — a 2xx can still carry per-key failures. */
    failed: { key: string; message: string }[];
}

export async function upsertVercelEnvVars(token: string, projectId: string, vars: VercelEnvVar[], teamId?: string): Promise<VercelEnvPushResult>
{
    const query = new URLSearchParams({ upsert: 'true' });

    if (teamId)
    {
        query.set('teamId', teamId);
    }

    const response = await cloudFetch(`${BASE}/v10/projects/${encodeURIComponent(projectId)}/env?${query}`, {
        method: 'POST',
        token,
        provider: PROVIDER,
        body: vars,
    });

    return { failed: extractEnvPushFailures(await response.json().catch(() => null)) };
}

/**
 * The bulk env endpoint answers `{ created: [...], failed: [{ error: { key,
 * message, ... } }] }` and reports per-key rejections in `failed` under a 2xx.
 * Unknown shapes yield no failures — the caller already has the 2xx.
 */
export function extractEnvPushFailures(body: unknown): { key: string; message: string }[]
{
    const failed = (body as { failed?: unknown })?.failed;

    if (!Array.isArray(failed))
    {
        return [];
    }

    return failed.map((item) =>
    {
        const error = (item as { error?: { key?: string; envVarKey?: string; message?: string } })?.error;

        return {
            key: error?.key ?? error?.envVarKey ?? 'unknown key',
            message: error?.message ?? 'rejected by Vercel',
        };
    });
}
