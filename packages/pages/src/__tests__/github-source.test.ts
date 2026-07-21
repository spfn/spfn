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
});
