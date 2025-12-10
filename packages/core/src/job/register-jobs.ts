/**
 * Job Registration
 *
 * Registers jobs with pg-boss
 */

import type PgBoss from 'pg-boss';
import { logger } from '@spfn/core/logger';
import type { JobDef, JobOptions, JobRouter } from './types';
import type { EventDef } from '@spfn/core/event';
import { collectJobs } from './job-router';
import { getBoss, shouldClearOnStart } from './boss';

const jobLogger = logger.child('@spfn/core:job');

/**
 * Get the pg-boss queue name for an event
 */
export function getEventQueueName(eventName: string): string
{
    return `event:${eventName}`;
}

/**
 * Build default pg-boss options for a job
 */
function getDefaultJobOptions(options?: JobOptions): PgBoss.SendOptions
{
    return {
        retryLimit: options?.retryLimit ?? 3,
        retryDelay: options?.retryDelay ?? 1000,
        expireInSeconds: options?.expireInSeconds ?? 300,
    };
}

/**
 * Register all jobs from a JobRouter with pg-boss
 *
 * This function:
 * 1. Collects all jobs from the router (including nested routers)
 * 2. Optionally clears existing jobs (if clearOnStart is enabled)
 * 3. Registers each job's worker handler with pg-boss
 * 4. Sets up cron schedules for scheduled jobs
 * 5. Queues runOnce jobs
 * 6. Connects event subscriptions to job queues
 *
 * @param router - JobRouter containing job definitions
 *
 * @example
 * ```typescript
 * // Define jobs
 * const sendEmail = job('send-email')
 *     .input(Type.Object({ to: Type.String() }))
 *     .handler(async (input) => { ... });
 *
 * const dailyReport = job('daily-report')
 *     .cron('0 9 * * *')
 *     .handler(async () => { ... });
 *
 * // Create router
 * const jobRouter = defineJobRouter({ sendEmail, dailyReport });
 *
 * // Initialize pg-boss first
 * await initBoss({ connectionString: process.env.DATABASE_URL! });
 *
 * // Register jobs
 * await registerJobs(jobRouter);
 * ```
 */
export async function registerJobs(router: JobRouter<any>): Promise<void>
{
    const boss = getBoss();
    if (!boss)
    {
        throw new Error(
            'pg-boss not initialized. Call initBoss() before registerJobs()'
        );
    }

    const jobs = collectJobs(router);
    const clearOnStart = shouldClearOnStart();

    jobLogger.info(`Registering ${jobs.length} job(s)...`);

    // Clear existing jobs if requested (useful for development)
    if (clearOnStart)
    {
        jobLogger.info('Clearing existing jobs before registration...');
        for (const job of jobs)
        {
            // Clear job queue
            await boss.deleteAllJobs(job.name);

            // Also clear event queue if subscribed
            if (job.subscribedEvent)
            {
                const eventQueue = getEventQueueName(job.subscribedEvent);
                await boss.deleteAllJobs(eventQueue);
            }
        }
        jobLogger.info('Existing jobs cleared');
    }

    for (const job of jobs)
    {
        await registerJob(job);
    }

    jobLogger.info('All jobs registered successfully');
}

/**
 * Register worker handler for a job
 */
async function registerWorker(
    boss: PgBoss,
    job: JobDef<any>,
    queueName: string
): Promise<void>
{
    await boss.work(
        queueName,
        { batchSize: 1 },
        async (jobs) =>
        {
            for (const pgBossJob of jobs)
            {
                jobLogger.debug(`[Job:${job.name}] Executing...`, { jobId: pgBossJob.id });

                const startTime = Date.now();

                try
                {
                    if (job.inputSchema)
                    {
                        await (job.handler as (input: unknown) => Promise<void>)(pgBossJob.data);
                    }
                    else
                    {
                        await (job.handler as () => Promise<void>)();
                    }

                    const duration = Date.now() - startTime;
                    jobLogger.info(`[Job:${job.name}] Completed in ${duration}ms`, {
                        jobId: pgBossJob.id,
                        duration,
                    });
                }
                catch (error)
                {
                    const duration = Date.now() - startTime;
                    jobLogger.error(`[Job:${job.name}] Failed after ${duration}ms`, {
                        jobId: pgBossJob.id,
                        duration,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    throw error;
                }
            }
        }
    );
}

/**
 * Connect event to pg-boss queue
 */
function connectEventToQueue(
    boss: PgBoss,
    job: JobDef<any>,
    queueName: string
): void
{
    if (!job._subscribedEventDef)
    {
        return;
    }

    const eventDef = job._subscribedEventDef as EventDef<any>;
    eventDef._registerJobQueue(queueName, async (queue, payload) =>
    {
        await boss.send(queue, payload as object, getDefaultJobOptions(job.options));
    });

    jobLogger.debug(`[Job:${job.name}] Connected to event: ${job.subscribedEvent}`);
}

/**
 * Register cron schedule for a job
 */
async function registerCronSchedule(boss: PgBoss, job: JobDef<any>): Promise<void>
{
    if (!job.cronExpression)
    {
        return;
    }

    jobLogger.debug(`[Job:${job.name}] Scheduling cron: ${job.cronExpression}`);

    await boss.schedule(
        job.name,
        job.cronExpression,
        {},
        getDefaultJobOptions(job.options)
    );

    jobLogger.info(`[Job:${job.name}] Cron scheduled: ${job.cronExpression}`);
}

/**
 * Queue a runOnce job
 */
async function queueRunOnceJob(boss: PgBoss, job: JobDef<any>): Promise<void>
{
    if (!job.runOnce)
    {
        return;
    }

    jobLogger.debug(`[Job:${job.name}] Queuing runOnce job`);

    await boss.send(
        job.name,
        {},
        {
            ...getDefaultJobOptions(job.options),
            singletonKey: `runOnce:${job.name}`,
        }
    );

    jobLogger.info(`[Job:${job.name}] runOnce job queued`);
}

/**
 * Register a single job with pg-boss
 */
async function registerJob(job: JobDef<any>): Promise<void>
{
    const boss = getBoss();
    if (!boss)
    {
        throw new Error('pg-boss not initialized');
    }

    const queueName = job.subscribedEvent
        ? getEventQueueName(job.subscribedEvent)
        : job.name;

    jobLogger.debug(`Registering job: ${job.name}`, {
        queueName,
        subscribedEvent: job.subscribedEvent,
    });

    await registerWorker(boss, job, queueName);
    connectEventToQueue(boss, job, queueName);
    await registerCronSchedule(boss, job);
    await queueRunOnceJob(boss, job);

    jobLogger.debug(`Job registered: ${job.name}`);
}
