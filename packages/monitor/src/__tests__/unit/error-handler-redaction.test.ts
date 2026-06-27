/**
 * createMonitorErrorHandler — sensitive data redaction (S-H3 / S-M2 / S-L3)
 *
 * Request headers and query params are persisted to error_events and forwarded to
 * Slack, so secrets must be redacted before they leave this handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { trackError } = vi.hoisted(() => ({
    trackError: vi.fn(async (_err: Error, _ctx: unknown, _meta?: unknown) => undefined),
}));

vi.mock('../../server/services', () => ({ trackError }));
vi.mock('@spfn/monitor/config', () => ({ getMinStatusCode: () => 500 }));

import { createMonitorErrorHandler } from '../../server/integrations/error-handler';

const ctx = {
    statusCode: 500,
    path: '/x',
    method: 'GET',
    timestamp: new Date().toISOString(),
    request: {
        headers: { authorization: 'Bearer secret', cookie: 'sid=abc', 'set-cookie': 'sid=abc', 'content-type': 'application/json' },
        query: { token: 'reset-secret', code: 'oauth-code', page: '2' },
    },
};

describe('createMonitorErrorHandler — redaction', () =>
{
    beforeEach(() => vi.clearAllMocks());

    it('redacts sensitive headers and query params before tracking', async () =>
    {
        const handler = createMonitorErrorHandler();
        await handler(new Error('boom'), ctx as any);

        expect(trackError).toHaveBeenCalledTimes(1);
        const passed = trackError.mock.calls[0][1] as any;

        expect(passed.headers.authorization).toBe('***');
        expect(passed.headers.cookie).toBe('***');
        expect(passed.headers['set-cookie']).toBe('***');
        expect(passed.headers['content-type']).toBe('application/json'); // non-sensitive kept

        expect(passed.query.token).toBe('***');
        expect(passed.query.code).toBe('***');
        expect(passed.query.page).toBe('2'); // non-sensitive kept
    });
});
