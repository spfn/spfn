/**
 * SSE Client Race Test
 *
 * Reproduces the async-connect + sync-cleanup race that leaked EventSource
 * instances under React StrictMode (mount → cleanup → mount). The cleanup ran
 * while `acquireToken()` was still awaiting, so the EventSource — created only
 * after the await — had no teardown waiting for it and leaked.
 *
 * The fix groups per-subscription resources into a connection object and guards
 * the await boundary, so cancellation before the EventSource is created prevents
 * it from ever opening.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineEvent, defineEventRouter } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';
import { createSSEClient } from '../client';

// ============================================================================
// Fake EventSource
// ============================================================================

interface FakeListener
{
    (e: { data: string }): void;
}

class FakeEventSource
{
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;

    static instances: FakeEventSource[] = [];

    readyState = FakeEventSource.OPEN;
    onopen: (() => void) | null = null;
    onerror: ((e: Event) => void) | null = null;

    private listeners = new Map<string, FakeListener[]>();

    constructor(public url: string, public init?: { withCredentials?: boolean })
    {
        FakeEventSource.instances.push(this);
    }

    addEventListener(name: string, cb: FakeListener)
    {
        const list = this.listeners.get(name) ?? [];
        list.push(cb);
        this.listeners.set(name, list);
    }

    close()
    {
        this.readyState = FakeEventSource.CLOSED;
    }

    /** Dispatch an SSE event as the server would (data = JSON SSEMessage). */
    emit(event: string, payload: unknown)
    {
        const wire = { data: JSON.stringify({ event, data: payload }) };
        for (const cb of this.listeners.get(event) ?? [])
        {
            cb(wire);
        }
    }

    static get live(): FakeEventSource[]
    {
        return FakeEventSource.instances.filter((es) => es.readyState !== FakeEventSource.CLOSED);
    }

    static reset()
    {
        FakeEventSource.instances = [];
    }
}

// ============================================================================
// Deferred helper — lets a test hold a token mid-await, then resolve/reject it.
// ============================================================================

function deferred<T>()
{
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) =>
    {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

// ============================================================================
// Test router
// ============================================================================

const ping = defineEvent('ping', Type.Object({ n: Type.Number() }));
const testRouter = defineEventRouter({ ping });
type TestRouter = typeof testRouter;

// ============================================================================

describe('SSE client — async connect + sync cleanup race', () =>
{
    beforeEach(() =>
    {
        FakeEventSource.reset();
        (globalThis as any).EventSource = FakeEventSource;
    });

    afterEach(() =>
    {
        vi.useRealTimers();
        delete (globalThis as any).EventSource;
    });

    it('unsubscribe during the token await opens no EventSource', async () =>
    {
        const token = deferred<string>();

        const client = createSSEClient<TestRouter>({
            url: 'http://test/stream',
            acquireToken: () => token.promise,
        });

        const unsubscribe = client.subscribe({
            events: ['ping'],
            handlers: { ping: () => {} },
        });

        // Cleanup fires while the token is still pending.
        unsubscribe();

        // Token resolves only afterwards.
        token.resolve('tok');
        await Promise.resolve();
        await Promise.resolve();

        expect(FakeEventSource.instances).toHaveLength(0);
        expect(client.getState()).toBe('closed');
    });

    it('StrictMode sequence (independent clients) leaves exactly one live connection', async () =>
    {
        const t1 = deferred<string>();
        const t2 = deferred<string>();
        const handler = vi.fn();

        // mount1
        const client1 = createSSEClient<TestRouter>({
            url: 'http://test/stream',
            acquireToken: () => t1.promise,
        });
        const unsub1 = client1.subscribe({
            events: ['ping'],
            handlers: { ping: handler },
        });

        // cleanup1 (token still pending)
        unsub1();

        // mount2
        const client2 = createSSEClient<TestRouter>({
            url: 'http://test/stream',
            acquireToken: () => t2.promise,
        });
        client2.subscribe({
            events: ['ping'],
            handlers: { ping: handler },
        });

        // both tokens resolve
        t1.resolve('tok1');
        t2.resolve('tok2');
        await Promise.resolve();
        await Promise.resolve();

        expect(FakeEventSource.live).toHaveLength(1);

        // The single live source delivers each event exactly once.
        FakeEventSource.live[0].emit('ping', { n: 1 });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ n: 1 });
    });

    it('resubscribe on the same client supersedes the pending connection', async () =>
    {
        const t1 = deferred<string>();
        const t2 = deferred<string>();
        const handler = vi.fn();

        const client = createSSEClient<TestRouter>({
            url: 'http://test/stream',
            acquireToken: () => (FakeEventSource.instances.length === 0 ? t1.promise : t2.promise),
        });

        const unsub1 = client.subscribe({ events: ['ping'], handlers: { ping: handler } });
        unsub1();
        client.subscribe({ events: ['ping'], handlers: { ping: handler } });

        t1.resolve('tok1');
        t2.resolve('tok2');
        await Promise.resolve();
        await Promise.resolve();

        expect(FakeEventSource.live).toHaveLength(1);
        FakeEventSource.live[0].emit('ping', { n: 7 });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('close() during the token await opens no EventSource', async () =>
    {
        const token = deferred<string>();

        const client = createSSEClient<TestRouter>({
            url: 'http://test/stream',
            acquireToken: () => token.promise,
        });

        client.subscribe({ events: ['ping'], handlers: { ping: () => {} } });
        client.close();

        token.resolve('tok');
        await Promise.resolve();
        await Promise.resolve();

        expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('a token rejection after unsubscribe does not schedule a reconnect', async () =>
    {
        vi.useFakeTimers();
        const token = deferred<string>();
        const acquire = vi.fn(() => token.promise);
        const onReconnect = vi.fn();

        const client = createSSEClient<TestRouter>({
            url: 'http://test/stream',
            reconnect: true,
            reconnectDelay: 1000,
            acquireToken: acquire,
        });

        const unsubscribe = client.subscribe({
            events: ['ping'],
            handlers: { ping: () => {} },
            onReconnect,
        });

        unsubscribe();
        token.reject(new Error('token failed'));

        // Flush the rejected promise's catch handler.
        await Promise.resolve();
        await Promise.resolve();

        // Advance past the reconnect delay — nothing should have been scheduled.
        vi.advanceTimersByTime(5000);

        expect(onReconnect).not.toHaveBeenCalled();
        expect(acquire).toHaveBeenCalledTimes(1);
        expect(FakeEventSource.instances).toHaveLength(0);
    });

    it('onClose fires exactly once on unsubscribe', async () =>
    {
        const token = deferred<string>();
        const onClose = vi.fn();

        const client = createSSEClient<TestRouter>({
            url: 'http://test/stream',
            acquireToken: () => token.promise,
        });

        const unsubscribe = client.subscribe({
            events: ['ping'],
            handlers: { ping: () => {} },
            onClose,
        });

        token.resolve('tok');
        await Promise.resolve();
        await Promise.resolve();

        unsubscribe();
        unsubscribe(); // idempotent

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
