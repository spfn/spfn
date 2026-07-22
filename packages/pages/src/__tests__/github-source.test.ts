import { describe, expect, it, vi } from 'vitest';
import { GithubContentSource, parseGithubUrl } from '../server/github-source';
import { PagesError } from '../shared/errors';

describe('parseGithubUrl', () =>
{
    it('parses owner/repo with default branch', () =>
    {
        expect(parseGithubUrl('https://github.com/spfn/spfn')).toEqual({ owner: 'spfn', repo: 'spfn', branch: 'main' });
    });

    it('parses .git suffix, trailing slash, and tree/branch urls', () =>
    {
        expect(parseGithubUrl('https://github.com/spfn/spfn.git').repo).toBe('spfn');
        expect(parseGithubUrl('https://github.com/spfn/spfn/').repo).toBe('spfn');
        expect(parseGithubUrl('https://github.com/spfn/spfn/tree/develop').branch).toBe('develop');
    });

    it('rejects non-github urls', () =>
    {
        expect(() => parseGithubUrl('https://gitlab.com/a/b')).toThrow(PagesError);
        expect(() => parseGithubUrl('not a url')).toThrow(PagesError);
    });
});

function jsonResponse(body: unknown, etag: string): Response
{
    return new Response(JSON.stringify(body), { status: 200, headers: { etag } });
}

describe('GithubContentSource', () =>
{
    it('lists blobs from the tree api', async () =>
    {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
            tree: [
                { path: 'spfn.site.yaml', type: 'blob' },
                { path: 'site', type: 'tree' },
                { path: 'site/pages/index.md', type: 'blob' },
            ],
        }, 'W/"t1"'));

        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });

        expect(await source.getTree()).toEqual(['spfn.site.yaml', 'site/pages/index.md']);
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://api.github.com/repos/spfn/spfn/git/trees/main?recursive=1',
            expect.anything(),
        );
    });

    it('serves 304 responses from the etag cache', async () =>
    {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response('# hello', { status: 200, headers: { etag: '"e1"' } }))
            .mockResolvedValueOnce(new Response(null, { status: 304 }));

        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });

        expect(await source.getFile('site/pages/index.md')).toBe('# hello');
        expect(await source.getFile('site/pages/index.md')).toBe('# hello');

        const secondCall = fetchImpl.mock.calls[1][1] as { headers: Record<string, string> };
        expect(secondCall.headers['If-None-Match']).toBe('"e1"');
    });

    it('returns null for missing files', async () =>
    {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });

        expect(await source.getFile('missing.md')).toBeNull();
    });

    it('invalidate clears the cache', async () =>
    {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response('v1', { status: 200, headers: { etag: '"e1"' } }))
            .mockResolvedValueOnce(new Response('v2', { status: 200, headers: { etag: '"e2"' } }));

        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });
        await source.getFile('a.md');
        source.invalidate();

        expect(await source.getFile('a.md')).toBe('v2');

        const secondCall = fetchImpl.mock.calls[1][1] as { headers: Record<string, string> };
        expect(secondCall.headers['If-None-Match']).toBeUndefined();
    });

    it('ref option pins tree and raw reads to a commit sha', async () =>
    {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('body', { status: 200 }));
        const sha = 'abc123def456';
        const source = new GithubContentSource('https://github.com/spfn/spfn/tree/develop', { fetchImpl, ref: sha });

        await source.getFile('site/pages/index.md');
        expect(fetchImpl).toHaveBeenCalledWith(
            `https://raw.githubusercontent.com/spfn/spfn/${sha}/site/pages/index.md`,
            expect.anything(),
        );
    });

    it('atRef returns a pinned source over the same repo', async () =>
    {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('body', { status: 200 }));
        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });
        const pinned = source.atRef('abc123');

        expect(pinned.boundRef).toEqual({ owner: 'spfn', repo: 'spfn', branch: 'abc123' });

        await pinned.getFile('a.md');
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://raw.githubusercontent.com/spfn/spfn/abc123/a.md',
            expect.anything(),
        );
    });

    it('resolveHeadSha reads the commits endpoint with the sha media type', async () =>
    {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response('abc123def456\n', { status: 200, headers: { etag: '"s1"' } }))
            .mockResolvedValueOnce(new Response(null, { status: 304 }));

        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });

        expect(await source.resolveHeadSha()).toBe('abc123def456');
        expect(await source.resolveHeadSha()).toBe('abc123def456');

        const firstCall = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
        expect(firstCall[0]).toBe('https://api.github.com/repos/spfn/spfn/commits/main');
        expect(firstCall[1].headers.accept).toBe('application/vnd.github.sha');

        const secondCall = fetchImpl.mock.calls[1][1] as { headers: Record<string, string> };
        expect(secondCall.headers['If-None-Match']).toBe('"s1"');
    });

    it('resolveHeadSha throws for a missing repo or ref', async () =>
    {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });

        await expect(source.resolveHeadSha()).rejects.toThrow(PagesError);
    });

    it('getBinary returns bytes and revalidates through the etag cache', async () =>
    {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response(bytes, { status: 200, headers: { etag: '"b1"' } }))
            .mockResolvedValueOnce(new Response(null, { status: 304 }));

        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });

        expect(await source.getBinary('site/public/og.png')).toEqual(bytes);
        expect(await source.getBinary('site/public/og.png')).toEqual(bytes);

        const secondCall = fetchImpl.mock.calls[1][1] as { headers: Record<string, string> };
        expect(secondCall.headers['If-None-Match']).toBe('"b1"');
    });

    it('getBinary returns null for missing files', async () =>
    {
        const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));
        const source = new GithubContentSource('https://github.com/spfn/spfn', { fetchImpl });

        expect(await source.getBinary('missing.png')).toBeNull();
    });
});
