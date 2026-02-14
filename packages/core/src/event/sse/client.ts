/**
 * SSE Client
 *
 * Type-safe EventSource wrapper for event subscription
 *
 * @example
 * ```typescript
 * import { createSSEClient } from '@spfn/core/event/sse/client';
 * import type { EventRouter } from '@/server/events';
 *
 * // Uses defaults: NEXT_PUBLIC_SPFN_API_URL + /events/stream
 * const client = createSSEClient<EventRouter>();
 *
 * // Or with custom host/pathname
 * const client = createSSEClient<EventRouter>({
 *     host: 'https://api.example.com',
 *     pathname: '/sse',
 * });
 *
 * // With token authentication
 * const client = createSSEClient<EventRouter>({
 *     acquireToken: async () => {
 *         const res = await fetch('/api/events/token', {
 *             method: 'POST',
 *             credentials: 'include',
 *         });
 *         const data = await res.json();
 *         return data.token;
 *     },
 * });
 *
 * const unsubscribe = client.subscribe({
 *     events: ['userCreated', 'orderPlaced'],
 *     handlers: {
 *         userCreated: (payload) => console.log('User:', payload.userId),
 *         orderPlaced: (payload) => console.log('Order:', payload.orderId),
 *     },
 * });
 *
 * // Later: cleanup
 * unsubscribe();
 * ```
 */

import type { EventRouterDef, InferEventNames } from '../router';
import type {
    SSEClientConfig,
    SSESubscribeOptions,
    SSEUnsubscribe,
    SSEConnectionState,
    SSEMessage,
} from './types';

/**
 * SSE Client instance
 */
export interface SSEClient<TRouter extends EventRouterDef<any>>
{
    /**
     * Subscribe to events
     */
    subscribe(options: SSESubscribeOptions<TRouter>): SSEUnsubscribe;

    /**
     * Get current connection state
     */
    getState(): SSEConnectionState;

    /**
     * Close all connections
     */
    close(): void;
}

/**
 * Default SSE configuration
 */
const SSE_DEFAULTS = {
    host: typeof process !== 'undefined'
        ? (process.env.NEXT_PUBLIC_SPFN_API_URL || 'http://localhost:8790')
        : 'http://localhost:8790',
    pathname: '/events/stream',
} as const;

/**
 * Create type-safe SSE client
 *
 * @example
 * ```typescript
 * // Uses defaults (NEXT_PUBLIC_SPFN_API_URL + /events/stream)
 * const client = createSSEClient<EventRouter>();
 *
 * // Or with custom configuration
 * const client = createSSEClient<EventRouter>({
 *     host: 'https://api.example.com',
 *     pathname: '/sse',
 *     reconnect: true,
 *     reconnectDelay: 3000,
 * });
 *
 * // Subscribe to events
 * const unsubscribe = client.subscribe({
 *     events: ['userCreated', 'orderPlaced'],
 *     handlers: {
 *         userCreated: (payload) => {
 *             console.log('New user:', payload.userId);
 *         },
 *         orderPlaced: (payload) => {
 *             console.log('New order:', payload.orderId);
 *         },
 *     },
 *     onOpen: () => console.log('Connected'),
 *     onError: (err) => console.error('Error:', err),
 *     onReconnect: (attempt) => console.log('Reconnecting...', attempt),
 * });
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */
export function createSSEClient<TRouter extends EventRouterDef<any>>(
    config: SSEClientConfig = {}
): SSEClient<TRouter>
{
    const {
        url,
        host = SSE_DEFAULTS.host,
        pathname = SSE_DEFAULTS.pathname,
        reconnect = true,
        reconnectDelay = 3000,
        maxReconnectAttempts = 0,
        withCredentials = false,
        acquireToken,
    } = config;

    // Build base URL: url takes precedence, otherwise host + pathname
    const baseUrl = url || `${host}${pathname}`;

    let eventSource: EventSource | null = null;
    let state: SSEConnectionState = 'closed';
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function subscribe(options: SSESubscribeOptions<TRouter>): SSEUnsubscribe
    {
        const { events, handlers, onOpen, onError, onReconnect } = options;

        const eventNames = events as string[];

        function connect()
        {
            state = 'connecting';

            const init = async () =>
            {
                let tokenParam = '';

                if (acquireToken)
                {
                    const token = await acquireToken();
                    tokenParam = `&token=${encodeURIComponent(token)}`;
                }

                const streamUrl = `${baseUrl}?events=${eventNames.join(',')}${tokenParam}`;

                eventSource = new EventSource(streamUrl, {
                    withCredentials,
                });

                setupEventHandlers(eventSource, eventNames, handlers, onOpen, onError);
                setupReconnect(onReconnect);
            };

            init().catch(() =>
            {
                state = 'error';
                attemptReconnect(onReconnect);
            });
        }

        function setupEventHandlers(
            es: EventSource,
            names: string[],
            handlerMap: SSESubscribeOptions<TRouter>['handlers'],
            onOpenCb?: () => void,
            onErrorCb?: (error: Event) => void
        )
        {
            es.onopen = () =>
            {
                state = 'open';
                reconnectAttempts = 0;
                onOpenCb?.();
            };

            es.onerror = (error) =>
            {
                state = 'error';
                onErrorCb?.(error);
            };

            // Handle connected event (server sends this on connection)
            es.addEventListener('connected', (e: MessageEvent) =>
            {
                try
                {
                    const data = JSON.parse(e.data);
                    console.debug('[SSE] Connected:', data);
                }
                catch
                {
                    // Ignore parse errors
                }
            });

            // Handle ping (keep-alive)
            es.addEventListener('ping', () =>
            {
                // Ping received, connection is alive
            });

            // Register handlers for each event
            for (const eventName of names)
            {
                const handler = (handlerMap as Record<string, ((payload: unknown) => void) | undefined>)[eventName];

                if (!handler)
                {
                    continue;
                }

                es.addEventListener(eventName, (e: MessageEvent) =>
                {
                    try
                    {
                        const message: SSEMessage = JSON.parse(e.data);
                        handler(message.data);
                    }
                    catch (err)
                    {
                        console.error(`[SSE] Failed to parse event "${eventName}":`, err);
                    }
                });
            }
        }

        function setupReconnect(onReconnectCb?: (attempt: number) => void)
        {
            if (!eventSource)
            {
                return;
            }

            const currentEs = eventSource;
            const originalOnError = currentEs.onerror;

            currentEs.onerror = (error) =>
            {
                if (originalOnError)
                {
                    (originalOnError as (ev: Event) => void)(error);
                }

                if (reconnect && currentEs.readyState === EventSource.CLOSED)
                {
                    attemptReconnect(onReconnectCb);
                }
            };
        }

        function attemptReconnect(onReconnectCb?: (attempt: number) => void)
        {
            if (!reconnect)
            {
                return;
            }

            if (maxReconnectAttempts > 0 && reconnectAttempts >= maxReconnectAttempts)
            {
                return;
            }

            reconnectAttempts++;
            onReconnectCb?.(reconnectAttempts);

            reconnectTimer = setTimeout(() =>
            {
                connect();
            }, reconnectDelay);
        }

        // Start connection
        connect();

        // Return unsubscribe function
        return () =>
        {
            if (reconnectTimer)
            {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            if (eventSource)
            {
                eventSource.close();
                eventSource = null;
            }

            state = 'closed';
        };
    }

    function getState(): SSEConnectionState
    {
        return state;
    }

    function close()
    {
        if (reconnectTimer)
        {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }

        if (eventSource)
        {
            eventSource.close();
            eventSource = null;
        }

        state = 'closed';
    }

    return {
        subscribe,
        getState,
        close,
    };
}

/**
 * Simple subscribe function for one-off subscriptions
 *
 * @example
 * ```typescript
 * import { subscribeToEvents } from '@spfn/core/event/sse/client';
 * import type { EventRouter } from '@/server/events';
 *
 * // Using defaults
 * const unsubscribe = subscribeToEvents<EventRouter>(
 *     ['userCreated', 'orderPlaced'],
 *     {
 *         userCreated: (payload) => console.log('User:', payload),
 *         orderPlaced: (payload) => console.log('Order:', payload),
 *     }
 * );
 *
 * // With custom host
 * const unsubscribe = subscribeToEvents<EventRouter>(
 *     ['userCreated'],
 *     { userCreated: (payload) => console.log('User:', payload) },
 *     { host: 'https://api.example.com' }
 * );
 * ```
 */
export function subscribeToEvents<TRouter extends EventRouterDef<any>>(
    events: InferEventNames<TRouter>[],
    handlers: SSESubscribeOptions<TRouter>['handlers'],
    options?: SSEClientConfig
): SSEUnsubscribe
{
    const client = createSSEClient<TRouter>(options);

    return client.subscribe({
        events,
        handlers,
    });
}
