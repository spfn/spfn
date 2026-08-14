import { describe, expect, it } from 'vitest';

import { aggregateFocusCharges, extractEnvPushFailures, focusFeedReadable } from '../cloud/vercel-api.js';
import { extractDbSizeBytes, sumApiCounts } from '../cloud/supabase-api.js';

describe('aggregateFocusCharges', () =>
{
    it('sums per-day records into one row per service, sorted by name', () =>
    {
        const jsonl = [
            JSON.stringify({ ServiceName: 'Edge Requests', ConsumedQuantity: 100, ConsumedUnit: 'requests' }),
            JSON.stringify({ ServiceName: 'Fast Data Transfer', ConsumedQuantity: 1.5, ConsumedUnit: 'GB' }),
            JSON.stringify({ ServiceName: 'Edge Requests', ConsumedQuantity: 50, ConsumedUnit: 'requests' }),
        ].join('\n');

        expect(aggregateFocusCharges(jsonl)).toEqual([
            { serviceName: 'Edge Requests', consumed: 150, unit: 'requests' },
            { serviceName: 'Fast Data Transfer', consumed: 1.5, unit: 'GB' },
        ]);
    });

    it('accepts string quantities (FOCUS allows either) and skips zero-consumption rows', () =>
    {
        const jsonl = [
            JSON.stringify({ ServiceName: 'Function Invocations', ConsumedQuantity: '42', ConsumedUnit: 'invocations' }),
            JSON.stringify({ ServiceName: 'Image Transformations', ConsumedQuantity: 0, ConsumedUnit: 'transformations' }),
        ].join('\n');

        expect(aggregateFocusCharges(jsonl)).toEqual([
            { serviceName: 'Function Invocations', consumed: 42, unit: 'invocations' },
        ]);
    });

    it('skips blank and malformed lines instead of failing the whole feed', () =>
    {
        const jsonl = '\nnot-json\n' + JSON.stringify({ ServiceName: 'Edge Requests', ConsumedQuantity: 1, ConsumedUnit: 'requests' }) + '\n';

        expect(aggregateFocusCharges(jsonl)).toHaveLength(1);
    });

    it('returns an empty list for an empty feed', () =>
    {
        expect(aggregateFocusCharges('')).toEqual([]);
    });

    it('keeps records with different units apart instead of summing across them', () =>
    {
        const jsonl = [
            JSON.stringify({ ServiceName: 'Fast Data Transfer', ConsumedQuantity: 900, ConsumedUnit: 'MB' }),
            JSON.stringify({ ServiceName: 'Fast Data Transfer', ConsumedQuantity: 2, ConsumedUnit: 'GB' }),
        ].join('\n');

        expect(aggregateFocusCharges(jsonl)).toEqual([
            { serviceName: 'Fast Data Transfer', consumed: 900, unit: 'MB' },
            { serviceName: 'Fast Data Transfer', consumed: 2, unit: 'GB' },
        ]);
    });
});

describe('focusFeedReadable', () =>
{
    it('accepts an empty body (no usage) and a body with at least one readable record', () =>
    {
        expect(focusFeedReadable('')).toBe(true);
        expect(focusFeedReadable('\n\n')).toBe(true);
        expect(focusFeedReadable(JSON.stringify({ ServiceName: 'Edge Requests', ConsumedQuantity: 0 }))).toBe(true);
    });

    it('rejects content that parses to no records — unavailable must not read as zero usage', () =>
    {
        expect(focusFeedReadable('[{"ServiceName":"Edge Requests"}]')).toBe(false);
        expect(focusFeedReadable('{\n  "ServiceName": "Edge Requests"\n}')).toBe(false);
        expect(focusFeedReadable(JSON.stringify({ serviceName: 'edge', consumedQuantity: 1 }))).toBe(false);
    });

    it('rejects records the aggregator itself would drop — ServiceName null or empty', () =>
    {
        expect(focusFeedReadable(JSON.stringify({ ServiceName: null, ConsumedQuantity: 100, ConsumedUnit: 'requests' }))).toBe(false);
        expect(focusFeedReadable(JSON.stringify({ ServiceName: '', ConsumedQuantity: 100 }))).toBe(false);
    });
});

describe('extractEnvPushFailures', () =>
{
    it('reads per-key rejections that arrive under a 2xx', () =>
    {
        const body = {
            created: [{ key: 'GOOD_KEY' }],
            failed: [{ error: { code: 'invalid_name', key: 'BAD KEY', message: 'Invalid name' } }],
        };

        expect(extractEnvPushFailures(body)).toEqual([{ key: 'BAD KEY', message: 'Invalid name' }]);
    });

    it('treats an unknown or empty shape as no failures', () =>
    {
        expect(extractEnvPushFailures({ created: [] })).toEqual([]);
        expect(extractEnvPushFailures(null)).toEqual([]);
        expect(extractEnvPushFailures('ok')).toEqual([]);
    });
});

describe('extractDbSizeBytes', () =>
{
    it('reads total_bytes from the first row, tolerating a stringified bigint', () =>
    {
        expect(extractDbSizeBytes([{ total_bytes: 52428800 }])).toBe(52428800);
        expect(extractDbSizeBytes([{ total_bytes: '52428800' }])).toBe(52428800);
    });

    it('returns null on an empty or unexpected shape', () =>
    {
        expect(extractDbSizeBytes([])).toBeNull();
        expect(extractDbSizeBytes({ rows: [] })).toBeNull();
        expect(extractDbSizeBytes([{ something_else: 1 }])).toBeNull();
    });
});

describe('sumApiCounts', () =>
{
    it('sums the per-service totals of the live response shape (captured 2026-08-14)', () =>
    {
        const live = {
            result: [{
                timestamp: '2026-08-13T16:00:00',
                total_auth_requests: 14,
                total_realtime_requests: 0,
                total_rest_requests: 14,
                total_storage_requests: 0,
            }],
            error: null,
        };

        expect(sumApiCounts(live)).toBe(28);
    });

    it('sums across multiple buckets and still accepts the legacy count field', () =>
    {
        expect(sumApiCounts({ result: [{ total_rest_requests: 10 }, { total_rest_requests: 5 }] })).toBe(15);
        expect(sumApiCounts({ result: [{ count: 10 }, { count: 5 }] })).toBe(15);
    });

    it('ignores non-count fields and returns null when nothing countable is present', () =>
    {
        expect(sumApiCounts({ result: [{ timestamp: '2026-08-13T16:00:00', value: 3 }] })).toBeNull();
        expect(sumApiCounts({})).toBeNull();
        expect(sumApiCounts(undefined)).toBeNull();
    });
});
