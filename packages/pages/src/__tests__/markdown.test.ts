import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../server/markdown';
import type { RewriteContext } from '../server/rewrite';

function context(sourcePath: string): RewriteContext
{
    return {
        sourcePath,
        slugBySourcePath: new Map([
            ['site/pages/index.md', '/'],
            ['site/pages/about.md', '/about'],
            ['site/pages/docs/intro.md', '/docs/intro'],
            ['site/posts/2026-07-21-launch.md', '/posts/launch'],
        ]),
        publicPrefix: 'site/public',
    };
}

describe('renderMarkdown', () =>
{
    it('renders basic markdown', async () =>
    {
        const html = await renderMarkdown('# Hello\n\nA **bold** move.');

        expect(html).toContain('Hello</h1>');
        expect(html).toContain('<strong>bold</strong>');
    });

    it('renders gfm tables', async () =>
    {
        const html = await renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');

        expect(html).toContain('<table>');
    });

    it('strips script tags and event handlers', async () =>
    {
        const html = await renderMarkdown('hi\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">');

        expect(html).not.toContain('<script>');
        expect(html).not.toContain('onerror');
    });

    it('gives headings anchor ids without a clobber prefix', async () =>
    {
        const html = await renderMarkdown('## Getting Started');

        expect(html).toContain('<h2 id="getting-started">');
    });

    it('highlights fenced code blocks with dual-theme shiki output', async () =>
    {
        const html = await renderMarkdown('```ts\nconst x: number = 1;\n```');

        expect(html).toContain('class="shiki');
        expect(html).toContain('--shiki-dark');
    });

    it('falls back to plain text for unknown code languages', async () =>
    {
        const html = await renderMarkdown('```notalanguage\nhello\n```');

        expect(html).toContain('hello');
    });

    it('rewrites relative markdown links to served routes', async () =>
    {
        const html = await renderMarkdown('[About](./about.md) and [Intro](docs/intro.md#setup)', context('site/pages/index.md'));

        expect(html).toContain('href="/about"');
        expect(html).toContain('href="/docs/intro#setup"');
    });

    it('rewrites parent-relative links across collections', async () =>
    {
        const html = await renderMarkdown('[Launch](../../posts/2026-07-21-launch.md)', context('site/pages/docs/intro.md'));

        expect(html).toContain('href="/posts/launch"');
    });

    it('rewrites public/ asset references to root-served URLs', async () =>
    {
        const html = await renderMarkdown('![Cover](../public/img/cover.png)', context('site/pages/about.md'));

        expect(html).toContain('src="/img/cover.png"');
    });

    it('leaves absolute, site-absolute, and anchor references untouched', async () =>
    {
        const html = await renderMarkdown('[a](https://spfn.dev) [b](/docs) [c](#top)', context('site/pages/index.md'));

        expect(html).toContain('href="https://spfn.dev"');
        expect(html).toContain('href="/docs"');
        expect(html).toContain('href="#top"');
    });

    it('leaves unresolvable relative links untouched', async () =>
    {
        const html = await renderMarkdown('[gone](./missing.md)', context('site/pages/index.md'));

        expect(html).toContain('href="./missing.md"');
    });
});
