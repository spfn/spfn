import { describe, expect, it, vi } from 'vitest';
import { MemoryContentSource, loadSite } from '@spfn/pages/server';
import type { ContentSource } from '@spfn/pages/server';
import type { SiteContent } from '@spfn/pages';
import { HostedSiteCache, serveSiteRequest } from '../hosted';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

function fixtureSource(): MemoryContentSource
{
    return new MemoryContentSource({
        'spfn.site.yaml': 'name: Demo\ndescription: A demo site\nurl: https://demo.example\nlocale: ko\n',
        'site/pages/index.md': '---\ntitle: Home\nlayout: landing\n---\n# Welcome\n',
        'site/pages/about.md': '---\ntitle: About\n---\nWho we are.\n',
        'site/pages/playground.html': '<!doctype html><html><head><title>Play</title></head><body>raw</body></html>',
        'site/posts/2026-07-21-launch.md': '---\ntitle: Launch\ndate: 2026-07-21\n---\nWe launched.\n',
        'site/public/og.png': PNG,
        'site/public/favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
}

async function fixtureSite(): Promise<{ site: SiteContent; source: ContentSource }>
{
    const source = fixtureSource();

    return { site: await loadSite(source), source };
}

describe('serveSiteRequest', () =>
{
    it('renders markdown docs as complete documents with head metadata', async () =>
    {
        const { site, source } = await fixtureSite();

        const response = await serveSiteRequest(site, source, '/about');
        expect(response?.contentType).toContain('text/html');

        const body = response?.body as string;
        expect(body).toContain('<!doctype html>');
        expect(body).toContain('<html lang="ko">');
        expect(body).toContain('<title>About — Demo</title>');
        expect(body).toContain('Who we are.');
        expect(body).toContain('<meta property="og:image" content="https://demo.example/og.png">');
        expect(body).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    });

    it('serves raw html pages verbatim', async () =>
    {
        const { site, source } = await fixtureSite();

        const response = await serveSiteRequest(site, source, '/playground');
        expect(response?.body).toContain('<body>raw</body>');
    });

    it('serves the virtual posts index and normalizes trailing slashes', async () =>
    {
        const { site, source } = await fixtureSite();

        const response = await serveSiteRequest(site, source, '/posts/');
        expect(response?.body).toContain('Launch');
    });

    it('serves public assets as bytes with the right content type', async () =>
    {
        const { site, source } = await fixtureSite();

        const response = await serveSiteRequest(site, source, '/og.png');
        expect(response?.contentType).toBe('image/png');
        expect(response?.body).toEqual(PNG);
    });

    it('returns null for unknown paths and traversal attempts', async () =>
    {
        const { site, source } = await fixtureSite();

        expect(await serveSiteRequest(site, source, '/nope')).toBeNull();
        expect(await serveSiteRequest(site, source, '/../spfn.site.yaml')).toBeNull();
        expect(await serveSiteRequest(site, source, '/%2e%2e/secret.txt')).toBeNull();
    });
});

function githubFetchMock(state: { sha: string; files: Record<string, string> })
{
    return vi.fn(async (input: string | URL | Request) =>
    {
        const url = String(input);
        if (url.includes('/commits/'))
        {
            return new Response(state.sha, { status: 200 });
        }
        if (url.includes('/git/trees/'))
        {
            const tree = Object.keys(state.files).map(path => ({ path, type: 'blob' }));

            return new Response(JSON.stringify({ tree }), { status: 200 });
        }

        const path = url.split(`/${url.split('/')[5]}/`)[1];
        const rawPath = url.replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, '');
        const file = state.files[rawPath ?? path];

        return file === undefined
            ? new Response('nope', { status: 404 })
            : new Response(file, { status: 200 });
    }) as unknown as typeof fetch;
}

const REPO_FILES = {
    'spfn.site.yaml': 'name: Cached\n',
    'site/pages/index.md': '---\ntitle: Home\n---\n# v1\n',
};

describe('HostedSiteCache', () =>
{
    it('pins the site to the resolved head sha', async () =>
    {
        const state = { sha: 'aaa111', files: REPO_FILES };
        const cache = new HostedSiteCache({ fetchImpl: githubFetchMock(state) });

        const loaded = await cache.get('https://github.com/spfn/demo');
        expect(loaded.sha).toBe('aaa111');
        expect(loaded.site.config.name).toBe('Cached');
    });

    it('reuses the cached model within the head ttl and reloads on a new sha', async () =>
    {
        const state = { sha: 'aaa111', files: REPO_FILES };
        const fetchImpl = githubFetchMock(state);
        const cache = new HostedSiteCache({ fetchImpl, headTtlMs: 0 });

        const first = await cache.get('https://github.com/spfn/demo');
        const again = await cache.get('https://github.com/spfn/demo');
        expect(again.site).toBe(first.site);

        state.sha = 'bbb222';
        state.files = { ...REPO_FILES, 'site/pages/index.md': '---\ntitle: Home\n---\n# v2\n' };

        const updated = await cache.get('https://github.com/spfn/demo');
        expect(updated.sha).toBe('bbb222');
        expect(updated.site).not.toBe(first.site);
    });

    it('serves the last known sha when head resolution fails', async () =>
    {
        const state = { sha: 'aaa111', files: REPO_FILES };
        const fetchImpl = githubFetchMock(state);
        const cache = new HostedSiteCache({ fetchImpl, headTtlMs: 0 });

        const first = await cache.get('https://github.com/spfn/demo');

        (fetchImpl as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('github down'));
        const fallback = await cache.get('https://github.com/spfn/demo');
        expect(fallback.sha).toBe(first.sha);
    });

    it('evicts the least recently used site beyond maxSites', async () =>
    {
        const state = { sha: 'aaa111', files: REPO_FILES };
        const cache = new HostedSiteCache({ fetchImpl: githubFetchMock(state), maxSites: 1 });

        const first = await cache.get('https://github.com/spfn/one');
        await cache.get('https://github.com/spfn/two');

        const reloaded = await cache.get('https://github.com/spfn/one');
        expect(reloaded.site).not.toBe(first.site);
    });
});
