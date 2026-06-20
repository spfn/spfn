/**
 * Bounded SSE writer tests
 *
 * Asserts serialized (one-at-a-time) delivery with backpressure, and that a slow
 * consumer is closed on queue overflow rather than buffering unboundedly.
 */

import { describe, it, expect, vi } from 'vitest';
import { createBoundedWriter, type SSEFrame } from '../bounded-writer';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A stream whose writeSSE hangs until manually resolved/rejected — models a slow socket. */
class FakeStream
{
    writes: SSEFrame[] = [];
    inFlight = 0;
    maxInFlight = 0;
    private settlers: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];

    async writeSSE(frame: SSEFrame): Promise<void>
    {
        this.writes.push(frame);
        this.inFlight++;
        this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);

        try
        {
            await new Promise<void>((resolve, reject) =>
            {
                this.settlers.push({ resolve, reject });
            });
        }
        finally
        {
            this.inFlight--;
        }
    }

    resolveNext(): void
    {
        this.settlers.shift()?.resolve();
    }

    rejectNext(err: Error): void
    {
        this.settlers.shift()?.reject(err);
    }
}

describe('createBoundedWriter', () =>
{
    it('writes frames one at a time, in order (no concurrent writeSSE)', async () =>
    {
        const stream = new FakeStream();
        const writer = createBoundedWriter(stream, 100, () => undefined);

        writer.enqueue({ data: '1' });
        writer.enqueue({ data: '2' });
        writer.enqueue({ data: '3' });

        // Only the first write has started; the rest wait in the queue.
        expect(stream.writes.map(w => w.data)).toEqual(['1']);
        expect(stream.inFlight).toBe(1);
        expect(writer.queued).toBe(2);

        stream.resolveNext();
        await tick();
        stream.resolveNext();
        await tick();
        stream.resolveNext();
        await tick();

        expect(stream.writes.map(w => w.data)).toEqual(['1', '2', '3']);
        expect(stream.maxInFlight).toBe(1); // never two writes at once → backpressure held
        expect(writer.queued).toBe(0);
    });

    it('closes the connection on queue overflow (slow consumer)', () =>
    {
        const stream = new FakeStream(); // writes never resolve
        const onClose = vi.fn();
        const writer = createBoundedWriter(stream, 3, onClose);

        writer.enqueue({ data: '1' }); // → in-flight (hangs), queue 0
        writer.enqueue({ data: '2' }); // queue 1
        writer.enqueue({ data: '3' }); // queue 2
        writer.enqueue({ data: '4' }); // queue 3 (== max, ok)
        expect(onClose).not.toHaveBeenCalled();

        writer.enqueue({ data: '5' }); // queue 4 > 3 → overflow
        expect(onClose).toHaveBeenCalledOnce();
        expect(onClose.mock.calls[0][0]).toMatch(/overflow/);
    });

    it('close() stops draining and drops queued frames', async () =>
    {
        const stream = new FakeStream();
        const writer = createBoundedWriter(stream, 100, () => undefined);

        writer.enqueue({ data: '1' }); // in-flight
        writer.enqueue({ data: '2' }); // queued
        writer.close();

        expect(writer.queued).toBe(0);

        stream.resolveNext(); // finish the in-flight write
        await tick();

        expect(stream.writes.map(w => w.data)).toEqual(['1']); // '2' never written
    });

    it('closes on a write error', async () =>
    {
        const stream = new FakeStream();
        const onClose = vi.fn();
        const writer = createBoundedWriter(stream, 100, onClose);

        writer.enqueue({ data: '1' });
        stream.rejectNext(new Error('socket gone'));
        await tick();

        expect(onClose).toHaveBeenCalledOnce();
        expect(onClose.mock.calls[0][0]).toMatch(/socket gone/);
    });

    it('ignores enqueue after close', () =>
    {
        const stream = new FakeStream();
        const writer = createBoundedWriter(stream, 100, () => undefined);

        writer.close();
        writer.enqueue({ data: '1' });

        expect(stream.writes).toHaveLength(0);
        expect(writer.queued).toBe(0);
    });
});
