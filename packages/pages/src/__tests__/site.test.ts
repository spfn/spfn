import { describe, expect, it } from 'vitest';
import { MemoryContentSource } from '../server/content-source';
import { loadSite, validateSite } from '../server/site';
import { SiteConfigError } from '../shared/errors';

function fixtureSource(): MemoryContentSource
{
    return new MemoryContentSource({
        'spfn.site.yaml': 'name: Superfunction\n',
        'site/pages/index.md': '---\ntitle: Home\n---\n# Welcome\n',
        'site/pages/about.md': '---\ntitle: About\n---\nWho we are.\n',
        'site/pages/docs/intro.md': '---\ntitle: Intro\n---\nStart here.\n',
        'site/pages/hidden.md': '---\ntitle: Hidden\ndraft: true\n---\nnot yet\n',
        'site/pages/broken.md': 'no frontmatter at all\n',
        'site/posts/2026-07-01-first.md': '---\ntitle: First\ndate: 2026-07-01\n---\nolder\n',
        'site/posts/2026-07-21-launch.md': '---\ntitle: Launch\ndate: 2026-07-21\n---\nnewer\n',
        'site/theme/tokens.json': '{"color":{"bg":"#101010"}}',
        'site/theme/custom.css': 'body { margin: 0; }',
        'site/pages/playground.html': '<!doctype html><html><head><title>Playground</title></head><body><script>run()</script></body></html>',
        'site/pages/untitled.html': '<!doctype html><html><body>bare</body></html>',
        'site/pages/about.html': '<!doctype html><html><head><title>Shadow</title></head><body>conflict</body></html>',
    });
}

describe('loadSite', () =>
{
    it('loads config, pages, posts, and theme from the content root', async () =>
    {
        const site = await loadSite(fixtureSource());

        expect(site.config.name).toBe('Superfunction');
        expect(site.pages.map(p => p.slug).sort()).toEqual(['/', '/about', '/docs/intro']);
        expect(site.posts.map(p => p.slug)).toEqual(['/posts/launch', '/posts/first']);
        expect(site.themeCss).toContain('--sf-color-bg: #101010;');
        expect(site.themeCss).toContain('body { margin: 0; }');
    });

    it('assigns default layouts: index=landing, page=doc, post=post', async () =>
    {
        const site = await loadSite(fixtureSource());

        expect(site.pages.find(p => p.slug === '/')?.frontmatter.layout).toBe('landing');
        expect(site.pages.find(p => p.slug === '/about')?.frontmatter.layout).toBe('doc');
        expect(site.posts[0].frontmatter.layout).toBe('post');
    });

    it('excludes drafts and collects per-file problems without failing', async () =>
    {
        const site = await loadSite(fixtureSource());

        expect(site.pages.find(p => p.slug === '/hidden')).toBeUndefined();
        expect(site.problems.map(p => p.path)).toEqual(['site/pages/broken.md', 'site/pages/about.html']);
    });

    it('serves html pages verbatim with titles from <title>', async () =>
    {
        const site = await loadSite(fixtureSource());
        const playground = site.htmlPages.find(p => p.slug === '/playground');

        expect(playground?.title).toBe('Playground');
        expect(playground?.html).toContain('<script>run()</script>');
        expect(site.htmlPages.find(p => p.slug === '/untitled')?.title).toBe('untitled');
    });

    it('reports an html page whose slug collides with a markdown page and skips it', async () =>
    {
        const site = await loadSite(fixtureSource());

        expect(site.htmlPages.find(p => p.slug === '/about')).toBeUndefined();
        expect(site.problems.some(p => p.path === 'site/pages/about.html')).toBe(true);
    });

    it('renders sanitized html bodies', async () =>
    {
        const site = await loadSite(fixtureSource());

        expect(site.pages.find(p => p.slug === '/')?.html).toContain('Welcome</h1>');
    });

    it('throws when spfn.site.yaml is missing — no opt-in, no site', async () =>
    {
        const source = new MemoryContentSource({ 'site/pages/index.md': '---\ntitle: X\n---\n' });

        await expect(loadSite(source)).rejects.toThrow(SiteConfigError);
    });

    it('leaves favicon and ogImage unset without well-known public assets', async () =>
    {
        const site = await loadSite(fixtureSource());

        expect(site.favicon).toBeUndefined();
        expect(site.ogImage).toBeUndefined();
    });

    it('detects well-known public assets by convention, svg favicon first', async () =>
    {
        const site = await loadSite(new MemoryContentSource({
            'spfn.site.yaml': 'name: X\n',
            'site/pages/index.md': '---\ntitle: Home\n---\nhi\n',
            'site/public/favicon.png': 'png-bytes',
            'site/public/favicon.svg': '<svg/>',
            'site/public/og.png': 'png-bytes',
        }));

        expect(site.favicon).toBe('/favicon.svg');
        expect(site.ogImage).toBe('/og.png');
    });
});

describe('loadSite — mounts', () =>
{
    function mountedSource(): MemoryContentSource
    {
        return new MemoryContentSource({
            'spfn.site.yaml': [
                'name: X',
                'repo: https://github.com/spfn/spfn',
                'mounts:',
                '  - source: packages/core/README.md',
                '    route: /packages/core',
                '    title: "@spfn/core"',
                '  - source: guides',
                '    route: /docs/guides',
            ].join('\n'),
            'site/pages/index.md': '---\ntitle: Home\n---\nSee [core](../../packages/core/README.md).\n',
            'packages/core/README.md': '# Core\n\nRead the [setup guide](../../guides/setup.md) or [the source](./src/server.ts).\n',
            'packages/core/src/server.ts': 'export {};',
            'guides/setup.md': '# Setup Guide\n\nBack to [core](../packages/core/README.md).\n',
            'guides/nested/README.md': '# Nested\n\nhi\n',
        });
    }

    it('serves file and directory mounts as routable docs', async () =>
    {
        const site = await loadSite(mountedSource());
        const slugs = site.mounted.map(doc => doc.slug).sort();

        expect(slugs).toEqual(['/docs/guides/nested', '/docs/guides/setup', '/packages/core']);
    });

    it('takes titles from mount config, then first heading (stripped from the body)', async () =>
    {
        const site = await loadSite(mountedSource());
        const core = site.mounted.find(doc => doc.slug === '/packages/core');
        const setup = site.mounted.find(doc => doc.slug === '/docs/guides/setup');

        expect(core?.frontmatter.title).toBe('@spfn/core');
        expect(setup?.frontmatter.title).toBe('Setup Guide');
        expect(setup?.html).not.toContain('Setup Guide</h1>');
    });

    it('resolves links between mounted docs, from site pages into mounts, and code files to the repo', async () =>
    {
        const site = await loadSite(mountedSource());
        const core = site.mounted.find(doc => doc.slug === '/packages/core');
        const setup = site.mounted.find(doc => doc.slug === '/docs/guides/setup');
        const home = site.pages.find(doc => doc.slug === '/');

        expect(core?.html).toContain('href="/docs/guides/setup"');
        expect(setup?.html).toContain('href="/packages/core"');
        expect(home?.html).toContain('href="/packages/core"');
        expect(core?.html).toContain('href="https://github.com/spfn/spfn/blob/main/packages/core/src/server.ts"');
    });

    it('reports missing sources, route conflicts, and mounts without repo', async () =>
    {
        const site = await loadSite(new MemoryContentSource({
            'spfn.site.yaml': [
                'name: X',
                'mounts:',
                '  - source: missing/README.md',
                '    route: /gone',
                '  - source: real/README.md',
                '    route: /about',
            ].join('\n'),
            'site/pages/index.md': '---\ntitle: Home\n---\nhi\n',
            'site/pages/about.md': '---\ntitle: About\n---\nhi\n',
            'real/README.md': '# Real\n',
        }));

        expect(site.mounted).toEqual([]);
        expect(site.problems.map(p => p.path)).toEqual(expect.arrayContaining(['spfn.site.yaml', 'missing/README.md', 'real/README.md']));
    });
});

describe('validateSite', () =>
{
    it('reports a missing opt-in file as a problem instead of throwing', async () =>
    {
        const problems = await validateSite(new MemoryContentSource({}));

        expect(problems).toHaveLength(1);
        expect(problems[0].path).toBe('spfn.site.yaml');
    });

    it('returns per-file problems for a valid site', async () =>
    {
        const problems = await validateSite(fixtureSource());

        expect(problems.map(p => p.path)).toEqual(['site/pages/broken.md', 'site/pages/about.html']);
    });
});
