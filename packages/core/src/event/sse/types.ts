/**
 * SSE Types
 *
 * Type definitions for Server-Sent Events
 */

import type { EventRouterDef, InferEventNames, InferEventPayload } from '../router';

/**
 * SSE message sent from server
 */
export interface SSEMessage<TEvent extends string = string, TPayload = unknown>
{
    /** Event name */
    event: TEvent;

    /** Event payload */
    data: TPayload;

    /** Optional message ID for reconnection */
    id?: string;
}

/**
 * SSE Handler configuration
 */
export interface SSEHandlerConfig
{
    /**
     * Keep-alive ping interval in milliseconds
     * @default 30000
     */
    pingInterval?: number;

    /**
     * Custom headers for SSE response
     */
    headers?: Record<string, string>;
}

/**
 * SSE Client configuration
 */
export interface SSEClientConfig
{
    /**
     * Backend API host URL
     * @default NEXT_PUBLIC_SPFN_API_URL || 'http://localhost:8790'
     * @example 'http://localhost:8790'
     * @example 'https://api.example.com'
     */
    host?: string;

    /**
     * SSE endpoint pathname
     * @default '/events/stream'
     */
    pathname?: string;

    /**
     * Full URL (overrides host + pathname)
     * @deprecated Use host and pathname instead
     * @example 'http://localhost:8790/events/stream'
     */
    url?: string;

    /**
     * Auto reconnect on disconnect
     * @default true
     */
    reconnect?: boolean;

    /**
     * Reconnect delay in milliseconds
     * @default 3000
     */
    reconnectDelay?: number;

    /**
     * Maximum reconnect attempts (0 = infinite)
     * @default 0
     */
    maxReconnectAttempts?: number;

    /**
     * Include credentials (cookies) in request
     * @default false
     */
    withCredentials?: boolean;
}

/**
 * Event handler function
 */
export type SSEEventHandler<TPayload> = (payload: TPayload) => void;

/**
 * Event handlers map for EventRouter
 */
export type SSEEventHandlers<TRouter extends EventRouterDef<any>> = {
    [K in InferEventNames<TRouter>]?: SSEEventHandler<InferEventPayload<TRouter, K>>;
};

/**
 * Subscription options
 */
export interface SSESubscribeOptions<TRouter extends EventRouterDef<any>>
{
    /**
     * Events to subscribe
     */
    events: InferEventNames<TRouter>[];

    /**
     * Event handlers
     */
    handlers: SSEEventHandlers<TRouter>;

    /**
     * Called when connection opens
     */
    onOpen?: () => void;

    /**
     * Called on connection error
     */
    onError?: (error: Event) => void;

    /**
     * Called when reconnecting
     */
    onReconnect?: (attempt: number) => void;
}

/**
 * SSE connection state
 */
export type SSEConnectionState = 'connecting' | 'open' | 'closed' | 'error';

/**
 * Unsubscribe function
 */
export type SSEUnsubscribe = () => void;
