/**
 * @spfn/core - safeFetch redirect validation tests
 *
 * Regression guard for the SSRF redirect bypass: undici does not invoke the
 * pinning lookup for IP-literal targets, and the first-hop URL check doesn't
 * run on redirects — so a public first hop returning `302 → http://10.x` could
 * reach an internal address. createSafeFetch must re-validate every hop.
 *
 * undici is mocked: we assert which URLs reach dispatch and which are blocked
 * before dispatch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();

vi.mock('undici', () => ({
    fetch: (...args: unknown[]) => fetchMock(...args),
    Agent: class
    {
        close(): Promise<void> 
        {
            return Promise.resolve(); 
        }
    },
}));

import { createSafeFetch, SsrfBlockedError } from '../safe-fetch';

function mockResponse(status: number, location: string | null)
{
    return {
        status,
        headers: { get: (k: string) => (k.toLowerCase() === 'location' ? location : null) },
        body: { cancel: () => Promise.resolve() },
    };
}

describe('createSafeFetch redirect validation', () =>
{
    beforeEach(() => fetchMock.mockReset());

    it('blocks a redirect to a private IP literal (the headline bypass)', async () =>
    {
        fetchMock.mockResolvedValueOnce(mockResponse(302, 'http://169.254.169.254/latest/meta-data'));

        const safe = createSafeFetch();

        await expect(safe('https://public.example.com')).rejects.toBeInstanceOf(SsrfBlockedError);
        // First hop dispatched; the private redirect target is rejected BEFORE a second dispatch.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('blocks a redirect to loopback', async () =>
    {
        fetchMock.mockResolvedValueOnce(mockResponse(301, 'http://127.0.0.1:8080/admin'));

        await expect(createSafeFetch()('https://public.example.com')).rejects.toBeInstanceOf(SsrfBlockedError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('follows a redirect to a public host, without replaying method/body', async () =>
    {
        fetchMock
            .mockResolvedValueOnce(mockResponse(302, 'https://other-public.example.com/'))
            .mockResolvedValueOnce(mockResponse(200, null));

        const res = await createSafeFetch()('https://public.example.com', { method: 'POST', body: 'secret' });

        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        // Redirect hop must not forward the original POST body/headers to the new host.
        expect(fetchMock.mock.calls[1][1].method).toBe('GET');
        expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
        expect(fetchMock.mock.calls[1][1].redirect).toBe('manual');
    });

    it('enforces allowHosts on the redirect target, not just the first hop', async () =>
    {
        fetchMock.mockResolvedValueOnce(mockResponse(302, 'https://evil.example.com/'));

        const safe = createSafeFetch({ allowHosts: ['hooks.slack.com'] });

        await expect(safe('https://hooks.slack.com/services/x')).rejects.toBeInstanceOf(SsrfBlockedError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('caps redirect chains', async () =>
    {
        fetchMock.mockResolvedValue(mockResponse(302, 'https://loop.example.com/'));

        await expect(createSafeFetch({ maxRedirects: 3 })('https://public.example.com'))
            .rejects.toBeInstanceOf(SsrfBlockedError);
        expect(fetchMock).toHaveBeenCalledTimes(4); // hops 0..3, then capped
    });
});
