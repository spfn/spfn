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
        expect(site.problems).toHaveLength(1);
        expect(site.problems[0].path).toBe('site/pages/broken.md');
    });

    it('renders sanitized html bodies', async () =>
    {
        const site = await loadSite(fixtureSource());

        expect(site.pages.find(p => p.slug === '/')?.html).toContain('<h1>Welcome</h1>');
    });

    it('throws when spfn.site.yaml is missing — no opt-in, no site', async () =>
    {
        const source = new MemoryContentSource({ 'site/pages/index.md': '---\ntitle: X\n---\n' });

        await expect(loadSite(source)).rejects.toThrow(SiteConfigError);
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

        expect(problems.map(p => p.path)).toEqual(['site/pages/broken.md']);
    });
});
