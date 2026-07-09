/**
 * @spfn/auth - Account Deletion Purge Job
 *
 * The package's first background job (`@spfn/core/job`). Sweeps
 * `account_deletion_requests` for rows whose grace period elapsed and purges
 * each one (see `sweepDuePurges` in `account-deletion.service.ts`).
 *
 * Registration is NOT automatic. `createAuthLifecycle()`'s `afterInfrastructure`
 * hook runs *before* `initBoss`/`registerJobs` in `@spfn/core`'s server startup
 * (`initializeInfrastructure()`), so the lifecycle has no opportunity to register
 * jobs itself. Apps must register explicitly:
 *
 * ```typescript
 * import { authJobRouter } from '@spfn/auth/server';
 *
 * export default defineServerConfig()
 *     .lifecycle(createAuthLifecycle())
 *     .jobs(authJobRouter)
 *     .routes(appRouter)
 *     .build();
 * ```
 *
 * Cron schedule caveat: `job(...).cron(expression)` bakes the cron string in at
 * *module-import* time, which always happens before `createAuthLifecycle()` runs
 * in the app's own module (ESM evaluates imports before the importing module's
 * statements). So the static `authJobRouter` export below always uses the default
 * cron — `deletion.purgeCron` passed to `createAuthLifecycle()` cannot reach it.
 * To use a custom cron, build the router yourself, after calling
 * `createAuthLifecycle()`, with `createAuthDeletionJobRouter({ purgeCron })` and
 * register that instead of the static export.
 */

import { job, defineJobRouter } from '@spfn/core/job';
import { sweepDuePurges } from '../services/account-deletion.service';
import { authLogger } from '../logger';
import { DEFAULT_DELETION_PURGE_CRON } from '../lib/deletion-config';

/**
 * Build the `auth.deletion.purge` job with a given cron schedule.
 *
 * @param cronExpression - Defaults to `deletion-config`'s default (daily at 04:00).
 */
export function createAuthDeletionPurgeJob(cronExpression: string = DEFAULT_DELETION_PURGE_CRON)
{
    return job('auth.deletion.purge')
        .cron(cronExpression)
        .options({ retryLimit: 1 })
        .handler(async () =>
        {
            const result = await sweepDuePurges();

            if (result.processed > 0)
            {
                authLogger.service.info('[auth.deletion.purge] sweep complete', result);
            }
        });
}

/**
 * Build a job router containing only the deletion purge job, with a given cron.
 * Use this (after calling `createAuthLifecycle({ deletion: { purgeCron } })`) when
 * you need a non-default schedule — see the module doc comment above for why the
 * static `authJobRouter` export can't pick up `deletion.purgeCron` automatically.
 */
export function createAuthDeletionJobRouter(options?: { purgeCron?: string })
{
    return defineJobRouter({
        deletionPurge: createAuthDeletionPurgeJob(options?.purgeCron),
    });
}

/**
 * Default job router — the default cron (`0 4 * * *`). Register with
 * `.jobs(authJobRouter)` in `server.config.ts`.
 */
export const authJobRouter = createAuthDeletionJobRouter();
