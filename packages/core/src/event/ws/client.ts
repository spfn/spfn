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
    // Set before intentionally closing socket (new events merge) — skips delay/counter in onClose
    let intentionalReconnect = false;
    // Events actually sent in the current/last connect() URL
    let sentEvents: Set<string> = new Set();
    // Events the server confirmed it has subscribed (set on onOpen)
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
        // Use sentEvents (what was in the URL), not mergeEventNames()
        // New subscriptions added during CONNECTING are NOT yet on the server
        connectedEvents = new Set(sentEvents);

        // Check reconnect need BEFORE firing callbacks to avoid spurious onOpen calls
        const current = mergeEventNames();
        const hasNewEvents = current.some(e => !connectedEvents.has(e));
        if (hasNewEvents)
        {
            intentionalReconnect = true;
            socket?.close();
            return;
        }

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
        sentEvents = new Set();

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

        // Intentional reconnect (new events merged): skip delay, counter, and callbacks
        if (intentionalReconnect)
        {
            intentionalReconnect = false;
            connect();
            return;
        }

        const hasActive = [...subscriptions].some(s => s.active);
        if (!reconnect || !hasActive)
        {
            setState('closed');
            if (!reconnect && hasActive)
            {
                for (const sub of subscriptions)
                {
                    if (sub.active)
                    {
                        sub.options.onClose?.();
                        sub.active = false;
                    }
                }
                subscriptions.clear();
            }
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

        setState('closed');
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
        if (state === 'connecting') return;

        const events = mergeEventNames();
        if (events.length === 0) return;

        sentEvents = new Set(events);  // record what we're sending in the URL
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

                const permanentlyClose = destroyed || !reconnect
                    || (maxReconnectAttempts > 0 && reconnectAttempts >= maxReconnectAttempts);

                if (permanentlyClose)
                {
                    setState('closed');
                    sentEvents = new Set();
                    for (const sub of subscriptions)
                    {
                        if (sub.active) { sub.options.onClose?.(); sub.active = false; }
                    }
                    subscriptions.clear();
                    return;
                }

                reconnectAttempts++;
                for (const sub of subscriptions)
                {
                    if (sub.active) sub.options.onReconnect?.(reconnectAttempts);
                }
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(() => connect(), reconnectDelay);
                return;
            }

            // close() may have been called while awaiting the token
            if (destroyed)
            {
                setState('closed');
                sentEvents = new Set();
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

            // Subscriptions may have changed while awaiting the token — recompute
            const currentEvents = mergeEventNames();
            if (currentEvents.length === 0)
            {
                setState('closed');
                sentEvents = new Set();
                return;
            }
            // Update sentEvents to reflect what we're actually connecting with
            if (currentEvents.some(e => !sentEvents.has(e)) || sentEvents.size !== currentEvents.length)
            {
                sentEvents = new Set(currentEvents);
            }
        }

        const url = buildURL([...sentEvents], token);
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

        if (state === 'closed' || state === 'error')
        {
            if (reconnectTimer)
            {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
            connect();
        }
        else if (state === 'open')
        {
            // Reconnect if the new subscription requests events not yet subscribed
            const hasNewEvents = (options.events as string[]).some(e => !connectedEvents.has(e));
            if (hasNewEvents)
            {
                intentionalReconnect = true;
                socket!.close();  // triggers onClose → connect() immediately, no delay/counter
            }
        }
        // state === 'connecting': onOpen will detect new events and do intentionalReconnect

        return () =>
        {
            if (!sub.active) return;
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
