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
import type { SSEHandlerConfig, SSEHandlerAuthConfig } from './types';
import type { SSETokenManager } from './token-manager';

const sseLogger = logger.child('@spfn/core:sse');

// Extend Hono context with SSE subject
declare module 'hono'
{
    interface ContextVariableMap
    {
        sseSubject?: string;
    }
}

/**
 * Create SSE handler for Hono
 *
 * Query parameters:
 * - events: Comma-separated list of event names to subscribe
 * - token: One-time auth token (when auth is enabled)
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
    config: SSEHandlerConfig = {},
    tokenManager?: SSETokenManager,
)
{
    const {
        pingInterval = 30000,
        auth: authConfig,
    } = config;

    return async (c: Context) =>
    {
        // ── 1. Token Authentication ──
        const subject = await authenticateToken(c, tokenManager);
        if (subject === false)
        {
            return c.json({ error: 'Missing token parameter' }, 401);
        }
        if (subject === null)
        {
            return c.json({ error: 'Invalid or expired token' }, 401);
        }
        if (subject)
        {
            c.set('sseSubject', subject);
        }

        // ── 2. Parse events from query parameter ──
        const requestedEvents = parseRequestedEvents(c);
        if (!requestedEvents)
        {
            return c.json({ error: 'Missing events parameter' }, 400);
        }

        // ── 3. Validate event names ──
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

        // ── 4. Subscription Authorization ──
        const allowedEvents = await authorizeEvents(subject, requestedEvents, authConfig);
        if (allowedEvents === null)
        {
            return c.json({ error: 'Not authorized for any requested events' }, 403);
        }

        sseLogger.debug('SSE connection requested', {
            events: allowedEvents,
            subject: subject || undefined,
            clientIp: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        });

        // ── 5. SSE Stream ──
        c.header('X-Accel-Buffering', 'no');

        return streamSSE(c, async (stream) =>
        {
            const unsubscribes: (() => void)[] = [];
            let messageId = 0;
            let connectionDead = false;
            let pingTimer: ReturnType<typeof setInterval>;

            const cleanup = () =>
            {
                if (connectionDead) return;
                connectionDead = true;
                clearInterval(pingTimer);
                unsubscribes.forEach(fn => fn());
                sseLogger.info('SSE dead connection cleaned up', {
                    events: allowedEvents,
                });
            };

            for (const eventName of allowedEvents as InferEventNames<TRouter>[])
            {
                const eventDef = router.events[eventName];

                if (!eventDef)
                {
                    continue;
                }

                const unsubscribe = eventDef.subscribe((payload: unknown) =>
                {
                    if (connectionDead) return;

                    // ── Payload Filtering ──
                    if (subject && authConfig?.filter?.[eventName as string])
                    {
                        if (!authConfig.filter[eventName as string](subject, payload))
                        {
                            return;
                        }
                    }

                    messageId++;

                    const message = {
                        event: eventName,
                        data: payload,
                    };

                    sseLogger.debug('SSE sending event', {
                        event: eventName,
                        messageId,
                    });

                    stream.writeSSE({
                        id: String(messageId),
                        event: eventName as string,
                        data: JSON.stringify(message),
                    }).catch((err) =>
                    {
                        sseLogger.warn('SSE write failed', {
                            event: eventName,
                            messageId,
                            error: err.message,
                        });
                        cleanup();
                    });
                });

                unsubscribes.push(unsubscribe);
            }

            sseLogger.info('SSE connection established', {
                events: allowedEvents,
                subscriptionCount: unsubscribes.length,
            });

            // Send initial connection message
            await stream.writeSSE({
                event: 'connected',
                data: JSON.stringify({
                    subscribedEvents: allowedEvents,
                    timestamp: Date.now(),
                }),
            });

            // Keep-alive ping
            pingTimer = setInterval(() =>
            {
                if (connectionDead) return;

                stream.writeSSE({
                    event: 'ping',
                    data: JSON.stringify({ timestamp: Date.now() }),
                }).catch((err) =>
                {
                    sseLogger.warn('SSE ping failed', {
                        error: err.message,
                    });
                    cleanup();
                });
            }, pingInterval);

            // Wait for client disconnect using abort signal
            const abortSignal = c.req.raw.signal;

            while (!abortSignal.aborted && !connectionDead)
            {
                await stream.sleep(pingInterval);
            }

            // Cleanup (normal disconnect path)
            cleanup();
        }, async (err: Error) =>
        {
            sseLogger.error('SSE stream error', {
                error: err.message,
            });
        });
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Authenticate via one-time token
 * @returns subject string if authenticated, undefined if no auth required,
 *          false if token missing, null if token invalid/expired
 */
async function authenticateToken(
    c: Context,
    tokenManager?: SSETokenManager,
): Promise<string | undefined | false | null>
{
    if (!tokenManager)
    {
        return undefined;
    }

    const token = c.req.query('token');
    if (!token)
    {
        return false;
    }

    return await tokenManager.verify(token);
}

/**
 * Parse requested events from query parameter
 */
function parseRequestedEvents(c: Context): string[] | null
{
    const eventsParam = c.req.query('events');
    if (!eventsParam)
    {
        return null;
    }

    return eventsParam.split(',').map(e => e.trim());
}

/**
 * Authorize event subscription via auth hook
 * @returns allowed events array, or null if rejected
 */
async function authorizeEvents(
    subject: string | undefined,
    requestedEvents: string[],
    authConfig?: SSEHandlerAuthConfig,
): Promise<string[] | null>
{
    if (!subject || !authConfig?.authorize)
    {
        return requestedEvents;
    }

    const allowed = await authConfig.authorize(subject, requestedEvents);

    if (allowed.length === 0)
    {
        return null;
    }

    return allowed;
}
