import { visit } from 'unist-util-visit';
import type { Element, Root } from 'hast';

/**
 * Repo-aware reference rewriting. Authors (usually AIs) link between files the way
 * the repo is laid out — `./about.md`, `../public/cover.png` — and those references
 * must land on served routes, not repo paths.
 */
export interface RewriteContext
{
    /** Repo-relative path of the markdown file being rendered. */
    sourcePath: string;
    /** Repo-relative markdown path → served slug, e.g. 'site/pages/about.md' → '/about'. */
    slugBySourcePath: ReadonlyMap<string, string>;
    /** Repo-relative public dir (e.g. 'site/public'); assets under it are served from '/'. */
    publicPrefix: string;
}

/** Rehype plugin: rewrite relative hrefs/srcs to served routes and asset URLs. */
export function rehypeRewriteRefs(context: RewriteContext)
{
    return (tree: Root): void =>
    {
        visit(tree, 'element', (node: Element) =>
        {
            const attribute = refAttribute(node);
            if (attribute && typeof node.properties[attribute] === 'string')
            {
                node.properties[attribute] = rewriteRef(node.properties[attribute] as string, context);
            }
        });
    };
}

function refAttribute(node: Element): 'href' | 'src' | null
{
    if (node.tagName === 'a')
    {
        return 'href';
    }

    return node.tagName === 'img' ? 'src' : null;
}

function rewriteRef(ref: string, context: RewriteContext): string
{
    if (!isRelative(ref))
    {
        return ref;
    }

    const [path, suffix] = splitSuffix(ref);
    const resolved = resolveFrom(dirOf(context.sourcePath), path);

    const slug = context.slugBySourcePath.get(resolved);
    if (slug !== undefined)
    {
        return slug + suffix;
    }
    if (resolved.startsWith(`${context.publicPrefix}/`))
    {
        return `/${resolved.slice(context.publicPrefix.length + 1)}${suffix}`;
    }

    return ref;
}

/** Absolute URLs, protocol-relative refs, site-absolute paths, and pure anchors stay untouched. */
function isRelative(ref: string): boolean
{
    return !/^[a-z][a-z0-9+.-]*:/i.test(ref) && !ref.startsWith('/') && !ref.startsWith('#');
}

/** Split off the '?query#hash' tail so path resolution only sees the path. */
function splitSuffix(ref: string): [string, string]
{
    const at = ref.search(/[?#]/);

    return at === -1 ? [ref, ''] : [ref.slice(0, at), ref.slice(at)];
}

function dirOf(path: string): string
{
    const at = path.lastIndexOf('/');

    return at === -1 ? '' : path.slice(0, at);
}

function resolveFrom(dir: string, relative: string): string
{
    const segments = dir === '' ? [] : dir.split('/');

    for (const segment of relative.split('/'))
    {
        if (segment === '..')
        {
            segments.pop();
        }
        else if (segment !== '' && segment !== '.')
        {
            segments.push(segment);
        }
    }

    return segments.join('/');
}
