import { describe, expect, it } from 'vitest';
import { parseDocument } from '../server/frontmatter';
import { FrontmatterError } from '../shared/errors';

describe('parseDocument', () =>
{
    it('applies defaults', () =>
    {
        const doc = parseDocument('---\ntitle: About\n---\nBody here.\n', 'doc');

        expect(doc.frontmatter.title).toBe('About');
        expect(doc.frontmatter.layout).toBe('doc');
        expect(doc.frontmatter.draft).toBe(false);
        expect(doc.body.trim()).toBe('Body here.');
    });

    it('normalizes yaml bare dates to YYYY-MM-DD strings', () =>
    {
        const doc = parseDocument('---\ntitle: Post\ndate: 2026-07-21\n---\n', 'post');

        expect(doc.frontmatter.date).toBe('2026-07-21');
    });

    it('rejects a document without a title', () =>
    {
        expect(() => parseDocument('---\nlayout: doc\n---\n', 'doc')).toThrow(FrontmatterError);
    });

    it('rejects an unknown layout', () =>
    {
        expect(() => parseDocument('---\ntitle: X\nlayout: gallery\n---\n', 'doc')).toThrow(FrontmatterError);
    });
});
