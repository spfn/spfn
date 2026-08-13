/**
 * Minimal Supabase Management API client for `spfn cloud`.
 *
 * The Management API (api.supabase.com, personal access token) is the only
 * programmatic surface — the `supabase` CLI has no usage/quota command. There is
 * no public org-level aggregated usage endpoint (egress/MAU totals), so usage is
 * per-item approximations plus the dashboard for exact numbers. Endpoint shapes
 * verified against the OpenAPI spec (api.supabase.com/api/v1-json) on 2026-08-13.
 *
 * Analytics endpoints are rate-limited harder than the rest (30 req/min vs 120),
 * which the commands respect by calling each at most once per run.
 */

import { cloudFetchJson } from './http.js';

const BASE = 'https://api.supabase.com';
const PROVIDER = 'Supabase';

export interface SupabaseOrganization
{
    id: string;
    slug: string;
    name: string;
}

export interface SupabaseProject
{
    id: string;
    ref?: string;
    organization_id: string;
    name: string;
    region: string;
    status: string;
}

export async function listSupabaseOrganizations(token: string): Promise<SupabaseOrganization[]>
{
    return cloudFetchJson<SupabaseOrganization[]>(`${BASE}/v1/organizations`, { token, provider: PROVIDER });
}

export async function listSupabaseProjects(token: string): Promise<SupabaseProject[]>
{
    return cloudFetchJson<SupabaseProject[]>(`${BASE}/v1/projects`, { token, provider: PROVIDER });
}

export async function getSupabaseProject(token: string, ref: string): Promise<SupabaseProject>
{
    return cloudFetchJson<SupabaseProject>(`${BASE}/v1/projects/${encodeURIComponent(ref)}`, { token, provider: PROVIDER });
}

/** Entitlements — the plan's own statement of its limits. Shape is provider-owned, so it stays loose. */
export async function getSupabaseEntitlements(token: string, orgSlug: string): Promise<unknown>
{
    return cloudFetchJson<unknown>(
        `${BASE}/v1/organizations/${encodeURIComponent(orgSlug)}/entitlements`,
        { token, provider: PROVIDER },
    );
}

export interface SupabaseApiKey
{
    name: string;
    api_key: string;
    type?: string;
}

export async function getSupabaseApiKeys(token: string, ref: string): Promise<SupabaseApiKey[]>
{
    return cloudFetchJson<SupabaseApiKey[]>(
        `${BASE}/v1/projects/${encodeURIComponent(ref)}/api-keys`,
        { token, provider: PROVIDER },
    );
}

export interface SupabasePoolerConfig
{
    database_type?: string;
    pool_mode?: string;
    /** Template with a literal `[YOUR-PASSWORD]` placeholder. */
    connection_string?: string;
}

/**
 * Pooler (Supavisor) connection templates. This is the IPv4-safe path: the direct
 * `db.<ref>.supabase.co` host has no A record (verified live 2026-08-14), so a
 * composed direct URL times out on IPv4-only networks.
 */
export async function getSupabasePoolerConfigs(token: string, ref: string): Promise<SupabasePoolerConfig[]>
{
    return cloudFetchJson<SupabasePoolerConfig[]>(
        `${BASE}/v1/projects/${encodeURIComponent(ref)}/config/database/pooler`,
        { token, provider: PROVIDER },
    );
}

/**
 * Run a read-only SQL statement through the Management API query endpoint.
 * Used for DB size — the one number the analytics endpoints do not carry.
 */
export async function runSupabaseQuery(token: string, ref: string, query: string): Promise<unknown>
{
    return cloudFetchJson<unknown>(`${BASE}/v1/projects/${encodeURIComponent(ref)}/database/query`, {
        method: 'POST',
        token,
        provider: PROVIDER,
        body: { query },
    });
}

export async function getSupabaseDbSizeBytes(token: string, ref: string): Promise<number | null>
{
    const rows = await runSupabaseQuery(
        token,
        ref,
        'select sum(pg_database_size(datname))::bigint as total_bytes from pg_database;',
    );

    return extractDbSizeBytes(rows);
}

/** The query endpoint answers with an array of rows; defend against shape drift. */
export function extractDbSizeBytes(rows: unknown): number | null
{
    if (!Array.isArray(rows) || rows.length === 0)
    {
        return null;
    }

    const value = (rows[0] as Record<string, unknown>).total_bytes;
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Total REST/auth/storage/realtime request count for the last 24h, from the
 * analytics api-counts endpoint. Live response (verified 2026-08-14):
 * `{ result: [{ timestamp, total_auth_requests, total_rest_requests,
 * total_realtime_requests, total_storage_requests }], error }` — one row per
 * bucket. Every numeric `total_*` field is summed; null means "could not read".
 */
export async function getSupabaseDailyApiCount(token: string, ref: string): Promise<number | null>
{
    const data = await cloudFetchJson<unknown>(
        `${BASE}/v1/projects/${encodeURIComponent(ref)}/analytics/endpoints/usage.api-counts?interval=1day`,
        { token, provider: PROVIDER },
    );

    return sumApiCounts(data);
}

export function sumApiCounts(data: unknown): number | null
{
    const result = (data as { result?: unknown })?.result;

    if (!Array.isArray(result))
    {
        return null;
    }

    let total = 0;
    let found = false;

    for (const row of result)
    {
        for (const [field, value] of Object.entries(row as Record<string, unknown>))
        {
            // `count` is the pre-2026 shape, kept as a fallback.
            if (field !== 'count' && !field.startsWith('total_'))
            {
                continue;
            }

            const count = Number(value);

            if (Number.isFinite(count))
            {
                total += count;
                found = true;
            }
        }
    }

    return found ? total : null;
}
