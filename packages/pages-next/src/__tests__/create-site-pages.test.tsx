import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryContentSource } from '@spfn/pages/server';
import { createSitePages } from '../create-site-pages';

function fixtureSite()
{
    return createSitePages({
        source: () => new MemoryContentSource({
            'spfn.site.yaml': 'name: Demo\ndescription: A demo site\nnav:\n  - label: About\n    path: /about\n',
            'site/pages/index.md': '---\ntitle: Home\n---\n# Welcome\n',
            'site/pages/about.md': '---\ntitle: About\nog: cover.png\n---\nWho we are. See [home](./index.md).\n',
            'site/posts/2026-07-21-launch.md': '---\ntitle: Launch\ndate: 2026-07-21\n---\nWe launched.\n',
        }),
    });
}

async function renderSlug(app: ReturnType<typeof createSitePages>, slug: string[]): Promise<string>
{
    return renderToStaticMarkup(await app.Page({ params: Promise.resolve({ slug }) }));
}

describe('createSitePages', () =>
{
    it('generates static params for pages, posts, and the posts index', async () =>
    {
        const params = await fixtureSite().generateStaticParams();

        expect(params).toContainEqual({ slug: [] });
        expect(params).toContainEqual({ slug: ['about'] });
        expect(params).toContainEqual({ slug: ['posts', 'launch'] });
        expect(params).toContainEqual({ slug: ['posts'] });
    });

    it('renders the landing page with theme css and nav', async () =>
    {
        const html = await renderSlug(fixtureSite(), []);

        expect(html).toContain('Welcome</h1>');
        expect(html).toContain('class="sf-nav"');
        expect(html).toContain('<style>');
    });

    it('renders a doc page with its frontmatter title and rewritten links', async () =>
    {
        const html = await renderSlug(fixtureSite(), ['about']);

        expect(html).toContain('<h1 class="sf-title">About</h1>');
        expect(html).toContain('href="/"');
    });

    it('renders a post with its date and the virtual posts index', async () =>
    {
        const app = fixtureSite();

        expect(await renderSlug(app, ['posts', 'launch'])).toContain('<time dateTime="2026-07-21">');
        expect(await renderSlug(app, ['posts'])).toContain('href="/posts/launch"');
    });

    it('throws notFound for an unknown slug', async () =>
    {
        await expect(fixtureSite().Page({ params: Promise.resolve({ slug: ['nope'] }) })).rejects.toThrow();
    });

    it('builds metadata: site name at root, title — name elsewhere, og image path', async () =>
    {
        const app = fixtureSite();

        expect((await app.generateMetadata({ params: Promise.resolve({ slug: [] }) })).title).toBe('Demo');

        const about = await app.generateMetadata({ params: Promise.resolve({ slug: ['about'] }) });
        expect(about.title).toBe('About — Demo');
        expect(about.openGraph?.images).toEqual(['/cover.png']);
    });
});
