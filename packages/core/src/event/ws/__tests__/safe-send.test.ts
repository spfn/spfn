/**
 * WebSocket backpressure (safeSend) tests
 *
 * safeSend is the gate that protects against OOM from a slow consumer: it must
 * close the connection once the outbound buffer is past the cap instead of
 * queueing more frames.
 */

import { describe, it, expect, vi } from 'vitest';
import { safeSend } from '../handler';

const OPEN = 1;

function fakeWs(overrides: Record<string, unknown> = {})
{
    return {
        readyState: OPEN,
        bufferedAmount: 0,
        send: vi.fn(),
        close: vi.fn(),
        ...overrides,
    };
}

describe('safeSend (WS backpressure)', () =>
{
    it('sends a JSON frame when the buffer is under the cap', () =>
    {
        const ws = fakeWs();
        safeSend(ws, { type: 'x', data: 1 }, 1000);

        expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'x', data: 1 }));
        expect(ws.close).not.toHaveBeenCalled();
    });

    it('closes the connection (1013) instead of sending when the buffer is over the cap', () =>
    {
        const ws = fakeWs({ bufferedAmount: 2000 });
        safeSend(ws, { type: 'x', data: 1 }, 1000);

        expect(ws.send).not.toHaveBeenCalled();
        expect(ws.close).toHaveBeenCalledWith(1013, 'Send buffer overflow');
    });

    it('does nothing when the socket is not open', () =>
    {
        const ws = fakeWs({ readyState: 3 /* CLOSED */ });
        safeSend(ws, { type: 'x' }, 1000);

        expect(ws.send).not.toHaveBeenCalled();
        expect(ws.close).not.toHaveBeenCalled();
    });

    it('swallows a send that throws (socket closed mid-send)', () =>
    {
        const ws = fakeWs({ send: vi.fn(() => { throw new Error('closed'); }) });

        expect(() => safeSend(ws, { type: 'x' }, 1000)).not.toThrow();
    });
});
