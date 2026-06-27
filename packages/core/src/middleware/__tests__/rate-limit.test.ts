/**
 * @spfn/core - Rate limit middleware tests
 *
 * The cache is mocked so the limiter logic is tested without Redis. eval()
 * returns the [count, pttl] the Lua counter would produce.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const evalMock = vi.fn();
let cacheClient: { eval: typeof evalMock } | undefined = { eval: evalMock };
let cacheDisabled = false;

vi.mock('../../cache', () => ({
    getCache: () => cacheClient,
    isCacheDisabled: () => cacheDisabled,
}));

import { rateLimit } from '../rate-limit';
import { TooManyRequestsError } from '../../errors';

function makeCtx(headers: Record<string, string> = {})
{
    const setHeaders: Record<string, string> = {};

    return {
        req: {
            header: (name: string) => headers[name.toLowerCase()],
            path: '/_auth/login',
            method: 'POST',
            routePath: '/_auth/login',
        },
        get: () => undefined,
        header: (name: string, value: string) => { setHeaders[name] = value; },
        _setHeaders: setHeaders,
    } as never;
}

describe('rateLimit middleware', () =>
{
    beforeEach(() =>
    {
        evalMock.mockReset();
        cacheClient = { eval: evalMock };
        cacheDisabled = false;
    });

    it('allows a request under the limit', async () =>
    {
        evalMock.mockResolvedValue([1, 60_000]);
        const next = vi.fn().mockResolvedValue(undefined);

        await rateLimit({ limit: 5, windowMs: 60_000 })(makeCtx({ 'x-forwarded-for': '1.2.3.4' }), next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects with 429 and Retry-After when over the limit', async () =>
    {
        evalMock.mockResolvedValue([6, 30_000]);
        const ctx = makeCtx({ 'x-forwarded-for': '1.2.3.4' }) as never as { _setHeaders: Record<string, string> };
        const next = vi.fn();

        await expect(rateLimit({ limit: 5, windowMs: 60_000 })(ctx as never, next))
            .rejects.toBeInstanceOf(TooManyRequestsError);
        expect(next).not.toHaveBeenCalled();
        expect(ctx._setHeaders['Retry-After']).toBe('30');
    });

    it('fails open (allows through) when the cache is unavailable', async () =>
    {
        cacheClient = undefined;
        const next = vi.fn().mockResolvedValue(undefined);

        await rateLimit({ limit: 5, windowMs: 60_000 })(makeCtx(), next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(evalMock).not.toHaveBeenCalled();
    });

    it('fails closed when configured and the cache is unavailable', async () =>
    {
        cacheClient = undefined;
        const next = vi.fn();

        await expect(rateLimit({ limit: 5, windowMs: 60_000, failClosed: true })(makeCtx(), next))
            .rejects.toBeInstanceOf(TooManyRequestsError);
        expect(next).not.toHaveBeenCalled();
    });

    it('limits each dimension independently — the strictest wins', async () =>
    {
        // IP is fine (1), but the account dimension is over (6)
        evalMock.mockResolvedValueOnce([1, 60_000]).mockResolvedValueOnce([6, 20_000]);
        const next = vi.fn();

        await expect(
            rateLimit({ limit: 5, windowMs: 60_000, by: () => ['1.2.3.4', 'user@example.com'] })(makeCtx(), next),
        ).rejects.toBeInstanceOf(TooManyRequestsError);
        expect(next).not.toHaveBeenCalled();
        expect(evalMock).toHaveBeenCalledTimes(2);
    });
});
