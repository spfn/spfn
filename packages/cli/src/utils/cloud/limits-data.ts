/**
 * Free-plan limits shown by `spfn cloud limits/status`.
 *
 * Vercel exposes no API that states Hobby limits, so they live here as constants.
 * Supabase limits are also kept here as the display fallback when the entitlements
 * API answers in a shape we do not recognize. Both tables were read from the
 * official pricing/limits pages on 2026-08-13 — when a number looks stale, re-check
 * vercel.com/docs/limits and supabase.com/pricing and update the date here.
 */

export interface PlanLimit
{
    /** Stable key used to match a usage row to its limit. */
    key: string;
    label: string;
    limit: number;
    unit: string;
    /** Window the limit applies over. */
    per: 'month' | 'day' | 'concurrent' | 'total';
}

export const VERCEL_HOBBY_LIMITS: PlanLimit[] = [
    { key: 'fast-data-transfer', label: 'Fast data transfer', limit: 100, unit: 'GB', per: 'month' },
    { key: 'function-invocations', label: 'Function invocations', limit: 1_000_000, unit: 'invocations', per: 'month' },
    { key: 'active-cpu', label: 'Active CPU', limit: 4, unit: 'CPU-hours', per: 'month' },
    { key: 'provisioned-memory', label: 'Provisioned memory', limit: 360, unit: 'GB-hours', per: 'month' },
    { key: 'edge-requests', label: 'Edge requests', limit: 1_000_000, unit: 'requests', per: 'month' },
    { key: 'image-transformations', label: 'Image transformations', limit: 5_000, unit: 'transformations', per: 'month' },
    { key: 'deployments', label: 'Deployments', limit: 100, unit: 'deploys', per: 'day' },
    { key: 'concurrent-builds', label: 'Concurrent builds', limit: 1, unit: 'build', per: 'concurrent' },
];

export const SUPABASE_FREE_LIMITS: PlanLimit[] = [
    { key: 'db-size', label: 'Database size (per project)', limit: 500, unit: 'MB', per: 'total' },
    { key: 'egress', label: 'Egress', limit: 5, unit: 'GB', per: 'month' },
    { key: 'cached-egress', label: 'Cached egress', limit: 5, unit: 'GB', per: 'month' },
    { key: 'mau', label: 'Monthly active users', limit: 50_000, unit: 'MAU', per: 'month' },
    { key: 'storage', label: 'File storage', limit: 1, unit: 'GB', per: 'total' },
    { key: 'edge-invocations', label: 'Edge function invocations', limit: 500_000, unit: 'invocations', per: 'month' },
    { key: 'realtime-connections', label: 'Realtime connections', limit: 200, unit: 'connections', per: 'concurrent' },
    { key: 'realtime-messages', label: 'Realtime messages', limit: 2_000_000, unit: 'messages', per: 'month' },
    { key: 'active-projects', label: 'Active free projects (per org)', limit: 2, unit: 'projects', per: 'total' },
];

/** Free-tier behaviors that are rules rather than meters — printed as notes. */
export const VERCEL_HOBBY_NOTES: string[] = [
    'Cron jobs: at most one, at most once per day (finer schedules fail the deploy).',
    'Runtime logs are kept for 1 hour.',
    'Over a limit, the capability pauses until rolling 30-day usage drops back under it — Hobby is never billed.',
    'Hobby is for personal, non-commercial use; monetized apps need Pro or a migration.',
];

export const SUPABASE_FREE_NOTES: string[] = [
    'Quota is summed per organization (except database size) — other projects in the same org share it.',
    'Projects pause after ~7 idle days; a few DB requests per day keeps one active (1-year restore window).',
    'No automatic backups; log retention is 1 day.',
    'Over quota: notification, grace until the end of the billing cycle, then org-wide restrictions.',
];

export const LIMITS_VERIFIED_ON = '2026-08-13';
