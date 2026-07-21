import { SITE_CONFIG_FILE, type PageDoc, type PageLayout, type SiteConfig, type SiteContent, type SiteProblem } from '../shared/types';
import { SiteConfigError } from '../shared/errors';
import { parseSiteConfig } from './config';
import { parseDocument } from './frontmatter';
import { renderMarkdown } from './markdown';
import { buildThemeCss } from './theme';
import type { ContentSource } from './content-source';

/**
 * Load a full site from a content source: opt-in config, pages, posts, theme.
 * Per-file failures land in `problems` (the file is skipped); a missing or invalid
 * `spfn.site.yaml` throws — the repo has not (validly) opted into publishing.
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

    return {
        config,
        pages: await loadCollection(source, tree, config, 'pages', problems),
        posts: await loadCollection(source, tree, config, 'posts', problems),
        themeCss: await loadTheme(source, config, problems),
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

async function loadCollection(source: ContentSource, tree: string[], config: SiteConfig, collection: Collection, problems: SiteProblem[]): Promise<PageDoc[]>
{
    const prefix = contentPath(config, collection) + '/';
    const docs: PageDoc[] = [];

    for (const path of tree.filter(p => p.startsWith(prefix) && p.endsWith('.md')))
    {
        const doc = await loadDocument(source, path, prefix, collection, problems);
        if (doc && !doc.frontmatter.draft)
        {
            docs.push(doc);
        }
    }

    return collection === 'posts' ? sortByDateDesc(docs) : docs;
}

async function loadDocument(source: ContentSource, path: string, prefix: string, collection: Collection, problems: SiteProblem[]): Promise<PageDoc | null>
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
            html: await renderMarkdown(parsed.body),
        };
    }
    catch (error)
    {
        problems.push({ path, message: (error as Error).message });

        return null;
    }
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

async function loadTheme(source: ContentSource, config: SiteConfig, problems: SiteProblem[]): Promise<string>
{
    const tokensPath = contentPath(config, 'theme/tokens.json');
    const tokensJson = await source.getFile(tokensPath);
    const customCss = await source.getFile(contentPath(config, 'theme/custom.css'));

    try
    {
        return buildThemeCss(tokensJson, customCss);
    }
    catch (error)
    {
        problems.push({ path: tokensPath, message: (error as Error).message });

        return customCss ?? '';
    }
}
