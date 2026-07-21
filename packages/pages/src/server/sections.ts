import type { HtmlPage, NavNode, PageDoc } from '../shared/types';

interface TreeNode
{
    title: string;
    hasDoc: boolean;
    order?: number;
    children: Map<string, TreeNode>;
}

/**
 * Section navigation trees derived from served slugs — markdown docs and raw
 * HTML pages alike (an HTML landing anchors its subtree even though it renders
 * outside the layout). The first path segment is the section, deeper segments
 * nest. A segment nobody serves becomes a label-only group node. Siblings (and
 * sections themselves) order by frontmatter `order` ascending, unordered nodes
 * after, ties by title; HTML pages have no frontmatter and sort by title.
 */
export function buildSections(docs: PageDoc[], htmlPages: HtmlPage[] = []): NavNode[]
{
    const root: TreeNode = { title: '', hasDoc: false, children: new Map() };

    for (const doc of docs)
    {
        if (doc.slug !== '/')
        {
            insert(root, doc.slug, doc.frontmatter.title, doc.frontmatter.order);
        }
    }
    for (const page of htmlPages)
    {
        if (page.slug !== '/')
        {
            insert(root, page.slug, page.title, undefined);
        }
    }

    return toNavNodes(root, '');
}

function insert(root: TreeNode, slug: string, title: string, order: number | undefined): void
{
    let node = root;
    for (const segment of slug.slice(1).split('/'))
    {
        const child = node.children.get(segment) ?? { title: segment, hasDoc: false, children: new Map() };
        node.children.set(segment, child);
        node = child;
    }

    node.hasDoc = true;
    node.title = title;
    node.order = order;
}

function toNavNodes(node: TreeNode, route: string): NavNode[]
{
    return [...node.children.entries()]
        .map(([segment, child]) => ({
            route: `${route}/${segment}`,
            title: child.title,
            hasDoc: child.hasDoc,
            order: child.order,
            children: toNavNodes(child, `${route}/${segment}`),
        }))
        .sort(bySortKey)
        .map(({ order: _order, ...nav }) => nav);
}

function bySortKey(a: { order?: number; title: string }, b: { order?: number; title: string }): number
{
    const orderA = a.order ?? Number.POSITIVE_INFINITY;
    const orderB = b.order ?? Number.POSITIVE_INFINITY;

    return orderA !== orderB ? orderA - orderB : a.title.localeCompare(b.title);
}
