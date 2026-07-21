import { describe, expect, it } from 'vitest';
import { buildSections } from '../server/sections';
import type { PageDoc } from '../shared/types';

function doc(slug: string, title: string, order?: number): PageDoc
{
    return { slug, sourcePath: `x${slug}.md`, frontmatter: { title, layout: 'doc', draft: false, order }, html: '' };
}

describe('buildSections', () =>
{
    it('nests docs under their first path segment, excluding the root landing', () =>
    {
        const sections = buildSections([
            doc('/', 'Home'),
            doc('/docs', 'Docs'),
            doc('/docs/pattern', 'The Pattern'),
            doc('/packages', 'Packages'),
            doc('/packages/core', '@spfn/core'),
            doc('/packages/core/db', '@spfn/core/db'),
        ]);

        expect(sections.map(s => s.route)).toEqual(['/docs', '/packages']);
        const core = sections[1].children[0];
        expect(core.route).toBe('/packages/core');
        expect(core.children.map(c => c.route)).toEqual(['/packages/core/db']);
    });

    it('marks a segment nobody serves as a label-only group node', () =>
    {
        const sections = buildSections([doc('/docs/guides/setup', 'Setup')]);
        const guides = sections[0].children[0];

        expect(sections[0]).toMatchObject({ route: '/docs', title: 'docs', hasDoc: false });
        expect(guides).toMatchObject({ route: '/docs/guides', title: 'guides', hasDoc: false });
        expect(guides.children[0]).toMatchObject({ route: '/docs/guides/setup', title: 'Setup', hasDoc: true });
    });

    it('anchors html pages in the tree so a landing links its subtree', () =>
    {
        const sections = buildSections(
            [doc('/packages/core/db', '@spfn/core/db')],
            [{ slug: '/packages/core', sourcePath: 'site/pages/packages/core.html', title: '@spfn/core', html: '' }],
        );
        const core = sections[0].children[0];

        expect(core).toMatchObject({ route: '/packages/core', title: '@spfn/core', hasDoc: true });
        expect(core.children.map(c => c.route)).toEqual(['/packages/core/db']);
    });

    it('orders siblings by frontmatter order, unordered after, ties by title', () =>
    {
        const sections = buildSections([
            doc('/docs/zeta', 'Zeta', 1),
            doc('/docs/alpha', 'Alpha'),
            doc('/docs/mid', 'Mid', 2),
        ]);

        expect(sections[0].children.map(c => c.title)).toEqual(['Zeta', 'Mid', 'Alpha']);
    });

    it('labels a node with navTitle over title', () =>
    {
        const page = doc('/docs/packages/db', '@spfn/core/db');
        page.frontmatter.navTitle = 'db';

        const sections = buildSections([page]);

        expect(sections[0].children[0].children[0]).toMatchObject({ route: '/docs/packages/db', title: 'db' });
    });
});
