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
    TJobs extends Record<string, JobRouterEntry>
>(jobs: TJobs): JobRouter<TJobs>
{
    return {
        jobs,
        _jobs: jobs,
    };
}

/**
 * Collect all JobDefs from a JobRouter (including nested)
 */
export function collectJobs(
    router: JobRouter<any>,
    prefix = ''
): JobDef<any>[]
{
    const jobs: JobDef<any>[] = [];

    for (const [key, value] of Object.entries(router.jobs))
    {
        const name = prefix ? `${prefix}.${key}` : key;

        if (isJobRouter(value))
        {
            // Nested router - recurse
            jobs.push(...collectJobs(value, name));
        }
        else if (isJobDef(value))
        {
            jobs.push(value);
        }
    }

    return jobs;
}
