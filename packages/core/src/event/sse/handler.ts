/**
 * SSE Handler for Hono
 *
 * Creates SSE stream endpoint for event subscription
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { createSSEHandler } from '@spfn/core/event/sse';
 * import { eventRouter } from './events';
 *
 * const app = new Hono();
 *
 * // GET /events/stream?events=userCreated,orderPlaced
 * app.get('/events/stream', createSSEHandler(eventRouter));
 * ```
 */

import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { logger } from '@spfn/core/logger';
import type { EventRouterDef, InferEventNames } from '../router';
import type { SSEHandlerConfig } from './types';

const sseLogger = logger.child('@spfn/core:sse');

/**
 * Create SSE handler for Hono
 *
 * Query parameters:
 * - events: Comma-separated list of event names to subscribe
 *
 * @example
 * ```typescript
 * app.get('/events/stream', createSSEHandler(eventRouter, {
 *     pingInterval: 30000,
 * }));
 * ```
 */
export function createSSEHandler<TRouter extends EventRouterDef<any>>(
    router: TRouter,
    config: SSEHandlerConfig = {}
)
{
    const {
        pingInterval = 30000,
        // headers: customHeaders = {},  // Reserved for future use
    } = config;

    return async (c: Context) =>
    {
        // Parse events from query parameter
        const eventsParam = c.req.query('events');

        if (!eventsParam)
        {
            return c.json({ error: 'Missing events parameter' }, 400);
        }

        const requestedEvents = eventsParam.split(',').map(e => e.trim());

        // Validate event names
        const validEventNames = router.eventNames as string[];
        const invalidEvents = requestedEvents.filter(e => !validEventNames.includes(e));

        if (invalidEvents.length > 0)
        {
            return c.json({
                error: 'Invalid event names',
                invalidEvents,
                validEvents: validEventNames,
            }, 400);
        }

        sseLogger.debug('SSE connection requested', {
            events: requestedEvents,
            clientIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        });

        // Start SSE stream
        return streamSSE(c, async (stream) =>
        {
            const unsubscribes: (() => void)[] = [];
            let messageId = 0;

            // Subscribe to each requested event
            for (const eventName of requestedEvents as InferEventNames<TRouter>[])
            {
                const eventDef = router.events[eventName];

                if (!eventDef)
                {
                    continue;
                }

                const unsubscribe = eventDef.subscribe((payload: unknown) =>
                {
                    messageId++;

                    const message = {
                        event: eventName,
                        data: payload,
                    };

                    sseLogger.debug('SSE sending event', {
                        event: eventName,
                        messageId,
                    });

                    // Fire-and-forget in sync callback
                    void stream.writeSSE({
                        id: String(messageId),
                        event: eventName as string,
                        data: JSON.stringify(message),
                    });
                });

                unsubscribes.push(unsubscribe);
            }

            sseLogger.info('SSE connection established', {
                events: requestedEvents,
                subscriptionCount: unsubscribes.length,
            });

            // Send initial connection message
            await stream.writeSSE({
                event: 'connected',
                data: JSON.stringify({
                    subscribedEvents: requestedEvents,
                    timestamp: Date.now(),
                }),
            });

            // Keep-alive ping
            const pingTimer = setInterval(() =>
            {
                // Fire-and-forget in sync callback
                void stream.writeSSE({
                    event: 'ping',
                    data: JSON.stringify({ timestamp: Date.now() }),
                });
            }, pingInterval);

            // Wait for client disconnect using abort signal
            const abortSignal = c.req.raw.signal;

            while (!abortSignal.aborted)
            {
                await stream.sleep(pingInterval);
            }

            // Cleanup
            clearInterval(pingTimer);
            unsubscribes.forEach(fn => fn());

            sseLogger.info('SSE connection closed', {
                events: requestedEvents,
            });
        }, async (err: Error) =>
        {
            sseLogger.error('SSE stream error', {
                error: err.message,
            });
        });
    };
}

