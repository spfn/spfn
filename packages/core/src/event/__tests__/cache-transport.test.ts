/**
 * Event cache transport (Redis pub/sub) tests
 *
 * Simulates multiple pods sharing one Redis bus and asserts that an `emit` on
 * one pod fans out to subscribers on another, that channel prefixes isolate
 * apps, that publish/serialization failures degrade to local delivery rather
 * than dropping or crashing, and that router wiring dedups + degrades gracefully.
 */

import { describe, it, expect, vi, afterEach, type Mock } from 'vitest';
import { Type } from '@sinclair/typebox';
// Import from src (not the '@spfn/core/event' package specifier, which resolves to
// built dist) so these tests exercise the current source and share ONE event-module
// instance with cache-transport — no stale-dist false confidence, no dual singleton.
import { defineEvent } from '../event';
import { defineEventRouter } from '../router';
import { createRedisPubSubCache, wireEventRouterCache, closeEventTransport } from '../cache-transport';

// Mock the cache module so wireEventRouterCache's dynamic getCache() is steerable.
// Defaults to "no cache" (in-process); individual tests opt into a fake client.
vi.mock('@spfn/core/cache', () => ({ getCache: vi.fn(() => undefined) }));
import { getCache } from '@spfn/core/cache';

// Reset the global transport singleton between tests (wired set, cached pubSubCache).
afterEach(async () =>
{
    await closeEventTransport();
    (getCache as unknown as Mock).mockReturnValue(undefined);
});

// ── Fake Redis bus (shared backend for several client connections) ──

class FakeBus
{
    private channels = new Map<string, Set<(channel: string, message: string) => void>>();

    publish(channel: string, message: string): number
    {
        const subs = this.channels.get(channel);
        if (!subs)
        {
            return 0;
        }

        for (const cb of subs)
        {
            cb(channel, message);
        }

        return subs.size;
    }

    subscribe(channel: string, cb: (channel: string, message: string) => void): void
    {
        let set = this.channels.get(channel);
        if (!set)
        {
            set = new Set();
            this.channels.set(channel, set);
        }

        set.add(cb);
    }
}

class FakeRedis
{
    private listeners: ((channel: string, message: string) => void)[] = [];

    constructor(private bus: FakeBus)
    {}

    async publish(channel: string, message: string): Promise<number>
    {
        return this.bus.publish(channel, message);
    }

    duplicate(): FakeRedis
    {
        return new FakeRedis(this.bus);
    }

    async subscribe(channel: string): Promise<void>
    {
        this.bus.subscribe(channel, (ch, msg) =>
        {
            for (const l of this.listeners)
            {
                l(ch, msg);
            }
        });
    }

    on(event: string, listener: (channel: string, message: string) => void): void
    {
        if (event === 'message')
        {
            this.listeners.push(listener);
        }
    }
}

const flush = () => new Promise(resolve => setImmediate(resolve));

describe('createRedisPubSubCache', () =>
{
    it('fans out an emit from one pod to a subscriber on another pod', async () =>
    {
        const bus = new FakeBus();
        const schema = Type.Object({ text: Type.String() });

        // Two independent event instances with the same name = two pods.
        const podA = defineEvent('chatChunk', schema);
        const podB = defineEvent('chatChunk', schema);

        await podA.useCache(createRedisPubSubCache(new FakeRedis(bus), 'spfn:sse:'));
        await podB.useCache(createRedisPubSubCache(new FakeRedis(bus), 'spfn:sse:'));

        const received: { text: string }[] = [];
        podB.subscribe((payload) =>
        {
            received.push(payload);
        });

        await podA.emit({ text: 'hello' });
        await flush();

        expect(received).toEqual([{ text: 'hello' }]);
    });

    it('fans out a void-payload event without dropping it', async () =>
    {
        const bus = new FakeBus();

        const podA = defineEvent('serverStarted');
        const podB = defineEvent('serverStarted');

        await podA.useCache(createRedisPubSubCache(new FakeRedis(bus), 'spfn:sse:'));
        await podB.useCache(createRedisPubSubCache(new FakeRedis(bus), 'spfn:sse:'));

        let received = 0;
        podB.subscribe(() =>
        {
            received++;
        });

        await podA.emit();
        await flush();

        expect(received).toBe(1);
    });

    it('isolates pods that use a different channel prefix', async () =>
    {
        const bus = new FakeBus();
        const schema = Type.Object({ text: Type.String() });

        const podA = defineEvent('chatChunk', schema);
        const podB = defineEvent('chatChunk', schema);

        await podA.useCache(createRedisPubSubCache(new FakeRedis(bus), 'app-a:'));
        await podB.useCache(createRedisPubSubCache(new FakeRedis(bus), 'app-b:'));

        const received: unknown[] = [];
        podB.subscribe((payload) =>
        {
            received.push(payload);
        });

        await podA.emit({ text: 'hello' });
        await flush();

        expect(received).toEqual([]);
    });

    it('swallows publish failures so emit never throws', async () =>
    {
        const failing = {
            publish: vi.fn().mockRejectedValue(new Error('redis down')),
            duplicate: vi.fn(),
            subscribe: vi.fn(),
            on: vi.fn(),
        };

        const cache = createRedisPubSubCache(failing as any, 'spfn:sse:');

        await expect(cache.publish('chatChunk', { text: 'hi' })).resolves.toBeUndefined();
        expect(failing.publish).toHaveBeenCalledOnce();
    });

    it('delivers locally when publish fails (same-pod stream survives a Redis blip)', async () =>
    {
        const subscriberStub = { subscribe: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
        const client = {
            publish: vi.fn().mockRejectedValue(new Error('redis down')),
            duplicate: vi.fn().mockReturnValue(subscriberStub),
            subscribe: vi.fn(),
            on: vi.fn(),
        };

        const event = defineEvent('chatChunk', Type.Object({ text: Type.String() }));
        await event.useCache(createRedisPubSubCache(client as any, 'spfn:sse:'));

        const received: { text: string }[] = [];
        event.subscribe((payload) =>
        {
            received.push(payload);
        });

        const original = { text: 'hi' };
        await event.emit(original);
        await flush();

        expect(client.publish).toHaveBeenCalledOnce();
        expect(received).toEqual([{ text: 'hi' }]); // delivered despite the publish failure
        expect(received[0]).not.toBe(original); // a JSON copy, same shape as the echo path
    });

    it('delivers locally when the payload is not JSON-serializable', async () =>
    {
        const subscriberStub = { subscribe: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
        const client = {
            publish: vi.fn().mockResolvedValue(1),
            duplicate: vi.fn().mockReturnValue(subscriberStub),
            subscribe: vi.fn(),
            on: vi.fn(),
        };

        const cache = createRedisPubSubCache(client as any, 'spfn:sse:');

        const received: unknown[] = [];
        await cache.subscribe('weird', (payload) =>
        {
            received.push(payload);
        });

        await cache.publish('weird', { big: 10n }); // bigint → JSON.stringify throws

        expect(client.publish).not.toHaveBeenCalled(); // never reached the wire
        expect(received).toEqual([{ big: 10n }]); // but local subscriber still got it
    });

    it('tears down the subscriber when the first SUBSCRIBE fails so a retry rebuilds', async () =>
    {
        const deadSub = {
            subscribe: vi.fn().mockRejectedValue(new Error('SUBSCRIBE failed')),
            on: vi.fn(),
            quit: vi.fn().mockResolvedValue('OK'),
        };
        const goodSub = { subscribe: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
        const client = {
            publish: vi.fn(),
            duplicate: vi.fn().mockReturnValueOnce(deadSub).mockReturnValueOnce(goodSub),
            subscribe: vi.fn(),
            on: vi.fn(),
        };

        const cache = createRedisPubSubCache(client as any, 'spfn:sse:');

        await expect(cache.subscribe('a', () => undefined)).rejects.toThrow('SUBSCRIBE failed');
        expect(deadSub.quit).toHaveBeenCalled(); // half-open connection torn down

        // Retry rebuilds a fresh subscriber rather than reusing the dead one.
        await cache.subscribe('a', () => undefined);
        expect(client.duplicate).toHaveBeenCalledTimes(2);
    });
});

describe('wireEventRouterCache', () =>
{
    it('stays in-process when multiInstance is disabled', async () =>
    {
        const router = defineEventRouter({
            ping: defineEvent('ping', Type.Object({})),
        });

        const transport = await wireEventRouterCache(router, { multiInstance: false });

        expect(transport).toBe('in-process');
    });

    it('stays in-process when no cache is configured', async () =>
    {
        const router = defineEventRouter({
            ping: defineEvent('ping', Type.Object({})),
        });

        // getCache mock returns undefined → falls back to in-process.
        const transport = await wireEventRouterCache(router);

        expect(transport).toBe('in-process');
    });

    it('wires events to redis when a cache is present and dedups a shared event across routers', async () =>
    {
        const bus = new FakeBus();
        const client = new FakeRedis(bus);
        const duplicateSpy = vi.spyOn(client, 'duplicate');
        (getCache as unknown as Mock).mockReturnValue(client);

        // Same event instance registered on two routers (SSE + WS).
        const shared = defineEvent('sharedEvt', Type.Object({ n: Type.Number() }));
        const sseRouter = defineEventRouter({ shared });
        const wsRouter = defineEventRouter({ shared });

        expect(await wireEventRouterCache(sseRouter)).toBe('redis');
        expect(await wireEventRouterCache(wsRouter)).toBe('redis');

        // Shared event wired exactly once → one subscriber connection, not two.
        expect(duplicateSpy).toHaveBeenCalledTimes(1);

        const received: { n: number }[] = [];
        shared.subscribe((payload) =>
        {
            received.push(payload);
        });

        await shared.emit({ n: 5 });
        await flush();

        expect(received).toEqual([{ n: 5 }]);
    });

    it('rebinds events to a fresh cache after closeEventTransport (same-process restart)', async () =>
    {
        // Server #1: wire with client C1.
        const client1 = new FakeRedis(new FakeBus());
        (getCache as unknown as Mock).mockReturnValue(client1);

        const evt = defineEvent('restartEvt', Type.Object({ n: Type.Number() }));
        const router = defineEventRouter({ evt });
        expect(await wireEventRouterCache(router)).toBe('redis');

        // Shutdown server #1 (clears transport state AND resets the EventDef binding).
        await closeEventTransport();

        // Server #2: a brand-new client C2 (C1 is gone).
        const bus2 = new FakeBus();
        const client2 = new FakeRedis(bus2);
        (getCache as unknown as Mock).mockReturnValue(client2);
        expect(await wireEventRouterCache(router)).toBe('redis');

        const pub1 = vi.spyOn(client1, 'publish');
        const pub2 = vi.spyOn(client2, 'publish');

        const received: { n: number }[] = [];
        evt.subscribe((payload) =>
        {
            received.push(payload);
        });

        await evt.emit({ n: 7 });
        await flush();

        // Rebound to C2 — without _resetCache the event would stay latched on dead C1.
        expect(pub2).toHaveBeenCalled();
        expect(pub1).not.toHaveBeenCalled();
        expect(received).toEqual([{ n: 7 }]);
    });

    it('degrades a single event to in-process when its useCache rejects, without throwing', async () =>
    {
        const client = new FakeRedis(new FakeBus());
        (getCache as unknown as Mock).mockReturnValue(client);

        const ok = defineEvent('okEvt', Type.Object({}));
        const bad = defineEvent('badEvt', Type.Object({}));
        // Force this event's wiring to fail at subscribe time.
        bad.useCache = vi.fn().mockRejectedValue(new Error('SUBSCRIBE failed')) as typeof bad.useCache;

        const router = defineEventRouter({ ok, bad });

        // Must not throw — startup survives a per-event SUBSCRIBE failure.
        await expect(wireEventRouterCache(router)).resolves.toBe('redis');
    });
});

describe('useCache failure recovery', () =>
{
    it('leaves the event in-process after a failed useCache and allows a later retry', async () =>
    {
        const event = defineEvent('retryEvt', Type.Object({ n: Type.Number() }));

        const failingCache = {
            publish: vi.fn(),
            subscribe: vi.fn().mockRejectedValue(new Error('SUBSCRIBE failed')),
        };

        await expect(event.useCache(failingCache as any)).rejects.toThrow('SUBSCRIBE failed');

        // Degraded to in-process: emit reaches local handlers directly, not the cache.
        const received: { n: number }[] = [];
        event.subscribe((payload) =>
        {
            received.push(payload);
        });

        await event.emit({ n: 1 });
        await flush();

        expect(received).toEqual([{ n: 1 }]);
        expect(failingCache.publish).not.toHaveBeenCalled(); // never entered cache mode

        // Retry with a working cache succeeds — cacheSubscribed was not latched.
        const bus = new FakeBus();
        await event.useCache(createRedisPubSubCache(new FakeRedis(bus), 'spfn:sse:'));

        received.length = 0;
        await event.emit({ n: 2 });
        await flush();

        expect(received).toEqual([{ n: 2 }]); // now delivered via the cache round-trip
    });
});

describe('closeEventTransport', () =>
{
    it('quits the subscriber connection and is a no-op when none was opened', async () =>
    {
        const quit = vi.fn().mockResolvedValue('OK');
        const subscriber = { subscribe: vi.fn(), on: vi.fn(), quit };
        const client = {
            publish: vi.fn().mockResolvedValue(1),
            duplicate: vi.fn().mockReturnValue(subscriber),
            subscribe: vi.fn(),
            on: vi.fn(),
        };

        const stored: any[] = [];
        const cache = createRedisPubSubCache(client as any, 'spfn:sse:', (conn) =>
        {
            stored.push(conn);
        });

        // No subscriber until the first subscribe.
        expect(stored).toHaveLength(0);
        await cache.subscribe('chatChunk', () => undefined);
        expect(stored[0]).toBe(subscriber);

        // closeEventTransport only quits the singleton subscriber, not this local one,
        // so a bare call with nothing wired must not throw.
        await expect(closeEventTransport()).resolves.toBeUndefined();
    });
});
