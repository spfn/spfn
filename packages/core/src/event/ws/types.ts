/**
 * WebSocket Types
 */

import type { Context } from 'hono';
import type { EventDef } from '../types';
import type { EventRouterDef, InferEventNames, InferEventPayload } from '../router';
import type { SSETokenStore, SSETokenManager } from '../sse/token-manager';

// ============================================================================
// Router
// ============================================================================

/**
 * WebSocket Router Definition
 *
 * Extends EventRouterDef with client→server message handlers.
 */
export interface WSRouterDef<
    TEvents extends Record<string, EventDef<any>>,
    TMessages extends WSMessageHandlers = WSMessageHandlers
> extends EventRouterDef<TEvents>
{
    messages: TMessages;
}

// ============================================================================
// Message Handling (client → server)
// ============================================================================

/**
 * Low-level WS connection handle passed to message handlers
 */
export interface WSRawConnection
{
    send(type: string, payload: unknown): void;
    close(code?: number, reason?: string): void;
}

/**
 * Context passed to each client→server message handler
 */
export interface WSMessageContext<TPayload = unknown>
{
    payload: TPayload;
    subject?: string;
    ws: WSRawConnection;
}

/**
 * Single message handler function
 */
export type WSMessageHandlerFn<TPayload = unknown> =
    (ctx: WSMessageContext<TPayload>) => void | Promise<void>;

/**
 * Map of message type name → handler
 */
export type WSMessageHandlers = Record<string, WSMessageHandlerFn<any>>;

// ============================================================================
// Auth Config
// ============================================================================

/**
 * WebSocket auth configuration (internal, non-generic)
 */
export interface WSHandlerAuthConfig
{
    enabled?: boolean;
    tokenTtl?: number;
    store?: SSETokenStore;
    tokenManager?: SSETokenManager | (() => SSETokenManager);

    /**
     * Extract subject from Hono context (used on token-issue endpoint)
     * @default (c) => c.get('auth')?.userId ?? null
     */
    getSubject?: (c: Context) => string | null;

    /**
     * Authorize event subscriptions on connect
     * Return allowed events subset. Empty array = 403 rejection.
     */
    authorize?: (subject: string, events: string[]) => Promise<string[]> | string[];

    /**
     * Per-event payload filter (called on every emission)
     * Return false to skip sending the event to this client.
     */
    filter?: Record<string, (subject: string, payload: unknown) => boolean>;
}

/**
 * WebSocket auth configuration (user-facing, generic)
 */
export interface WSAuthConfig<TRouter extends WSRouterDef<any, any>>
{
    enabled?: boolean;
    tokenTtl?: number;
    store?: SSETokenStore;
    tokenManager?: SSETokenManager | (() => SSETokenManager);
    getSubject?: (c: Context) => string | null;
    authorize?: (
        subject: string,
        events: InferEventNames<TRouter>[]
    ) => Promise<InferEventNames<TRouter>[]> | InferEventNames<TRouter>[];
    filter?: {
        [K in InferEventNames<TRouter>]?: (
            subject: string,
            payload: InferEventPayload<TRouter, K>
        ) => boolean;
    };
}

// ============================================================================
// Handler Config
// ============================================================================

/**
 * Configuration for the WebSocket server handler
 */
export interface WSHandlerConfig
{
    /**
     * Keep-alive ping interval in ms
     * @default 30000
     */
    pingInterval?: number;

    /**
     * Authentication and authorization configuration
     */
    auth?: WSHandlerAuthConfig;
}

// ============================================================================
// Client Config
// ============================================================================

/**
 * WebSocket client configuration
 */
export interface WSClientConfig
{
    /**
     * Backend API host URL (ws:// or wss://)
     * @default derived from NEXT_PUBLIC_SPFN_API_URL
     */
    host?: string;

    /**
     * WS endpoint pathname
     * @default '/ws'
     */
    pathname?: string;

    /**
     * Auto reconnect on disconnect
     * @default true
     */
    reconnect?: boolean;

    /**
     * Reconnect delay in ms
     * @default 3000
     */
    reconnectDelay?: number;

    /**
     * Maximum reconnect attempts (0 = infinite)
     * @default 0
     */
    maxReconnectAttempts?: number;

    /**
     * Acquire a one-time token before connecting
     */
    acquireToken?: () => Promise<string>;
}

// ============================================================================
// Client Instance
// ============================================================================

/**
 * WebSocket connection state
 */
export type WSConnectionState = 'connecting' | 'open' | 'closed' | 'error';

/**
 * Event handlers map for WSRouterDef
 */
export type WSEventHandlers<TRouter extends WSRouterDef<any, any>> = {
    [K in InferEventNames<TRouter>]?: (payload: InferEventPayload<TRouter, K>) => void;
};

/**
 * Subscribe options
 */
export interface WSSubscribeOptions<TRouter extends WSRouterDef<any, any>>
{
    events: InferEventNames<TRouter>[];
    handlers: WSEventHandlers<TRouter>;
    onOpen?: () => void;
    onError?: (error: Event) => void;
    onClose?: () => void;
    onReconnect?: (attempt: number) => void;
}

/**
 * Unsubscribe function
 */
export type WSUnsubscribe = () => void;
