/**
 * WebSocket Handler
 *
 * Attaches a WebSocket server to an existing Node.js http.Server.
 * Handles authentication, event subscription, and client message routing.
 */

import type { Server } from 'node:http';
import type { EventDef } from '../types';
import type {
    WSRouterDef,
    WSHandlerConfig,
    WSHandlerAuthConfig,
    WSMessageHandlers,
    WSRawConnection,
} from './types';
import type { SSETokenManager } from '../sse/token-manager';
import { logger } from '@spfn/core/logger';

const wsLogger = logger.child('@spfn/core:ws');

// ============================================================================
// Public API
// ============================================================================

/**
 * Attach a WebSocket server to a Node.js http.Server
 *
 * @returns cleanup function that closes the WebSocket server
 */
export async function attachWSHandler<
    TEvents extends Record<string, EventDef<any>>,
    TMessages extends WSMessageHandlers
>(
    server: Server,
    router: WSRouterDef<TEvents, TMessages>,
    config: WSHandlerConfig & { path?: string } = {},
    tokenManager?: SSETokenManager
): Promise<() => Promise<void>>
{
    const WebSocketServer = await loadWSServer();

    const {
        pingInterval = 30000,
        path = '/ws',
        auth: authConfig,
    } = config;

    const wss = new WebSocketServer({ server, path });

    // Track live connections for graceful shutdown
    const clients = new Set<any>();

    wss.on('connection', (ws: any, req: any) =>
    {
        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
        handleConnection(ws, req, router, authConfig, tokenManager, pingInterval);
    });

    wss.on('error', (err: Error) =>
    {
        wsLogger.error('WebSocket server error', err);
    });

    wsLogger.info(`✓ WebSocket endpoint registered at ${path}`, {
        events: router.eventNames,
        auth: !!authConfig?.enabled,
    });

    return () => new Promise<void>((resolve, reject) =>
    {
        // Close all existing connections with 1001 Going Away
        for (const client of clients)
        {
            client.close(1001, 'Server shutting down');
        }
        clients.clear();

        wss.close((err?: Error) =>
        {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ============================================================================
// Connection Handler
// ============================================================================

async function handleConnection(
    ws: any,
    req: any,
    router: WSRouterDef<any, any>,
    authConfig: WSHandlerAuthConfig | undefined,
    tokenManager: SSETokenManager | undefined,
    pingInterval: number
): Promise<void>
{
    const url = parseURL(req);
    if (!url)
    {
        ws.close(1002, 'Invalid request URL');
        return;
    }

    // ── 1. Authenticate ──
    const subject = await resolveSubject(url, tokenManager);
    if (subject === false)
    {
        ws.close(4001, 'Missing token');
        return;
    }
    if (subject === null)
    {
        ws.close(4001, 'Invalid or expired token');
        return;
    }

    // ── 2. Resolve subscribed events ──
    const requestedEvents = parseRequestedEvents(url, router.eventNames as string[]);

    // ── 3. Authorize ──
    const allowedEvents = await resolveAllowedEvents(subject, requestedEvents, authConfig);
    if (allowedEvents === null)
    {
        ws.close(4003, 'Not authorized for any requested events');
        return;
    }

    wsLogger.info('WebSocket connection established', {
        events: allowedEvents,
        subject: subject ?? undefined,
    });

    // ── 4. Build connection wrapper ──
    const connection = createConnection(ws);

    // ── 5. Subscribe to server-push events ──
    const unsubscribes = subscribeEvents(ws, router, allowedEvents, subject, authConfig);

    // ── 6. Handle incoming messages ──
    ws.on('message', (data: Buffer | string) =>
    {
        onClientMessage(data, router, connection, subject);
    });

    // ── 7. Keep-alive ping ──
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    if (pingInterval > 0)
    {
        pingTimer = setInterval(() =>
        {
            if (ws.readyState === 1) ws.ping();
        }, pingInterval);
    }

    // ── 8. Cleanup on disconnect ──
    ws.on('close', () =>
    {
        clearInterval(pingTimer);
        unsubscribes.forEach(fn => fn());
        wsLogger.info('WebSocket connection closed', { events: allowedEvents });
    });

    // ── 9. Send connected ack ──
    connection.send('__connected', {
        subscribedEvents: allowedEvents,
        timestamp: Date.now(),
    });
}

// ============================================================================
// Helpers
// ============================================================================

function parseURL(req: any): URL | null
{
    try
    {
        return new URL(req.url ?? '/', 'ws://localhost');
    }
    catch
    {
        return null;
    }
}

/**
 * Resolve subject from token
 * - undefined: no auth required
 * - false: token param missing (when required)
 * - null: token invalid/expired
 * - string: authenticated subject
 */
async function resolveSubject(
    url: URL,
    tokenManager?: SSETokenManager
): Promise<string | undefined | false | null>
{
    if (!tokenManager)
    {
        return undefined;
    }

    const token = url.searchParams.get('token');
    if (!token)
    {
        return false;
    }

    return await tokenManager.verify(token);
}

function parseRequestedEvents(url: URL, validEventNames: string[]): string[]
{
    const eventsParam = url.searchParams.get('events');
    if (!eventsParam)
    {
        return validEventNames; // subscribe all if none specified
    }

    return eventsParam
        .split(',')
        .map(e => e.trim())
        .filter(e => validEventNames.includes(e));
}

async function resolveAllowedEvents(
    subject: string | undefined,
    requestedEvents: string[],
    authConfig?: WSHandlerAuthConfig
): Promise<string[] | null>
{
    if (!subject || !authConfig?.authorize)
    {
        return requestedEvents;
    }

    const allowed = await authConfig.authorize(subject, requestedEvents);
    return allowed.length === 0 ? null : allowed;
}

function createConnection(ws: any): WSRawConnection
{
    return {
        send: (type, payload) =>
        {
            if (ws.readyState !== 1) return;
            ws.send(JSON.stringify({ type, data: payload }));
        },
        close: (code, reason) => ws.close(code, reason),
    };
}

function subscribeEvents(
    ws: any,
    router: WSRouterDef<any, any>,
    allowedEvents: string[],
    subject: string | undefined,
    authConfig?: WSHandlerAuthConfig
): (() => void)[]
{
    const unsubscribes: (() => void)[] = [];

    for (const eventName of allowedEvents)
    {
        const eventDef = router.events[eventName];
        if (!eventDef) continue;

        const unsubscribe = eventDef.subscribe((payload: unknown) =>
        {
            if (ws.readyState !== 1) return;

            if (subject && authConfig?.filter?.[eventName])
            {
                if (!authConfig.filter[eventName](subject, payload)) return;
            }

            ws.send(JSON.stringify({ type: eventName, data: payload }));
        });

        unsubscribes.push(unsubscribe);
    }

    return unsubscribes;
}

async function onClientMessage(
    data: Buffer | string,
    router: WSRouterDef<any, any>,
    connection: WSRawConnection,
    subject: string | undefined
): Promise<void>
{
    let message: { type?: string; data?: unknown };

    try
    {
        message = JSON.parse(data.toString());
    }
    catch
    {
        return;
    }

    const { type, data: payload } = message;
    if (!type) return;

    const handler = router.messages[type];
    if (!handler) return;

    try
    {
        await handler({ payload, subject, ws: connection });
    }
    catch (err)
    {
        wsLogger.error(`WebSocket message handler error: ${type}`, err as Error);
    }
}

// ============================================================================
// Dynamic import for optional 'ws' dependency
// ============================================================================

async function loadWSServer(): Promise<any>
{
    try
    {
        // ws is a CJS package: module.exports = WebSocket, WebSocket.WebSocketServer is set on it.
        // ESM dynamic import wraps CJS default export under .default
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod = await import('ws') as any;
        const WS = mod.default ?? mod;
        return WS.WebSocketServer ?? WS.Server;
    }
    catch
    {
        throw new Error(
            '@spfn/core WebSocket support requires the "ws" package.\n' +
            'Install it with: pnpm add ws'
        );
    }
}
