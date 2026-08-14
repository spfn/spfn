import { describe, expect, it } from 'vitest';

import { addCron, normalizeDeployUrl } from '../cloud/keepalive.js';
import { matchVercelLimit } from '../cloud/collect.js';
import { sessionPoolerUrl } from '../cloud/env.js';

describe('sessionPoolerUrl', () =>
{
    // Template shape as the Management API returns it (captured live 2026-08-14).
    const TEMPLATE = 'postgresql://postgres.abcdefghij:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

    it('fills the password placeholder and pins session mode (5432) for migration compatibility', () =>
    {
        expect(sessionPoolerUrl(TEMPLATE, 'hunter2'))
            .toBe('postgresql://postgres.abcdefghij:hunter2@aws-0-us-east-1.pooler.supabase.com:5432/postgres');
    });

    it('URL-encodes password characters that would break the connection string', () =>
    {
        expect(sessionPoolerUrl(TEMPLATE, 'p@ss/word')).toContain(':p%40ss%2Fword@');
    });
});

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

    it('rejects inputs that would silently become a wrong host', () =>
    {
        expect(normalizeDeployUrl('/foo')).toBeNull();
        expect(normalizeDeployUrl('ftp://foo.example.com')).toBeNull();
        expect(normalizeDeployUrl('file:///etc/passwd')).toBeNull();
        expect(normalizeDeployUrl('C:\\temp')).toBeNull();
        expect(normalizeDeployUrl('localhost')).toBeNull();
    });

    it('keeps only the origin — a pasted path cannot silently survive into the workflow', () =>
    {
        expect(normalizeDeployUrl('myapp.vercel.app/base/')).toBe('https://myapp.vercel.app/');
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

    it('never matches per-day or concurrent limits — the usage window is a 30-day sum', () =>
    {
        expect(matchVercelLimit('Deployments')).toBeUndefined();
        expect(matchVercelLimit('Concurrent Builds')).toBeUndefined();
    });
});
