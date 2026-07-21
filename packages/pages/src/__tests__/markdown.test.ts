import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../server/markdown';

describe('renderMarkdown', () =>
{
    it('renders basic markdown', async () =>
    {
        const html = await renderMarkdown('# Hello\n\nA **bold** move.');

        expect(html).toContain('<h1>Hello</h1>');
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
});
