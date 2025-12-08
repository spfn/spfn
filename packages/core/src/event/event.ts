/**
 * Event System
 *
 * Decoupled pub/sub event system with optional cache integration for multi-instance support
 *
 * @example
 * ```typescript
 * // Define event
 * const userCreated = defineEvent('user.created', Type.Object({
 *     userId: Type.String(),
 * }));
 *
 * // Subscribe (in-memory)
 * userCreated.subscribe((payload) => {
 *     console.log('User created:', payload.userId);
 * });
 *
 * // Emit
 * await userCreated.emit({ userId: '123' });
 *
 * // With cache for multi-instance
 * const event = defineEvent('user.created', schema);
 * await event.useCache(cache);  // Must await before emitting
 * await event.emit({ userId: '123' });  // Broadcast to all instances
 * ```
 */

import type { TSchema, Static } from '@sinclair/typebox';
import { logger } from '@spfn/core/logger';
import type { EventDef, EventHandler, JobQueueSender, PubSubCache } from './types';

const eventLogger = logger.child('@spfn/core:event');

/**
 * Log handler error with consistent format
 */
function logHandlerError(eventName: string, error: unknown): void
{
    eventLogger.error(`Event handler error: ${eventName}`, {
        error: error instanceof Error ? error.message : String(error),
    });
}

/**
 * Log job queue error with consistent format
 */
function logJobQueueError(queueName: string, error: unknown): void
{
    eventLogger.error(`Failed to send event to job queue: ${queueName}`, {
        error: error instanceof Error ? error.message : String(error),
    });
}

/**
 * Create handler subscription manager
 */
function createHandlerManager<TPayload>(name: string)
{
    const handlers: Set<EventHandler<TPayload>> = new Set();

    return {
        add: (handler: EventHandler<TPayload>): (() => void) =>
        {
            handlers.add(handler);
            eventLogger.debug(`Subscribed to event: ${name}`, { handlerCount: handlers.size });

            return () =>
            {
                handlers.delete(handler);
                eventLogger.debug(`Unsubscribed from event: ${name}`, { handlerCount: handlers.size });
            };
        },

        clear: (): void =>
        {
            handlers.clear();
            eventLogger.debug(`Unsubscribed all from event: ${name}`);
        },

        trigger: async (payload: TPayload): Promise<void> =>
        {
            const results = await Promise.allSettled(
                [...handlers].map((handler) => handler(payload))
            );

            for (const result of results)
            {
                if (result.status === 'rejected')
                {
                    logHandlerError(name, result.reason);
                }
            }
        },
    };
}

/**
 * Create job queue manager
 */
function createJobQueueManager(name: string)
{
    const jobQueues: Map<string, JobQueueSender> = new Map();

    return {
        register: (queueName: string, sender: JobQueueSender): void =>
        {
            jobQueues.set(queueName, sender);
            eventLogger.debug(`Registered job queue for event: ${name}`, { queueName });
        },

        send: async (payload: unknown): Promise<void> =>
        {
            if (jobQueues.size === 0)
            {
                return;
            }

            const entries = [...jobQueues.entries()];
            const results = await Promise.allSettled(
                entries.map(([queueName, sender]) => sender(queueName, payload))
            );

            for (const [i, result] of results.entries())
            {
                if (result.status === 'rejected')
                {
                    logJobQueueError(entries[i][0], result.reason);
                }
            }
        },

        get size(): number
        {
            return jobQueues.size;
        },
    };
}

/**
 * Internal: Create event implementation
 */
function createEventImpl<TPayload>(
    name: string,
    schema?: TSchema
): EventDef<TPayload>
{
    const handlerManager = createHandlerManager<TPayload>(name);
    const jobQueueManager = createJobQueueManager(name);
    let cache: PubSubCache | undefined;
    let cacheSubscribed = false;

    const emit = async (payload?: TPayload): Promise<void> =>
    {
        eventLogger.debug(`Emitting event: ${name}`, {
            payload,
            hasCache: !!cache,
            jobQueueCount: jobQueueManager.size,
        });

        if (cache)
        {
            await cache.publish(name, payload);
        }
        else
        {
            await handlerManager.trigger(payload as TPayload);
        }

        await jobQueueManager.send(payload);
        eventLogger.debug(`Event emitted: ${name}`);
    };

    const useCache = async (newCache: PubSubCache): Promise<EventDef<TPayload>> =>
    {
        if (cacheSubscribed)
        {
            eventLogger.warn(`Cache already configured for event: ${name}`);
            return self;
        }

        cache = newCache;
        cacheSubscribed = true;

        await newCache.subscribe(name, async (message: unknown) =>
        {
            eventLogger.debug(`Received event from cache: ${name}`);
            await handlerManager.trigger(message as TPayload);
        });

        eventLogger.debug(`Cache subscription ready for event: ${name}`);
        return self;
    };

    const self: EventDef<TPayload> = {
        name,
        schema,
        subscribe: handlerManager.add,
        unsubscribeAll: handlerManager.clear,
        emit: emit as EventDef<TPayload>['emit'],
        useCache,
        _registerJobQueue: jobQueueManager.register,
        _payload: undefined as unknown as TPayload,
    };

    return self;
}

/**
 * Define an event without payload
 */
export function defineEvent(name: string): EventDef<void>;

/**
 * Define an event with typed payload
 */
export function defineEvent<T extends TSchema>(
    name: string,
    schema: T
): EventDef<Static<T>>;

/**
 * Define an event for decoupled pub/sub
 *
 * @example
 * ```typescript
 * // Define event with payload
 * export const userCreated = defineEvent('user.created', Type.Object({
 *     userId: Type.String(),
 * }));
 *
 * // Subscribe to event (in-memory)
 * const unsubscribe = userCreated.subscribe((payload) => {
 *     console.log('User created:', payload.userId);
 * });
 *
 * // Emit event
 * await userCreated.emit({ userId: '123' });
 *
 * // Unsubscribe when done
 * unsubscribe();
 *
 * // Multi-instance with cache
 * await userCreated.useCache(cache);
 * await userCreated.emit({ userId: '123' });  // Broadcast to all instances
 * ```
 */
export function defineEvent<T extends TSchema>(
    name: string,
    schema?: T
): EventDef<Static<T>> | EventDef
{
    if (schema)
    {
        return createEventImpl<Static<T>>(name, schema);
    }

    return createEventImpl<void>(name);
}
