/**
 * Job Builder
 *
 * Fluent API for defining jobs, similar to route builder pattern
 */

import type { Static, TSchema } from '@sinclair/typebox';
import type { JobDef, JobHandler, JobOptions, JobSendOptions } from './types';
import type { EventDef, InferEventPayload } from '@spfn/core/event';
import { getBoss } from './boss';

/**
 * Build pg-boss options from job defaults and send options
 */
function buildPgBossOptions(
    defaults?: JobOptions,
    sendOptions?: JobSendOptions
): Record<string, unknown>
{
    const options: Record<string, unknown> = {};

    // Send options (per-job invocation)
    if (sendOptions?.startAfter)
    {
        options.startAfter = sendOptions.startAfter;
    }
    if (sendOptions?.singletonKey)
    {
        options.singletonKey = sendOptions.singletonKey;
    }
    if (sendOptions?.priority !== undefined)
    {
        options.priority = sendOptions.priority;
    }

    // Default options (from job definition)
    if (defaults?.retryLimit !== undefined)
    {
        options.retryLimit = defaults.retryLimit;
    }
    if (defaults?.retryDelay !== undefined)
    {
        options.retryDelay = defaults.retryDelay;
    }
    if (defaults?.expireInSeconds !== undefined)
    {
        options.expireInSeconds = defaults.expireInSeconds;
    }
    if (defaults?.priority !== undefined && sendOptions?.priority === undefined)
    {
        options.priority = defaults.priority;
    }
    if (defaults?.singletonKey && !sendOptions?.singletonKey)
    {
        options.singletonKey = defaults.singletonKey;
    }
    if (defaults?.retentionSeconds !== undefined)
    {
        options.retentionSeconds = defaults.retentionSeconds;
    }

    return options;
}

/**
 * Job builder class with fluent API
 */
export class JobBuilder<TInput = void>
{
    private _name: string;
    private _inputSchema?: TSchema;
    private _cronExpression?: string;
    private _runOnce?: boolean;
    private _subscribedEvent?: string;
    private _subscribedEventDef?: EventDef<any>;
    private _options?: JobOptions;
    private _handler?: JobHandler<TInput>;

    constructor(name: string)
    {
        this._name = name;
    }

    /**
     * Define input schema with TypeBox
     */
    input<TSchema extends import('@sinclair/typebox').TSchema>(
        schema: TSchema
    ): JobBuilder<Static<TSchema>>
    {
        const builder = new JobBuilder<Static<TSchema>>(this._name);
        builder._inputSchema = schema;
        builder._cronExpression = this._cronExpression;
        builder._runOnce = this._runOnce;
        builder._subscribedEvent = this._subscribedEvent;
        builder._options = this._options;
        return builder;
    }

    /**
     * Subscribe to an event (decoupled triggering)
     *
     * @example
     * ```typescript
     * const userCreated = defineEvent('user.created', Type.Object({
     *     userId: Type.String(),
     * }));
     *
     * const sendWelcomeEmail = job('send-welcome-email')
     *     .on(userCreated)
     *     .handler(async (payload) => {
     *         // payload is typed as { userId: string }
     *     });
     * ```
     */
    on<TEvent extends EventDef<any>>(
        event: TEvent
    ): JobBuilder<InferEventPayload<TEvent>>
    {
        const builder = new JobBuilder<InferEventPayload<TEvent>>(this._name);
        builder._inputSchema = event.schema;
        builder._subscribedEvent = event.name;
        builder._subscribedEventDef = event;
        builder._cronExpression = this._cronExpression;
        builder._runOnce = this._runOnce;
        builder._options = this._options;
        return builder;
    }

    /**
     * Set cron expression for scheduled execution
     */
    cron(expression: string): this
    {
        this._cronExpression = expression;
        return this;
    }

    /**
     * Mark job to run once on server start
     */
    runOnce(): this
    {
        this._runOnce = true;
        return this;
    }

    /**
     * Set job options (retry, expiration, etc.)
     */
    options(options: JobOptions): this
    {
        this._options = options;
        return this;
    }

    /**
     * Define the job handler and finalize the job definition
     */
    handler(fn: JobHandler<TInput>): JobDef<TInput>
    {
        this._handler = fn;

        const name = this._name;
        const inputSchema = this._inputSchema;
        const cronExpression = this._cronExpression;
        const runOnce = this._runOnce;
        const subscribedEvent = this._subscribedEvent;
        const subscribedEventDef = this._subscribedEventDef;
        const options = this._options;
        const handler = this._handler;

        // Create send function
        const send = async (
            inputOrOptions?: TInput | JobSendOptions,
            maybeOptions?: JobSendOptions
        ): Promise<string | null> =>
        {
            const boss = getBoss();
            if (!boss)
            {
                throw new Error(
                    `[Job:${name}] pg-boss not initialized. ` +
                    'Ensure jobs are registered with defineServerConfig().jobs()'
                );
            }

            // Determine input and options based on whether job has input schema
            const [input, sendOptions] = inputSchema
                ? [inputOrOptions as TInput, maybeOptions]
                : [undefined, inputOrOptions as JobSendOptions | undefined];

            return await boss.send(
                name,
                input ?? {},
                buildPgBossOptions(options, sendOptions)
            );
        };

        // Create run function (synchronous execution)
        const run = async (input?: TInput): Promise<void> =>
        {
            if (inputSchema)
            {
                await (handler as (input: TInput) => Promise<void>)(input as TInput);
            }
            else
            {
                await (handler as () => Promise<void>)();
            }
        };

        return {
            name,
            inputSchema,
            cronExpression,
            runOnce,
            subscribedEvent,
            _subscribedEventDef: subscribedEventDef,
            options,
            handler,
            send: send as JobDef<TInput>['send'],
            run: run as JobDef<TInput>['run'],
            _input: undefined as unknown as TInput,
        };
    }
}

/**
 * Create a new job definition
 *
 * @example
 * ```typescript
 * // Simple job without input
 * export const cleanupJob = job('cleanup')
 *     .handler(async () => {
 *         await db.cleanup();
 *     });
 *
 * // Job with typed input
 * export const sendEmailJob = job('send-email')
 *     .input(Type.Object({
 *         to: Type.String(),
 *         subject: Type.String(),
 *         body: Type.String(),
 *     }))
 *     .handler(async (input) => {
 *         await emailService.send(input.to, input.subject, input.body);
 *     });
 *
 * // Cron job
 * export const dailyReportJob = job('daily-report')
 *     .cron('0 9 * * *')
 *     .handler(async () => {
 *         await reportService.generateDaily();
 *     });
 *
 * // Run once on server start
 * export const initCacheJob = job('init-cache')
 *     .runOnce()
 *     .handler(async () => {
 *         await cache.warmup();
 *     });
 *
 * // With options
 * export const importantJob = job('important-task')
 *     .input(Type.Object({ id: Type.String() }))
 *     .options({
 *         retryLimit: 5,
 *         retryDelay: 5000,
 *         priority: 10,
 *     })
 *     .handler(async (input) => {
 *         await processImportant(input.id);
 *     });
 * ```
 */
export function job(name: string): JobBuilder<void>
{
    return new JobBuilder(name);
}
