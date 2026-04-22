/**
 * WebSocket Client
 *
 * Type-safe browser WebSocket wrapper for event subscription and bidirectional messaging.
 *
 * @example
 * ```typescript
 * import { createWSClient } from '@spfn/core/event/ws/client';
 * import type { WSRouter } from '@/server/ws';
 *
 * const client = createWSClient<WSRouter>();
 *
 * const unsubscribe = client.subscribe({
 *     events: ['userUpdated', 'notification'],
 *     handlers: {
 *         userUpdated: ({ userId }) => console.log(userId),
 *         notification: ({ message }) => console.log(message),
 *     },
 *     onOpen: () => console.log('connected'),
 * });
 *
 * // Send message to server
 * client.send('ping', {});
 *
 * // Cleanup
 * unsubscribe();
 * ```
 */

import type { WSRouterDef, WSClientConfig, WSSubscribeOptions, WSUnsubscribe, WSConnectionState } from './types';

// ============================================================================
// Public Interface
// ============================================================================

export interface WSClient<TRouter extends WSRouterDef<any, any>>
{
    /**
     * Subscribe to server-push events
     * Returns an unsubscribe function
     */
    subscribe(options: WSSubscribeOptions<TRouter>): WSUnsubscribe;

    /**
     * Send a message to the server
     */
    send<TType extends string>(
        type: TType,
        payload: unknown
    ): void;

    /**
     * Get current connection state
     */
    getState(): WSConnectionState;

    /**
     * Close the connection permanently
     */
    close(): void;
}

// ============================================================================
// Defaults
// ============================================================================

function deriveWSHost(): string
{
    const apiUrl = typeof process !== 'undefined'
        ? (process.env.NEXT_PUBLIC_SPFN_API_URL || 'http://localhost:8790')
        : 'http://localhost:8790';

    return apiUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');
}

const WS_DEFAULTS = {
    get host() { return deriveWSHost(); },
    pathname: '/ws',
} as const;

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a type-safe WebSocket client
 */
export function createWSClient<TRouter extends WSRouterDef<any, any>>(
    config: WSClientConfig = {}
): WSClient<TRouter>
{
    const {
        host = WS_DEFAULTS.host,
        pathname = WS_DEFAULTS.pathname,
        reconnect = true,
        reconnectDelay = 3000,
        maxReconnectAttempts = 0,
        acquireToken,
    } = config;

    const baseUrl = `${host}${pathname}`;

    let socket: WebSocket | null = null;
    let state: WSConnectionState = 'closed';
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;
    // Events the current open connection is subscribed to
    let connectedEvents: Set<string> = new Set();

    // Active subscriptions: each entry is one subscribe() call
    type Subscription = {
        options: WSSubscribeOptions<TRouter>;
        active: boolean;
    };
    const subscriptions: Set<Subscription> = new Set();

    // ── Internal helpers ──

    function setState(next: WSConnectionState)
    {
        state = next;
    }

    function buildURL(events: string[], token?: string): string
    {
        const params = new URLSearchParams();
        params.set('events', events.join(','));
        if (token) params.set('token', token);
        return `${baseUrl}?${params.toString()}`;
    }

    function mergeEventNames(): string[]
    {
        const names = new Set<string>();
        for (const sub of subscriptions)
        {
            if (sub.active)
            {
                (sub.options.events as string[]).forEach(e => names.add(e));
            }
        }
        return [...names];
    }

    function dispatch(type: string, payload: unknown)
    {
        for (const sub of subscriptions)
        {
            if (!sub.active) continue;
            const handler = (sub.options.handlers as Record<string, ((p: unknown) => void) | undefined>)[type];
            if (handler) handler(payload);
        }
    }

    function onOpen()
    {
        setState('open');
        reconnectAttempts = 0;
        connectedEvents = new Set(mergeEventNames());
        for (const sub of subscriptions)
        {
            if (sub.active) sub.options.onOpen?.();
        }
    }

    function onError(evt: Event)
    {
        setState('error');
        for (const sub of subscriptions)
        {
            if (sub.active) sub.options.onError?.(evt);
        }
    }

    function onClose()
    {
        socket = null;
        connectedEvents = new Set();

        if (destroyed)
        {
            setState('closed');
            for (const sub of subscriptions)
            {
                if (sub.active)
                {
                    sub.options.onClose?.();
                    sub.active = false;
                }
            }
            subscriptions.clear();
            return;
        }

        const hasActive = [...subscriptions].some(s => s.active);
        if (!reconnect || !hasActive)
        {
            setState('closed');
            return;
        }

        if (maxReconnectAttempts > 0 && reconnectAttempts >= maxReconnectAttempts)
        {
            setState('closed');
            for (const sub of subscriptions)
            {
                if (sub.active)
                {
                    sub.options.onClose?.();
                    sub.active = false;
                }
            }
            subscriptions.clear();
            return;
        }

        reconnectAttempts++;
        for (const sub of subscriptions)
        {
            if (sub.active) sub.options.onReconnect?.(reconnectAttempts);
        }

        reconnectTimer = setTimeout(() => connect(), reconnectDelay);
    }

    function onMessage(evt: MessageEvent)
    {
        let msg: { type?: string; data?: unknown };
        try
        {
            msg = JSON.parse(evt.data as string);
        }
        catch
        {
            return;
        }

        const { type, data } = msg;
        if (!type || type === '__connected') return;

        dispatch(type, data);
    }

    async function connect()
    {
        if (destroyed) return;

        const events = mergeEventNames();
        if (events.length === 0) return;

        setState('connecting');

        let token: string | undefined;
        if (acquireToken)
        {
            try
            {
                token = await acquireToken();
            }
            catch
            {
                setState('error');
                const errorEvent = new Event('error');
                for (const sub of subscriptions)
                {
                    if (sub.active) sub.options.onError?.(errorEvent);
                }
                // Schedule reconnect so transient token failures recover automatically
                if (reconnect && !destroyed)
                {
                    reconnectAttempts++;
                    for (const sub of subscriptions)
                    {
                        if (sub.active) sub.options.onReconnect?.(reconnectAttempts);
                    }
                    reconnectTimer = setTimeout(() => connect(), reconnectDelay);
                }
                return;
            }
        }

        const url = buildURL(events, token);
        socket = new WebSocket(url);
        socket.onopen = onOpen;
        socket.onerror = onError;
        socket.onclose = onClose;
        socket.onmessage = onMessage;
    }

    // ── Public API ──

    function subscribe(options: WSSubscribeOptions<TRouter>): WSUnsubscribe
    {
        const sub: Subscription = { options, active: true };
        subscriptions.add(sub);

        if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING)
        {
            if (reconnectTimer)
            {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            connect();
        }
        else if (socket.readyState === WebSocket.OPEN)
        {
            // Reconnect if the new subscription requests events not yet subscribed
            const hasNewEvents = (options.events as string[]).some(e => !connectedEvents.has(e));
            if (hasNewEvents)
            {
                socket.close();  // triggers onClose → reconnect with merged event set
            }
        }

        return () =>
        {
            sub.active = false;
            subscriptions.delete(sub);
            options.onClose?.();

            const hasActive = [...subscriptions].some(s => s.active);
            if (!hasActive && socket)
            {
                socket.close();
            }
        };
    }

    function send(type: string, payload: unknown): void
    {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.send(JSON.stringify({ type, data: payload }));
    }

    function close(): void
    {
        destroyed = true;
        if (reconnectTimer)
        {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        if (socket)
        {
            socket.close();
        }
    }

    return {
        subscribe,
        send,
        getState: () => state,
        close,
    };
}
