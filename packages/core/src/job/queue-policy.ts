/**
 * Queue Policy Resolution
 *
 * Lives apart from register-jobs.ts and job-builder.ts so both can read the
 * policy of a job definition without importing each other.
 */

import type { JobOptions, JobQueuePolicy } from './types';

/**
 * The part of a job definition that decides its queue policy
 *
 * `JobDef` satisfies this; the builder can also pass its own fields before the
 * definition object exists.
 */
export interface QueuePolicySource
{
    readonly runOnce?: boolean;
    readonly options?: JobOptions;
}

/**
 * Resolve the pg-boss queue policy for a job definition
 *
 * An explicit `.options({ policy })` always wins. Otherwise a job that asks
 * for deduplication — `.runOnce()` or an `options.singletonKey` — gets
 * `exclusive`, the only policy under which a second enqueue is dropped while
 * the first is still pending or running.
 *
 * Everything else stays `standard`: `exclusive` without a `singletonKey`
 * deduplicates on `COALESCE(singleton_key, '')` and would collapse a plain
 * queue to a single pending job.
 */
export function resolveQueuePolicy(job: QueuePolicySource): JobQueuePolicy
{
    if (job.options?.policy)
    {
        return job.options.policy;
    }

    if (job.runOnce || job.options?.singletonKey)
    {
        return 'exclusive';
    }

    return 'standard';
}
