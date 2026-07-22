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

    it('injects the posthog loader only when analytics is configured', async () =>
    {
        const { site, source } = await fixtureSite();
        const plain = await serveSiteRequest(site, source, '/about');
        expect(plain?.body).not.toContain('posthog');

        const withAnalytics = await loadSite(new MemoryContentSource({
            'spfn.site.yaml': 'name: Demo\nanalytics:\n  posthog:\n    key: phc_abc\n',
            'site/pages/about.md': '---\ntitle: About\n---\nHi.\n',
        }));
        const response = await serveSiteRequest(withAnalytics, source, '/about');
        expect(response?.body).toContain('us-assets.i.posthog.com/static/array.js');
        expect(response?.body).toContain('phc_abc');
        expect(response?.body).toContain('api_host:"https://us.i.posthog.com"');
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

    it('emits canonical, og:url, and og:site_name on rendered docs', async () =>
    {
        const { site, source } = await fixtureSite();

        const body = (await serveSiteRequest(site, source, '/about'))?.body as string;
        expect(body).toContain('<link rel="canonical" href="https://demo.example/about">');
        expect(body).toContain('<meta property="og:url" content="https://demo.example/about">');
        expect(body).toContain('<meta property="og:site_name" content="Demo">');

        const home = (await serveSiteRequest(site, source, '/'))?.body as string;
        expect(home).toContain('<link rel="canonical" href="https://demo.example/">');
    });

    it('injects a canonical link into html pages that lack one', async () =>
    {
        const { site, source } = await fixtureSite();

        const body = (await serveSiteRequest(site, source, '/playground'))?.body as string;
        expect(body).toContain('<link rel="canonical" href="https://demo.example/playground">');
        expect(body).toContain('<body>raw</body>');
    });

    it('generates sitemap.xml and robots.txt, letting a site-shipped file win', async () =>
    {
        const { site, source } = await fixtureSite();

        const sitemap = await serveSiteRequest(site, source, '/sitemap.xml');
        expect(sitemap?.contentType).toBe('application/xml');
        expect(sitemap?.body).toContain('<loc>https://demo.example/</loc>');
        expect(sitemap?.body).toContain('<loc>https://demo.example/playground</loc>');
        expect(sitemap?.body).toContain('<loc>https://demo.example/posts/launch</loc>');

        const robots = await serveSiteRequest(site, source, '/robots.txt');
        expect(robots?.body).toContain('Sitemap: https://demo.example/sitemap.xml');

        const shipped = new MemoryContentSource({
            'spfn.site.yaml': 'name: Demo\nurl: https://demo.example\n',
            'site/pages/index.md': '---\ntitle: Home\n---\nhi\n',
            'site/public/robots.txt': 'User-agent: *\nDisallow: /private\n',
        });
        const own = await serveSiteRequest(await loadSite(shipped), shipped, '/robots.txt');
        expect(new TextDecoder().decode(own?.body as Uint8Array)).toContain('Disallow: /private');
    });

    it('omits the seo surface when the config has no url', async () =>
    {
        const source = new MemoryContentSource({
            'spfn.site.yaml': 'name: Demo\n',
            'site/pages/about.md': '---\ntitle: About\n---\nHi.\n',
        });
        const site = await loadSite(source);

        expect((await serveSiteRequest(site, source, '/about'))?.body).not.toContain('canonical');
        expect(await serveSiteRequest(site, source, '/sitemap.xml')).toBeNull();
        expect(await serveSiteRequest(site, source, '/robots.txt')).toBeNull();
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
