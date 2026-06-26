/**
 * SSE fan-out frame serialization (serializeFrame) tests
 *
 * One emit delivers the same payload object to every subscriber, so the frame
 * must be serialized once and reused — not re-stringified per connection.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { serializeFrame } from '../handler';

afterEach(() => vi.restoreAllMocks());

describe('serializeFrame', () =>
{
    it('produces the SSE frame shape { event, data }', () =>
    {
        const payload = { a: 1 };
        expect(serializeFrame('user.created', payload)).toBe(
            JSON.stringify({ event: 'user.created', data: payload }),
        );
    });

    it('serializes an object payload only once across repeated emits to subscribers', () =>
    {
        const payload = { id: 42, name: 'x' };
        const spy = vi.spyOn(JSON, 'stringify');

        const a = serializeFrame('evt', payload);  // first subscriber → stringify
        const b = serializeFrame('evt', payload);  // others → cache hit
        const c = serializeFrame('evt', payload);

        expect(a).toBe(b);
        expect(b).toBe(c);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('caches per event name for the same payload object', () =>
    {
        const payload = { v: 1 };
        const spy = vi.spyOn(JSON, 'stringify');

        const e1 = serializeFrame('evt.a', payload);
        const e2 = serializeFrame('evt.b', payload);

        expect(e1).toContain('evt.a');
        expect(e2).toContain('evt.b');
        expect(spy).toHaveBeenCalledTimes(2); // distinct events → distinct frames
    });

    it('handles primitive / null payloads without caching', () =>
    {
        expect(serializeFrame('evt', 5)).toBe(JSON.stringify({ event: 'evt', data: 5 }));
        expect(serializeFrame('evt', null)).toBe(JSON.stringify({ event: 'evt', data: null }));
    });
});
