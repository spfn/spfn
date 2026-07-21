import { SITE_CONFIG_FILE, type HtmlPage, type MountConfig, type PageDoc, type PageLayout, type SiteConfig, type SiteContent, type SiteProblem } from '../shared/types';
import { SiteConfigError } from '../shared/errors';
import { parseSiteConfig } from './config';
import { buildSections } from './sections';
import { parseDocument, parseMountedDocument, type ParsedDocument } from './frontmatter';
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
    const repoFiles = new Set(tree);
    const slugBySourcePath = mapSlugs(tree, config);

    const pageFiles = await readCollection(source, tree, config, 'pages', problems);
    const postFiles = await readCollection(source, tree, config, 'posts', problems);
    registerReferences([...pageFiles, ...postFiles], repoFiles, slugBySourcePath, problems);

    const mountFiles = resolveMounts(tree, config, slugBySourcePath, problems);
    for (const file of mountFiles)
    {
        if (!slugBySourcePath.has(file.path))
        {
            slugBySourcePath.set(file.path, file.route);
        }
    }

    const shared: SharedContext = { config, repoFiles, slugBySourcePath };
    const pages = await renderCollection(source, pageFiles, shared);
    const posts = sortByDateDesc(await renderCollection(source, postFiles, shared));
    const mounted = await loadMounted(source, shared, mountFiles, problems);

    const htmlPages = await loadHtmlPages(source, tree, config, usedSlugs(pages, posts, mounted), problems);

    return {
        config,
        pages,
        posts,
        mounted,
        sections: buildSections([...pages, ...mounted], htmlPages),
        htmlPages,
        themeCss: await loadTheme(source, config, problems),
        favicon: findWellKnownAsset(tree, config, FAVICON_NAMES),
        ogImage: findWellKnownAsset(tree, config, OG_IMAGE_NAMES),
        problems,
    };
}

/** Everything document loading needs besides the file itself. */
interface SharedContext
{
    config: SiteConfig;
    repoFiles: ReadonlySet<string>;
    slugBySourcePath: Map<string, string>;
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

/** A collection file read and parsed, awaiting render once every link target is known. */
interface AuthoredFile
{
    path: string;
    slug: string;
    parsed: ParsedDocument;
}

async function readCollection(source: ContentSource, tree: string[], config: SiteConfig, collection: Collection, problems: SiteProblem[]): Promise<AuthoredFile[]>
{
    const prefix = contentPath(config, collection) + '/';
    const files: AuthoredFile[] = [];

    for (const path of collectionFiles(tree, config, collection, '.md'))
    {
        const raw = await source.getFile(path);
        if (raw === null)
        {
            continue;
        }

        const relative = path.slice(prefix.length);
        try
        {
            files.push({ path, slug: docSlug(collection, relative), parsed: parseDocument(raw, defaultLayout(collection, relative)) });
        }
        catch (error)
        {
            problems.push({ path, message: (error as Error).message });
        }
    }

    return files;
}

/**
 * A page with frontmatter `source:` serves that repo file's content at the page's
 * own route — register the mapping so links to the repo file land on the curated
 * page instead of GitHub. First claim wins (mounts register after, without
 * overriding). A missing source is reported here; the page is skipped at render.
 */
function registerReferences(files: AuthoredFile[], repoFiles: ReadonlySet<string>, slugBySourcePath: Map<string, string>, problems: SiteProblem[]): void
{
    for (const file of files)
    {
        const reference = file.parsed.frontmatter.source;
        if (!reference)
        {
            continue;
        }
        if (!repoFiles.has(reference))
        {
            problems.push({ path: file.path, message: `source '${reference}' not found in the repo` });
            continue;
        }
        if (!slugBySourcePath.has(reference))
        {
            slugBySourcePath.set(reference, file.slug);
        }
    }
}

async function renderCollection(source: ContentSource, files: AuthoredFile[], shared: SharedContext): Promise<PageDoc[]>
{
    const docs: PageDoc[] = [];

    for (const file of files)
    {
        if (file.parsed.frontmatter.draft)
        {
            continue;
        }

        const html = await renderAuthored(source, file, shared);
        if (html !== null)
        {
            docs.push({ slug: file.slug, sourcePath: file.path, frontmatter: file.parsed.frontmatter, html });
        }
    }

    return docs;
}

/**
 * The authored body, plus — when frontmatter `source:` points at a repo doc —
 * that doc's content after it, links resolved from the referenced file's own
 * repo location (the body's from the page's). A source missing from the repo
 * was already reported at registration; the page is dropped here.
 */
async function renderAuthored(source: ContentSource, file: AuthoredFile, shared: SharedContext): Promise<string | null>
{
    const preface = file.parsed.body.trim() === '' ? '' : await renderMarkdown(file.parsed.body, rewriteContext(shared, file.path));
    const reference = file.parsed.frontmatter.source;
    if (!reference)
    {
        return preface;
    }

    const raw = await source.getFile(reference);
    if (raw === null)
    {
        return null;
    }

    const fallback = reference.split('/').pop()?.replace(/\.md$/, '') ?? reference;
    const parsed = parseMountedDocument(raw, fallback);

    return preface + await renderMarkdown(parsed.body, rewriteContext(shared, reference));
}

function rewriteContext(shared: SharedContext, sourcePath: string): RewriteContext
{
    return {
        sourcePath,
        slugBySourcePath: shared.slugBySourcePath,
        publicPrefix: contentPath(shared.config, 'public'),
        repoUrl: shared.config.repo,
        repoFiles: shared.repoFiles,
    };
}

function usedSlugs(...collections: PageDoc[][]): Set<string>
{
    return new Set(collections.flat().map(doc => doc.slug));
}

interface MountFile
{
    path: string;
    route: string;
    mount: MountConfig;
}

/**
 * Expand config mounts against the repo tree. A `.md` source is a file mount;
 * anything else is a directory mount serving every `.md` beneath it, with
 * README/index files collapsing onto their directory's route. Conflicts with
 * authored pages/posts (or earlier mounts) are reported and skipped.
 */
function resolveMounts(tree: string[], config: SiteConfig, taken: ReadonlyMap<string, string>, problems: SiteProblem[]): MountFile[]
{
    if (config.mounts.length > 0 && !config.repo)
    {
        problems.push({ path: SITE_CONFIG_FILE, message: 'mounts without repo: relative links to unserved repo files will not be rewritten' });
    }

    const claimed = new Set(taken.values());
    const files: MountFile[] = [];

    for (const mount of config.mounts)
    {
        for (const file of expandMount(tree, mount, problems))
        {
            if (claimed.has(file.route))
            {
                problems.push({ path: file.path, message: `mount route '${file.route}' is already served — rename the route or the conflicting file` });
                continue;
            }

            claimed.add(file.route);
            files.push(file);
        }
    }

    return files;
}

function expandMount(tree: string[], mount: MountConfig, problems: SiteProblem[]): MountFile[]
{
    if (mount.source.endsWith('.md'))
    {
        if (!tree.includes(mount.source))
        {
            problems.push({ path: mount.source, message: `mount source not found in the repo` });

            return [];
        }

        return [{ path: mount.source, route: mount.route, mount }];
    }

    const prefix = mount.source + '/';
    const found = tree.filter(path => path.startsWith(prefix) && path.endsWith('.md'));
    if (found.length === 0)
    {
        problems.push({ path: mount.source, message: `mount source has no markdown files` });
    }

    return found.map(path => ({ path, route: mountedRoute(mount.route, path.slice(prefix.length)), mount }));
}

/** 'guides/setup.md' → '<route>/guides/setup'; README/index files collapse onto their directory. */
function mountedRoute(route: string, relative: string): string
{
    const segments = relative.replace(/\.md$/, '').split('/');
    const last = segments[segments.length - 1].toLowerCase();
    if (last === 'readme' || last === 'index')
    {
        segments.pop();
    }

    return segments.length === 0 ? route : `${route}/${segments.join('/')}`;
}

async function loadMounted(source: ContentSource, shared: SharedContext, mountFiles: MountFile[], problems: SiteProblem[]): Promise<PageDoc[]>
{
    const docs: PageDoc[] = [];

    for (const file of mountFiles)
    {
        const raw = await source.getFile(file.path);
        if (raw === null)
        {
            continue;
        }

        try
        {
            const fallback = file.path.split('/').pop()?.replace(/\.md$/, '') ?? file.path;
            const parsed = parseMountedDocument(raw, fallback);
            if (parsed.frontmatter.draft)
            {
                continue;
            }
            if (file.route === file.mount.route && file.mount.title)
            {
                parsed.frontmatter.title = file.mount.title;
            }

            docs.push({
                slug: file.route,
                sourcePath: file.path,
                frontmatter: parsed.frontmatter,
                html: await renderMarkdown(parsed.body, rewriteContext(shared, file.path)),
            });
        }
        catch (error)
        {
            problems.push({ path: file.path, message: (error as Error).message });
        }
    }

    return docs;
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
