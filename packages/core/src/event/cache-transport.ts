/**
 * Event cache transport (Redis/Valkey pub/sub)
 *
 * Wires each event in a router to a shared {@link PubSubCache} so that an
 * `emit` on one pod fans out to subscribers on every pod. This is the runtime
 * glue behind `EventDef.useCache` — applications don't call it directly; the
 * server's `.events()` / `.websockets()` registration calls it at startup when
 * a cache (`CACHE_URL`) is configured. Without a cache, events stay in-process
 * and this is a no-op.
 *
 * Mirrors the auto-detection pattern used by `CacheTokenStore` for SSE tokens.
 */

import { logger } from '@spfn/core/logger';
import type { EventRouterDef } from './router';
import type { PubSubCache } from './types';

const transportLogger = logger.child('@spfn/core:event-transport');

/** Default channel prefix; isolates SPFN event channels from other Redis keys. */
const DEFAULT_CHANNEL_PREFIX = 'spfn:sse:';

/** Cap on the subscriber `quit()` during shutdown so a wedged socket can't stall it. */
const SUBSCRIBER_QUIT_TIMEOUT_MS = 5000;

/**
 * Minimal pub/sub client interface (compatible with ioredis Redis | Cluster).
 * A duplicated connection is required for SUBSCRIBE — ioredis puts a connection
 * into subscriber mode, where regular commands are rejected.
 */
type PubSubClient = {
    publish(channel: string, message: string): Promise<unknown>;
    duplicate(): PubSubClient;
    subscribe(...channels: string[]): Promise<unknown>;
    on(event: string, listener: (...args: any[]) => void): unknown;
    quit?(): Promise<unknown>;
};

type MessageHandler = (message: unknown) => void | Promise<void>;

/** The slice of EventDef this module wires (kept minimal + duck-typed). */
type WirableEvent = {
    name: string;
    useCache: (cache: PubSubCache) => Promise<unknown>;
    _resetCache?: () => void;
};

// ── globalThis singleton ──────────────────────────────────────────
// Survives the CJS/ESM dual-package hazard (same pattern as cache-manager):
// one subscriber connection and one wired-event registry per process. The
// registry holds the EventDefs (not just names) so closeEventTransport can
// reset their cache binding — otherwise the per-event cacheSubscribed latch
// and this state would diverge across a restart in the same process.
interface TransportState
{
    pubSubCache: PubSubCache | undefined;
    subscriber: PubSubClient | undefined;
    channelPrefix: string | undefined;
    wired: Map<string, WirableEvent>;
}

const STATE_KEY = Symbol.for('@spfn/core:event-transport');

const state: TransportState = ((globalThis as any)[STATE_KEY] ??= {
    pubSubCache: undefined,
    subscriber: undefined,
    channelPrefix: undefined,
    wired: new Map<string, WirableEvent>(),
});

/**
 * Resolve the channel prefix: explicit option → env override → default.
 */
function resolveChannelPrefix(override?: string): string
{
    return override ?? process.env.SPFN_SSE_CHANNEL_PREFIX ?? DEFAULT_CHANNEL_PREFIX;
}

/**
 * Build a {@link PubSubCache} backed by a Redis/Valkey client.
 *
 * One duplicated connection is created lazily and shared across every channel.
 * Publish failures are logged and swallowed — SSE is lossy (at-most-once), so a
 * dropped event during a Redis blip must never crash `emit` or kill a stream.
 */
export function createRedisPubSubCache(
    client: PubSubClient,
    channelPrefix: string,
    onSubscriber?: (connection: PubSubClient) => void,
): PubSubCache
{
    let subscriber: PubSubClient | undefined;
    const handlers = new Map<string, MessageHandler>();

    const ensureSubscriber = (): PubSubClient =>
    {
        if (subscriber)
        {
            return subscriber;
        }

        // ioredis re-issues SUBSCRIBE after a reconnect (autoResubscribe, default
        // true). Don't pass it as a duplicate() option — Cluster.duplicate()'s
        // first positional arg is the startup-nodes array, so an options object
        // lands in the wrong slot and is silently dropped. The 'message' listener
        // is attached once and survives reconnects.
        subscriber = client.duplicate();
        onSubscriber?.(subscriber);

        subscriber.on('message', (channel: string, raw: string) =>
        {
            const handler = handlers.get(channel);
            if (!handler)
            {
                return;
            }

            let payload: unknown;
            try
            {
                payload = JSON.parse(raw);
            }
            catch
            {
                transportLogger.warn('Pub/sub message parse failed — dropped', { channel });

                return;
            }

            void handler(payload);
        });

        // ioredis auto-reconnects (and re-subscribes via autoResubscribe above);
        // just surface the blip.
        subscriber.on('error', (err: Error) =>
        {
            transportLogger.warn('Pub/sub subscriber error', { error: err.message });
        });

        return subscriber;
    };

    // Deliver to this pod's own subscribers without the Redis round-trip — the
    // fallback when publish can't reach Redis. Mostly avoids double-delivery (a
    // failed publish usually means Redis never echoed back), but a reply-lost
    // race — Redis broadcast, then the publisher's reply dropped — can deliver
    // both here and via the echo. We accept that rare duplicate over dropping,
    // since SSE is lossy and a frozen stream is worse than a repeated chunk.
    const deliverLocal = (channel: string, message: unknown): void =>
    {
        const handler = handlers.get(channel);
        if (handler)
        {
            void handler(message);
        }
    };

    return {
        publish: async (name: string, message: unknown): Promise<void> =>
        {
            const channel = channelPrefix + name;

            // `string | undefined`: JSON.stringify returns undefined (no throw) for a
            // top-level function/symbol, and throws for bigint/circular. Both mean
            // "can't cross Redis" — handle each as a local-only delivery.
            let serialized: string | undefined;
            try
            {
                // `?? null` so void-payload events serialize to "null" rather than
                // `undefined` (JSON.stringify(undefined) → undefined → publish breaks).
                serialized = JSON.stringify(message ?? null);
            }
            catch (err)
            {
                // Non-serializable payload (bigint, circular ref). Cross-pod is
                // impossible; deliver the live object locally (best effort — a
                // downstream JSON.stringify may re-throw, but better than dropping).
                transportLogger.warn('Pub/sub payload serialization failed — local delivery only', {
                    channel,
                    error: err instanceof Error ? err.message : String(err),
                });
                deliverLocal(channel, message ?? null);

                return;
            }

            if (serialized === undefined)
            {
                // Top-level function/symbol payload — JSON.stringify yields undefined.
                // Publishing that is meaningless and re-parsing it later would throw,
                // so deliver locally and stop (guards the "publish never kills emit").
                transportLogger.warn('Pub/sub payload not serializable (function/symbol) — local delivery only', {
                    channel,
                });
                deliverLocal(channel, message ?? null);

                return;
            }

            try
            {
                await client.publish(channel, serialized);
            }
            catch (err)
            {
                // Redis blip: the cross-pod echo won't arrive, so deliver to this
                // pod's subscribers directly instead of dropping the event. Parse
                // the serialized copy so handlers see the SAME shape as the echo
                // path (a JSON round-trip), never the live mutable object.
                transportLogger.warn('Pub/sub publish failed — local delivery only', {
                    channel,
                    error: err instanceof Error ? err.message : String(err),
                });
                deliverLocal(channel, JSON.parse(serialized));
            }
        },

        subscribe: async (name: string, handler: MessageHandler): Promise<void> =>
        {
            const channel = channelPrefix + name;
            const sub = ensureSubscriber();

            try
            {
                await sub.subscribe(channel);
            }
            catch (err)
            {
                // SUBSCRIBE failed. If nothing else is live on this connection it
                // may be half-open — drop the memo (and quit it) so a later retry
                // rebuilds a fresh subscriber instead of reusing a dead one.
                if (handlers.size === 0 && subscriber === sub)
                {
                    subscriber = undefined;
                    void sub.quit?.().catch(() => undefined);
                }

                throw err;
            }

            // Register only after a confirmed subscribe — never leave a handler
            // bound to a channel the broker hasn't acknowledged.
            handlers.set(channel, handler);
        },
    };
}

/**
 * Options controlling event cache transport wiring.
 */
export interface WireEventCacheOptions
{
    /**
     * Force in-process mode even when a cache is configured.
     * @default true (auto: Redis when CACHE_URL is set, else in-process)
     */
    multiInstance?: boolean;

    /**
     * Channel prefix override (env `SPFN_SSE_CHANNEL_PREFIX`, else `spfn:sse:`).
     * Use distinct prefixes to isolate apps/tenants sharing one Redis.
     */
    channelPrefix?: string;

    /** Emit a debug log line describing the chosen transport. */
    debug?: boolean;
}

/**
 * Wire every event in a router to the shared Redis pub/sub cache.
 *
 * Returns the transport that ended up active. Idempotent per event name across
 * routers (an event shared by the SSE and WS routers is wired once), so it is
 * safe to call for both `.events()` and `.websockets()`.
 */
export async function wireEventRouterCache(
    router: EventRouterDef<any>,
    options: WireEventCacheOptions = {},
): Promise<'in-process' | 'redis'>
{
    if (options.multiInstance === false)
    {
        if (options.debug)
        {
            transportLogger.info('Event transport: in-process (multiInstance disabled)');
        }

        return 'in-process';
    }

    const pubSubCache = await resolvePubSubCache(options.channelPrefix);
    if (!pubSubCache)
    {
        if (options.debug)
        {
            transportLogger.info('Event transport: in-process (no cache configured)');
        }

        return 'in-process';
    }

    const events = router.events as Record<string, WirableEvent>;

    for (const key of Object.keys(events))
    {
        const event = events[key];
        if (state.wired.has(event.name))
        {
            continue;
        }

        try
        {
            await event.useCache(pubSubCache);
            state.wired.set(event.name, event);
        }
        catch (err)
        {
            // Degrade this event to in-process rather than aborting startup — a
            // transient SUBSCRIBE failure must not crash the pod. Not marked
            // wired, so a later wiring pass can retry it.
            transportLogger.warn('Event cache wiring failed — staying in-process for this event', {
                event: event.name,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    if (options.debug)
    {
        transportLogger.info('Event transport: redis (cross-pod fan-out enabled)', {
            events: Object.keys(events).length,
        });
    }

    return 'redis';
}

/**
 * Resolve (and cache) the shared pub/sub cache from the global cache instance.
 * Returns undefined when no cache is available.
 */
async function resolvePubSubCache(channelPrefix?: string): Promise<PubSubCache | undefined>
{
    const resolvedPrefix = resolveChannelPrefix(channelPrefix);

    if (state.pubSubCache)
    {
        // The transport (and its prefix) is process-global, resolved once on the
        // first wiring. Warn if a later router (.websockets() after .events())
        // asks for a different prefix — it's silently ignored, not applied.
        if (state.channelPrefix !== resolvedPrefix)
        {
            transportLogger.warn('Conflicting channelPrefix ignored — the transport prefix is process-global (first wiring wins).', {
                active: state.channelPrefix,
                ignored: resolvedPrefix,
            });
        }

        return state.pubSubCache;
    }

    let client: PubSubClient | undefined;
    try
    {
        const { getCache } = await import('@spfn/core/cache');
        client = getCache() as PubSubClient | undefined;
    }
    catch
    {
        // Cache module unavailable — fall back to in-process.
        return undefined;
    }

    if (!client)
    {
        return undefined;
    }

    // Cross-app isolation depends on the channel prefix. The default is shared by
    // every SPFN app, so warn (once, on first resolve) when running on it — apps
    // sharing one Redis with colliding event names would otherwise leak payloads.
    if (!channelPrefix && !process.env.SPFN_SSE_CHANNEL_PREFIX)
    {
        transportLogger.warn(
            'Event fan-out is on the default channel prefix (spfn:sse:). Apps sharing one '
            + 'Redis must set channelPrefix or SPFN_SSE_CHANNEL_PREFIX to avoid cross-app leakage.',
        );
    }

    state.channelPrefix = resolvedPrefix;
    state.pubSubCache = createRedisPubSubCache(
        client,
        resolvedPrefix,
        (connection) =>
        {
            state.subscriber = connection;
        },
    );

    return state.pubSubCache;
}

/**
 * Close the shared pub/sub subscriber connection and reset transport state.
 *
 * Called during graceful shutdown — the subscriber is a `duplicate()` of the
 * cache write connection and is not tracked by the cache manager, so it must be
 * quit explicitly (before `closeCache`). No-op when no subscriber was opened.
 *
 * Also resets each wired EventDef's cache binding. EventDefs are module
 * singletons that outlive a server instance; without this, a second server start
 * in the same process (tests, hot-reload) hits the `cacheSubscribed` latch, never
 * rebinds, and silently runs with cross-pod fan-out dead.
 */
export async function closeEventTransport(): Promise<void>
{
    const subscriber = state.subscriber;

    for (const event of state.wired.values())
    {
        event._resetCache?.();
    }

    state.subscriber = undefined;
    state.pubSubCache = undefined;
    state.channelPrefix = undefined;
    state.wired.clear();

    if (!subscriber?.quit)
    {
        return;
    }

    // Bound the quit: a wedged connection (broken socket, no FIN) must not stall
    // shutdown past this timeout — the process exits and the OS reclaims the socket.
    await Promise.race([
        subscriber.quit().catch(() => undefined),
        new Promise<void>((resolve) =>
        {
            const timer = setTimeout(resolve, SUBSCRIBER_QUIT_TIMEOUT_MS);
            timer.unref?.();
        }),
    ]);
}
