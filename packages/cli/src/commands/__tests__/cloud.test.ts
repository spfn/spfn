import { describe, expect, it } from 'vitest';

import { addCron, normalizeDeployUrl } from '../cloud/keepalive.js';
import { matchVercelLimit } from '../cloud/collect.js';

describe('normalizeDeployUrl', () =>
{
    it('accepts what the Vercel dashboard shows — a domain without a scheme', () =>
    {
        expect(normalizeDeployUrl('myapp.vercel.app')).toBe('https://myapp.vercel.app/');
        expect(normalizeDeployUrl('https://myapp.vercel.app')).toBe('https://myapp.vercel.app/');
    });

    it('returns null for input that cannot be a URL', () =>
    {
        expect(normalizeDeployUrl('not a url')).toBeNull();
    });
});

describe('addCron', () =>
{
    const HEALTH = '/api/backend/_core/health?detailed=true';

    it('adds the daily cron to an empty vercel.json', () =>
    {
        const json: Record<string, unknown> = {};

        expect(addCron(json, HEALTH)).toBe('added');
        expect(json.crons).toEqual([{ path: HEALTH, schedule: '0 3 * * *' }]);
    });

    it('is idempotent when our cron is already present', () =>
    {
        const json: Record<string, unknown> = { crons: [{ path: HEALTH, schedule: '0 3 * * *' }] };

        expect(addCron(json, HEALTH)).toBe('exists');
        expect((json.crons as unknown[]).length).toBe(1);
    });

    it('refuses to take the single Hobby cron slot from an existing job', () =>
    {
        const json: Record<string, unknown> = { crons: [{ path: '/api/other', schedule: '0 4 * * *' }] };

        expect(addCron(json, HEALTH)).toBe('occupied');
        expect((json.crons as unknown[]).length).toBe(1);
    });
});

describe('matchVercelLimit', () =>
{
    it('matches FOCUS service names to Hobby limits case- and punctuation-insensitively', () =>
    {
        expect(matchVercelLimit('Fast Data Transfer')?.key).toBe('fast-data-transfer');
        expect(matchVercelLimit('edge requests')?.key).toBe('edge-requests');
        expect(matchVercelLimit('Function Invocations')?.key).toBe('function-invocations');
    });

    it('leaves unknown services unmatched instead of guessing', () =>
    {
        expect(matchVercelLimit('Observability Events')).toBeUndefined();
    });
});
