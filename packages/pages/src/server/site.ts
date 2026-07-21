import { SITE_CONFIG_FILE, type HtmlPage, type PageDoc, type PageLayout, type SiteConfig, type SiteContent, type SiteProblem } from '../shared/types';
import { SiteConfigError } from '../shared/errors';
import { parseSiteConfig } from './config';
import { parseDocument } from './frontmatter';
import { renderMarkdown } from './markdown';
import { CODE_DARK_CSS, buildThemeCss } from './theme';
import type { ContentSource } from './content-source';
import type { RewriteContext } from './rewrite';

/**
 * Load a full site from a content source: opt-in config, pages, posts, raw HTML
 * pages, theme. Per-file failures land in `problems` (the file is skipped); a
 * missing or invalid `spfn.site.yaml` throws — the repo has not (validly) opted
 * into publishing.
 */
export async function loadSite(source: ContentSource): Promise<SiteContent>
{
    const configText = await source.getFile(SITE_CONFIG_FILE);
    if (configText === null)
    {
        throw new SiteConfigError(`${SITE_CONFIG_FILE} not found at the repo root — the repo has not opted into publishing`);
    }

    const config = parseSiteConfig(configText);
    const tree = await source.getTree();
    const problems: SiteProblem[] = [];
    const slugBySourcePath = mapSlugs(tree, config);

    const pages = await loadCollection(source, tree, config, 'pages', slugBySourcePath, problems);
    const posts = await loadCollection(source, tree, config, 'posts', slugBySourcePath, problems);

    return {
        config,
        pages,
        posts,
        htmlPages: await loadHtmlPages(source, tree, config, usedSlugs(pages, posts), problems),
        themeCss: await loadTheme(source, config, problems),
        favicon: findWellKnownAsset(tree, config, FAVICON_NAMES),
        ogImage: findWellKnownAsset(tree, config, OG_IMAGE_NAMES),
        problems,
    };
}

/** Registration-time check: every problem the site has, without throwing. */
export async function validateSite(source: ContentSource): Promise<SiteProblem[]>
{
    try
    {
        return (await loadSite(source)).problems;
    }
    catch (error)
    {
        return [{ path: SITE_CONFIG_FILE, message: (error as Error).message }];
    }
}

type Collection = 'pages' | 'posts';

function contentPath(config: SiteConfig, ...segments: string[]): string
{
    return [config.root, ...segments].filter(Boolean).join('/');
}

function collectionFiles(tree: string[], config: SiteConfig, collection: Collection, extension: string): string[]
{
    const prefix = contentPath(config, collection) + '/';

    return tree.filter(p => p.startsWith(prefix) && p.endsWith(extension));
}

/** Every markdown file's served slug, drafts included — links resolve by path, not by load result. */
function mapSlugs(tree: string[], config: SiteConfig): Map<string, string>
{
    const slugs = new Map<string, string>();

    for (const collection of ['pages', 'posts'] as const)
    {
        const prefix = contentPath(config, collection) + '/';
        for (const path of collectionFiles(tree, config, collection, '.md'))
        {
            slugs.set(path, docSlug(collection, path.slice(prefix.length)));
        }
    }

    return slugs;
}

async function loadCollection(source: ContentSource, tree: string[], config: SiteConfig, collection: Collection, slugBySourcePath: ReadonlyMap<string, string>, problems: SiteProblem[]): Promise<PageDoc[]>
{
    const prefix = contentPath(config, collection) + '/';
    const docs: PageDoc[] = [];

    for (const path of collectionFiles(tree, config, collection, '.md'))
    {
        const context: RewriteContext = {
            sourcePath: path,
            slugBySourcePath,
            publicPrefix: contentPath(config, 'public'),
        };
        const doc = await loadDocument(source, path, prefix, collection, context, problems);
        if (doc && !doc.frontmatter.draft)
        {
            docs.push(doc);
        }
    }

    return collection === 'posts' ? sortByDateDesc(docs) : docs;
}

async function loadDocument(source: ContentSource, path: string, prefix: string, collection: Collection, context: RewriteContext, problems: SiteProblem[]): Promise<PageDoc | null>
{
    const raw = await source.getFile(path);
    if (raw === null)
    {
        return null;
    }

    const relative = path.slice(prefix.length);

    try
    {
        const parsed = parseDocument(raw, defaultLayout(collection, relative));

        return {
            slug: docSlug(collection, relative),
            sourcePath: path,
            frontmatter: parsed.frontmatter,
            html: await renderMarkdown(parsed.body, context),
        };
    }
    catch (error)
    {
        problems.push({ path, message: (error as Error).message });

        return null;
    }
}

function usedSlugs(pages: PageDoc[], posts: PageDoc[]): Set<string>
{
    return new Set([...pages, ...posts].map(doc => doc.slug));
}

/**
 * Raw HTML pages under `pages/` — full documents served verbatim (no layout, no
 * sanitize; the author owns the content). A slug already taken by a markdown page
 * or post is a conflict: the HTML file is skipped and reported.
 */
async function loadHtmlPages(source: ContentSource, tree: string[], config: SiteConfig, taken: Set<string>, problems: SiteProblem[]): Promise<HtmlPage[]>
{
    const prefix = contentPath(config, 'pages') + '/';
    const docs: HtmlPage[] = [];

    for (const path of collectionFiles(tree, config, 'pages', '.html'))
    {
        const html = await source.getFile(path);
        if (html === null)
        {
            continue;
        }

        const relative = path.slice(prefix.length);
        const slug = docSlug('pages', relative.replace(/\.html$/, '.md'));
        if (taken.has(slug))
        {
            problems.push({ path, message: `slug '${slug}' is already served by another page — rename one of the files` });
            continue;
        }

        taken.add(slug);
        docs.push({ slug, sourcePath: path, title: htmlTitle(html, relative), html });
    }

    return docs;
}

function htmlTitle(html: string, relative: string): string
{
    const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    const title = match?.[1].trim();

    return title || relative.replace(/\.html$/, '').split('/').pop() || relative;
}

function defaultLayout(collection: Collection, relative: string): PageLayout
{
    if (collection === 'posts')
    {
        return 'post';
    }

    return relative === 'index.md' ? 'landing' : 'doc';
}

function docSlug(collection: Collection, relative: string): string
{
    const name = relative.replace(/\.md$/, '');
    if (collection === 'posts')
    {
        return `/posts/${stripDatePrefix(name)}`;
    }
    if (name === 'index')
    {
        return '/';
    }

    return `/${name.replace(/\/index$/, '')}`;
}

function stripDatePrefix(name: string): string
{
    return name.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function sortByDateDesc(docs: PageDoc[]): PageDoc[]
{
    return [...docs].sort((a, b) => (b.frontmatter.date ?? '').localeCompare(a.frontmatter.date ?? ''));
}

/** SVG and PNG favicons are natively supported by browsers — no .ico conversion needed. */
const FAVICON_NAMES = ['favicon.svg', 'favicon.png', 'favicon.ico', 'favicon.jpg', 'favicon.jpeg'];
const OG_IMAGE_NAMES = ['og.png', 'og.jpg', 'og.jpeg', 'og.webp'];

/**
 * Well-known `public/` assets, detected by convention: the first candidate name
 * present wins, returned as its served URL (`public/` maps to the site root).
 */
function findWellKnownAsset(tree: string[], config: SiteConfig, names: string[]): string | undefined
{
    const name = names.find(candidate => tree.includes(contentPath(config, 'public', candidate)));

    return name && `/${name}`;
}

async function loadTheme(source: ContentSource, config: SiteConfig, problems: SiteProblem[]): Promise<string>
{
    const tokensPath = contentPath(config, 'theme/tokens.json');
    const tokensJson = await source.getFile(tokensPath);
    const customCss = await source.getFile(contentPath(config, 'theme/custom.css'));

    try
    {
        return joinCss(CODE_DARK_CSS, buildThemeCss(tokensJson, customCss));
    }
    catch (error)
    {
        problems.push({ path: tokensPath, message: (error as Error).message });

        return joinCss(CODE_DARK_CSS, customCss ?? '');
    }
}

function joinCss(...parts: string[]): string
{
    return parts.filter(Boolean).join('\n');
}
