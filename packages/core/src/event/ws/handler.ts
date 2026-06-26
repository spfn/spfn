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
    TMessages extends WSMessageHandlers,
>(
    server: Server,
    router: WSRouterDef<TEvents, TMessages>,
    config: WSHandlerConfig & { path?: string } = {},
    tokenManager?: SSETokenManager,
): Promise<() => Promise<void>>
{
    const WebSocketServer = await loadWSServer();

    const {
        pingInterval = 30000,
        path = '/ws',
        maxPayload = 1_048_576,
        maxBufferedBytes = 1_048_576,
        maxConnections = 10_000,
        maxConnectionsPerSubject = 0,
        auth: authConfig,
    } = config;

    if (authConfig?.enabled && !tokenManager)
    {
        throw new Error(
            'WebSocket auth.enabled=true requires a tokenManager. ' +
            'Pass tokenManager or use .websockets(router, { auth: { enabled: true } }) via startServer.',
        );
    }

    const wss = new WebSocketServer({ server, path, maxPayload });

    // Track live connections for graceful shutdown
    const clients = new Set<any>();
    // Live connection count per authenticated subject (for the per-subject cap)
    const subjectCounts = new Map<string, number>();

    wss.on('connection', (ws: any, req: any) =>
    {
        // Global connection cap — reject before doing any work
        if (clients.size >= maxConnections)
        {
            ws.close(1013, 'Server at capacity');

            return;
        }

        clients.add(ws);
        ws.on('close', () => clients.delete(ws));
        handleConnection(ws, req, router, authConfig, tokenManager, {
            pingInterval,
            maxBufferedBytes,
            maxConnectionsPerSubject,
            subjectCounts,
        })
            .catch((err: Error) =>
            {
                wsLogger.error('WebSocket connection handler error', err);
                if (ws.readyState === 1) ws.close(1011, 'Internal server error');
            });
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

interface ConnectionOptions
{
    pingInterval: number;
    maxBufferedBytes: number;
    maxConnectionsPerSubject: number;
    subjectCounts: Map<string, number>;
}

async function handleConnection(
    ws: any,
    req: any,
    router: WSRouterDef<any, any>,
    authConfig: WSHandlerAuthConfig | undefined,
    tokenManager: SSETokenManager | undefined,
    opts: ConnectionOptions,
): Promise<void>
{
    const { pingInterval, maxBufferedBytes, maxConnectionsPerSubject, subjectCounts } = opts;
    // Register close handler before any await — ensures we never miss the event even during auth
    let pingTimer: ReturnType<typeof setInterval> | undefined;
    let connectionUnsubscribes: (() => void)[] = [];
    let subscribedEvents: string[] = [];
    ws.on('close', () =>
    {
        clearInterval(pingTimer);
        connectionUnsubscribes.forEach(fn => fn());
        if (subscribedEvents.length > 0)
            wsLogger.info('WebSocket connection closed', { events: subscribedEvents });
    });

    const url = parseURL(req);
    if (!url)
    {
        ws.close(1002, 'Invalid request URL');

        return;
    }

    // ── 1. Authenticate ──
    const subject = await resolveSubject(url, authConfig?.enabled ? tokenManager : undefined);
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
    if (requestedEvents.length === 0)
    {
        ws.close(4000, 'No valid event names specified');

        return;
    }

    // ── 3. Authorize ──
    const allowedEvents = await resolveAllowedEvents(subject, requestedEvents, authConfig);
    if (allowedEvents === null)
    {
        ws.close(4003, 'Not authorized for any requested events');

        return;
    }

    // ── Per-subject connection cap (authenticated subjects only) ──
    if (maxConnectionsPerSubject > 0 && typeof subject === 'string')
    {
        const current = subjectCounts.get(subject) ?? 0;
        if (current >= maxConnectionsPerSubject)
        {
            ws.close(1013, 'Too many connections for this subject');

            return;
        }

        subjectCounts.set(subject, current + 1);
        ws.on('close', () =>
        {
            const remaining = (subjectCounts.get(subject) ?? 1) - 1;
            if (remaining <= 0) subjectCounts.delete(subject);
            else subjectCounts.set(subject, remaining);
        });
    }

    subscribedEvents = allowedEvents;
    wsLogger.info('WebSocket connection established', {
        events: allowedEvents,
        subject: subject ?? undefined,
    });

    // ── 4. Build connection wrapper ──
    const connection = createConnection(ws, maxBufferedBytes);

    // ── 5. Subscribe to server-push events ──
    connectionUnsubscribes = subscribeEvents(ws, router, allowedEvents, subject, authConfig, maxBufferedBytes);

    // If socket closed during auth awaits, clean up and bail
    if (ws.readyState !== 1)
    {
        connectionUnsubscribes.forEach(fn => fn());
        connectionUnsubscribes = [];

        return;
    }

    // ── 6. Handle incoming messages ──
    ws.on('message', (data: Buffer | string) =>
    {
        onClientMessage(data, router, connection, subject)
            .catch((err: Error) => wsLogger.error('Unhandled message error', err));
    });

    // ── 7. Keep-alive ping with liveness (pong) tracking ──
    // Without reaping un-ponged sockets, a half-open connection (sleeping device,
    // NAT drop with no FIN) lingers with its subscriptions, timer, and buffers.
    if (pingInterval > 0)
    {
        ws.isAlive = true;
        ws.on('pong', () =>
        {
            ws.isAlive = true;
        });

        pingTimer = setInterval(() =>
        {
            if (ws.readyState !== 1) return;

            if (ws.isAlive === false)
            {
                // No pong since the previous tick — drop the dead/half-open socket
                ws.terminate();

                return;
            }

            ws.isAlive = false;
            ws.ping();
        }, pingInterval);
    }

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
    tokenManager?: SSETokenManager,
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
        return [];
    }

    return eventsParam
        .split(',')
        .map(e => e.trim())
        .filter(e => validEventNames.includes(e));
}

async function resolveAllowedEvents(
    subject: string | undefined,
    requestedEvents: string[],
    authConfig?: WSHandlerAuthConfig,
): Promise<string[] | null>
{
    if (!subject || !authConfig?.authorize)
    {
        return requestedEvents;
    }

    const allowed = await authConfig.authorize(subject, requestedEvents);

    return allowed.length === 0 ? null : allowed;
}

/**
 * Send a JSON frame with backpressure protection. If the socket's outbound
 * buffer is already past the cap, the consumer is too slow — close the
 * connection (1013) instead of buffering more and risking OOM. The client
 * reconnects and re-subscribes.
 */
export function safeSend(ws: any, frame: unknown, maxBufferedBytes: number): void
{
    if (ws.readyState !== 1) return;

    if (ws.bufferedAmount > maxBufferedBytes)
    {
        ws.close(1013, 'Send buffer overflow');

        return;
    }

    try
    {
        ws.send(JSON.stringify(frame));
    }
    catch
    {
        // Socket closed between the readyState check and send — ignore
    }
}

function createConnection(ws: any, maxBufferedBytes: number): WSRawConnection
{
    return {
        send: (type, payload) => safeSend(ws, { type, data: payload }, maxBufferedBytes),
        close: (code, reason) => ws.close(code, reason),
    };
}

function subscribeEvents(
    ws: any,
    router: WSRouterDef<any, any>,
    allowedEvents: string[],
    subject: string | undefined,
    authConfig: WSHandlerAuthConfig | undefined,
    maxBufferedBytes: number,
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

            safeSend(ws, { type: eventName, data: payload }, maxBufferedBytes);
        });

        unsubscribes.push(unsubscribe);
    }

    return unsubscribes;
}

async function onClientMessage(
    data: Buffer | string,
    router: WSRouterDef<any, any>,
    connection: WSRawConnection,
    subject: string | undefined,
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
         
        const mod = await import('ws') as any;
        const WS = mod.default ?? mod;
        const WSS = WS.WebSocketServer ?? WS.Server;

        if (typeof WSS !== 'function')
        {
            throw new Error(
                'WebSocketServer not found in ws module. ' +
                'Ensure ws@^8 is installed: pnpm add ws',
            );
        }

        return WSS;
    }
    catch (err)
    {
        if (err instanceof Error && err.message.includes('WebSocketServer not found'))
        {
            throw err;
        }
        throw new Error(
            '@spfn/core WebSocket support requires the "ws" package.\n' +
            'Install it with: pnpm add ws',
        );
    }
}
