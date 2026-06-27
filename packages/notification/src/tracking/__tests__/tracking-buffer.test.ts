/**
 * tracking.service — buffered batch insert (P-H1)
 *
 * Open/click hits are buffered and flushed as a single multi-row INSERT once the
 * buffer reaches FLUSH_SIZE, instead of one INSERT per hit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { valuesSpy, insertSpy } = vi.hoisted(() =>
{
    const valuesSpy = vi.fn(async (_rows: unknown[]) => undefined);
    const insertSpy = vi.fn((_table: unknown) => ({ values: valuesSpy }));

    return { valuesSpy, insertSpy };
});

vi.mock('@spfn/core/db', async (importOriginal) =>
{
    const actual = await importOriginal<typeof import('@spfn/core/db')>();

    return { ...actual, getDatabase: () => ({ insert: insertSpy }) };
});

import { recordOpenEvent } from '../tracking.service';

describe('tracking buffer', () =>
{
    beforeEach(() => vi.clearAllMocks());

    it('flushes one multi-row INSERT once FLUSH_SIZE (200) hits accumulate', async () =>
    {
        for (let i = 0; i < 200; i++)
        {
            recordOpenEvent(i);
        }

        // size-triggered flush runs on a microtask
        await Promise.resolve();
        await Promise.resolve();

        expect(insertSpy).toHaveBeenCalledTimes(1);
        expect(valuesSpy).toHaveBeenCalledTimes(1);
        // a single batch carrying all 200 events
        expect(valuesSpy.mock.calls[0][0]).toHaveLength(200);
    });
});
