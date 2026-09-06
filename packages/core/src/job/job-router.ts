/**
 * Job Router
 *
 * Groups job definitions for registration with the server
 */

import type { JobDef, JobRouter, JobRouterEntry } from './types';

/**
 * Type guard to check if value is a JobDef
 */
export function isJobDef(value: unknown): value is JobDef<any>
{
    return (
        value !== null &&
        typeof value === 'object' &&
        'name' in value &&
        'handler' in value &&
        'send' in value &&
        'run' in value
    );
}

/**
 * Type guard to check if value is a JobRouter
 */
export function isJobRouter(value: unknown): value is JobRouter<any>
{
    return (
        value !== null &&
        typeof value === 'object' &&
        'jobs' in value &&
        '_jobs' in value
    );
}

/**
 * Define a job router to group jobs together
 *
 * @example
 * ```typescript
 * // Flat structure
 * export const jobRouter = defineJobRouter({
 *     sendWelcomeEmail,
 *     dailyReport,
 *     initCache,
 * });
 *
 * // Nested structure
 * export const jobRouter = defineJobRouter({
 *     email: defineJobRouter({
 *         sendWelcome: sendWelcomeEmailJob,
 *         sendReset: sendResetPasswordJob,
 *     }),
 *     reports: defineJobRouter({
 *         daily: dailyReportJob,
 *         weekly: weeklyReportJob,
 *     }),
 * });
 *
 * // Mixed
 * export const jobRouter = defineJobRouter({
 *     initCache,  // flat
 *     email: defineJobRouter({ ... }),  // nested
 * });
 * ```
 */
export function defineJobRouter<
    TJobs extends Record<string, JobRouterEntry>,
>(jobs: TJobs): JobRouter<TJobs>
{
    return {
        jobs,
        _jobs: jobs,
    };
}

/**
 * Merge two job routers into a new one
 *
 * `defineServerConfig().jobs()` may be called once per domain router, the way
 * `.routes()` is; each call merges into what is already registered instead of
 * replacing it. Keys are the router's own namespace, so a key present in both
 * routers is a mistake the app cannot recover from silently — one of the two
 * would disappear.
 *
 * Neither input is mutated: a fresh router is returned.
 *
 * @throws if a top-level key exists in both routers
 */
export function mergeJobRouters(base: JobRouter<any>, extra: JobRouter<any>): JobRouter<any>
{
    for (const key of Object.keys(extra.jobs))
    {
        if (key in base.jobs)
        {
            throw new Error(
                `jobs(): key "${key}" is already registered by an earlier .jobs() call; ` +
                'rename it or nest it under a domain router',
            );
        }
    }

    return defineJobRouter({ ...base.jobs, ...extra.jobs });
}

/**
 * A collected job together with the router key path that reached it
 *
 * The key path (`email.sendWelcome`) is what an app author recognises, so it
 * is what error messages about a job name should quote.
 */
export interface JobEntry
{
    readonly key: string;
    readonly job: JobDef<any>;
}

/**
 * Collect all JobDefs from a JobRouter (including nested) with their key paths
 */
export function collectJobEntries(
    router: JobRouter<any>,
    prefix = '',
): JobEntry[]
{
    const entries: JobEntry[] = [];

    for (const [key, value] of Object.entries(router.jobs))
    {
        const path = prefix ? `${prefix}.${key}` : key;

        if (isJobRouter(value))
        {
            // Nested router - recurse
            entries.push(...collectJobEntries(value, path));
        }
        else if (isJobDef(value))
        {
            entries.push({ key: path, job: value });
        }
    }

    return entries;
}

/**
 * Collect all JobDefs from a JobRouter (including nested)
 */
export function collectJobs(
    router: JobRouter<any>,
    prefix = '',
): JobDef<any>[]
{
    return collectJobEntries(router, prefix).map((entry) => entry.job);
}
