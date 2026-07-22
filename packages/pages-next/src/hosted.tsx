import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GithubContentSource, loadSite } from '@spfn/pages/server';
import type { ContentSource } from '@spfn/pages/server';
import type { PageDoc, SiteContent } from '@spfn/pages';
import { DocLayout, LandingLayout, PostLayout, PostsIndexLayout } from './layouts';
import { pageUrl, robotsTxt, siteBaseUrl, sitemapXml, withCanonical } from './seo';

/**
 * Hosted-edge helpers — multi-tenant serving without Next.
 *
 * The edge is a plain HTTP server: every response is a complete document.
 * Markdown pages render through the same layouts as the self-deploy mode
 * (React runs server-side as the template engine; no client runtime ships),
 * raw HTML pages are served verbatim, and `public/` assets stream as bytes.
 */

const POSTS_INDEX = '/posts';

export interface SiteResponse
{
    status: number;
    contentType: string;
    body: string | Uint8Array;
}

/**
 * Resolve one request path against a loaded site. Returns null when nothing
 * claims the path — the edge renders its own not-found response.
 */
export async function serveSiteRequest(site: SiteContent, source: ContentSource, requestPath: string): Promise<SiteResponse | null>
{
    const path = normalizePath(requestPath);
    if (path === null)
    {
        return null;
    }

    const baseUrl = siteBaseUrl(site);
    const htmlPage = site.htmlPages.find(page => page.slug === path);
    if (htmlPage)
    {
        return html(baseUrl ? withCanonical(htmlPage.html, pageUrl(baseUrl, htmlPage.slug)) : htmlPage.html);
    }

    const doc = findDoc(site, path);
    if (doc)
    {
        return html(renderDocument(site, renderDoc(site, doc), docHead(site, doc)));
    }
    if (path === POSTS_INDEX && site.posts.length > 0)
    {
        return html(renderDocument(site, <PostsIndexLayout site={site} />, postsIndexHead(site)));
    }

    // a site-shipped public/ file wins; generation only fills the gap
    return await serveAsset(site, source, path) ?? generatedSeoFile(site, path);
}

function generatedSeoFile(site: SiteContent, path: string): SiteResponse | null
{
    const baseUrl = siteBaseUrl(site);
    if (!baseUrl)
    {
        return null;
    }
    if (path === '/sitemap.xml')
    {
        return { status: 200, contentType: 'application/xml', body: sitemapXml(site, baseUrl) };
    }
    if (path === '/robots.txt')
    {
        return { status: 200, contentType: 'text/plain; charset=utf-8', body: robotsTxt(baseUrl) };
    }

    return null;
}

function html(body: string): SiteResponse
{
    return { status: 200, contentType: 'text/html; charset=utf-8', body };
}

/** Reject traversal and normalize: decode, strip query/hash and trailing slash. */
function normalizePath(requestPath: string): string | null
{
    let path = requestPath.split(/[?#]/)[0];
    try
    {
        path = decodeURIComponent(path);
    }
    catch
    {
        return null;
    }

    if (!path.startsWith('/') || path.includes('\\') || path.split('/').some(segment => segment === '..'))
    {
        return null;
    }
    if (path.length > 1 && path.endsWith('/'))
    {
        path = path.slice(0, -1);
    }

    return path;
}

function findDoc(site: SiteContent, slug: string): PageDoc | null
{
    return [...site.pages, ...site.posts, ...site.mounted].find(doc => doc.slug === slug) ?? null;
}

function renderDoc(site: SiteContent, doc: PageDoc): ReactElement
{
    switch (doc.frontmatter.layout)
    {
        case 'landing':
            return <LandingLayout site={site} page={doc} />;
        case 'post':
            return <PostLayout site={site} page={doc} />;
        default:
            return <DocLayout site={site} page={doc} />;
    }
}

interface HeadContent
{
    title: string;
    description?: string;
    ogImage?: string;
    /** Absolute canonical URL — present only when the config sets `url:`. */
    canonicalUrl?: string;
}

function docHead(site: SiteContent, doc: PageDoc): HeadContent
{
    return {
        title: doc.slug === '/' ? site.config.name : `${doc.frontmatter.title} — ${site.config.name}`,
        description: doc.frontmatter.description ?? site.config.description,
        ogImage: doc.frontmatter.og ? `/${doc.frontmatter.og}` : site.ogImage,
        canonicalUrl: canonicalFor(site, doc.slug),
    };
}

function postsIndexHead(site: SiteContent): HeadContent
{
    return { title: `Posts — ${site.config.name}`, description: site.config.description, ogImage: site.ogImage, canonicalUrl: canonicalFor(site, POSTS_INDEX) };
}

function canonicalFor(site: SiteContent, slug: string): string | undefined
{
    const baseUrl = siteBaseUrl(site);

    return baseUrl ? pageUrl(baseUrl, slug) : undefined;
}

/** Full document assembly — the hosted counterpart of Next's metadata emission. */
function renderDocument(site: SiteContent, element: ReactElement, head: HeadContent): string
{
    const lang = site.config.locale ? ` lang="${escapeAttribute(site.config.locale)}"` : '';
    const tags = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${escapeText(head.title)}</title>`,
        ...(head.description ? [`<meta name="description" content="${escapeAttribute(head.description)}">`] : []),
        ...(head.canonicalUrl ? [`<link rel="canonical" href="${escapeAttribute(head.canonicalUrl)}">`] : []),
        `<meta property="og:title" content="${escapeAttribute(head.title)}">`,
        ...(head.description ? [`<meta property="og:description" content="${escapeAttribute(head.description)}">`] : []),
        `<meta property="og:site_name" content="${escapeAttribute(site.config.name)}">`,
        ...(head.canonicalUrl ? [`<meta property="og:url" content="${escapeAttribute(head.canonicalUrl)}">`] : []),
        ...(site.config.locale ? [`<meta property="og:locale" content="${escapeAttribute(site.config.locale)}">`] : []),
        ...(head.ogImage ? [`<meta property="og:image" content="${escapeAttribute(absoluteUrl(site, head.ogImage))}">`] : []),
        ...(site.favicon ? [`<link rel="icon" href="${escapeAttribute(site.favicon)}" type="${faviconMimeType(site.favicon)}">`] : []),
    ];

    return `<!doctype html><html${lang}><head>${tags.join('')}</head><body>${renderToStaticMarkup(element)}</body></html>`;
}

function absoluteUrl(site: SiteContent, path: string): string
{
    if (!site.config.url || /^https?:\/\//.test(path))
    {
        return path;
    }

    return new URL(path, site.config.url).toString();
}

function escapeText(value: string): string
{
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string
{
    return escapeText(value).replace(/"/g, '&quot;');
}

function faviconMimeType(path: string): string
{
    return ASSET_TYPES[extension(path)] ?? 'image/x-icon';
}

async function serveAsset(site: SiteContent, source: ContentSource, path: string): Promise<SiteResponse | null>
{
    const contentType = ASSET_TYPES[extension(path)];
    if (!contentType)
    {
        return null;
    }

    const root = site.config.root === '' ? '' : `${site.config.root}/`;
    const bytes = await source.getBinary(`${root}public${path}`);
    if (bytes === null)
    {
        return null;
    }

    return { status: 200, contentType, body: bytes };
}

function extension(path: string): string
{
    const lastSegment = path.slice(path.lastIndexOf('/') + 1);
    const dot = lastSegment.lastIndexOf('.');

    return dot === -1 ? '' : lastSegment.slice(dot + 1).toLowerCase();
}

const ASSET_TYPES: Record<string, string> = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    ico: 'image/x-icon',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    json: 'application/json',
    txt: 'text/plain; charset=utf-8',
    xml: 'application/xml',
    pdf: 'application/pdf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    mp4: 'video/mp4',
    webm: 'video/webm',
};

export interface HostedSiteCacheOptions
{
    /** How long a resolved HEAD SHA is trusted before re-checking (default 30s). */
    headTtlMs?: number;
    /** Site models kept in memory, LRU-evicted (default 100). */
    maxSites?: number;
    /** GitHub token to raise API rate limits. */
    token?: string;
    fetchImpl?: typeof fetch;
}

export interface LoadedTenantSite
{
    site: SiteContent;
    /** Content source pinned to `sha` — asset reads stay consistent with the model. */
    source: ContentSource;
    sha: string;
}

interface HeadState
{
    repoUrl: string;
    source: GithubContentSource;
    sha: string | null;
    checkedAt: number;
    /** In-flight background HEAD re-check — deduped across requests. */
    checking: Promise<void> | null;
    /** Last fully loaded site for this repo — served while a newer SHA loads. */
    current: LoadedTenantSite | null;
}

interface SiteEntry
{
    head: HeadState;
    promise: Promise<LoadedTenantSite>;
    /** Set once the load settles — a ready entry serves without awaiting. */
    ready: LoadedTenantSite | null;
}

/**
 * Per-repo site cache for the multi-tenant edge. HEAD is re-resolved at most
 * once per TTL (an ETag-revalidated 304 when nothing changed); site models are
 * cached under `repo@sha`, which is immutable — pods never need coordinated
 * invalidation, and a push shows up within one TTL.
 *
 * Stale-while-revalidate: only a repo's very first load awaits the network.
 * After that, requests are answered from the last loaded model immediately —
 * HEAD re-checks and new-SHA loads run in the background and swap in when done.
 */
export class HostedSiteCache
{
    private readonly headTtlMs: number;
    private readonly maxSites: number;
    private readonly options: HostedSiteCacheOptions;
    private readonly heads = new Map<string, HeadState>();
    private readonly sites = new Map<string, SiteEntry>();

    constructor(options: HostedSiteCacheOptions = {})
    {
        this.headTtlMs = options.headTtlMs ?? 30_000;
        this.maxSites = options.maxSites ?? 100;
        this.options = options;
    }

    async get(repoUrl: string): Promise<LoadedTenantSite>
    {
        const head = this.headState(repoUrl);
        if (head.sha === null)
        {
            await this.checkHead(head);
        }
        else if (Date.now() - head.checkedAt >= this.headTtlMs)
        {
            this.revalidateHead(head);
        }

        const entry = this.pinnedEntry(head, head.sha as string);
        if (entry.ready)
        {
            return entry.ready;
        }
        if (head.current)
        {
            return head.current;
        }

        return await entry.promise;
    }

    private headState(repoUrl: string): HeadState
    {
        let head = this.heads.get(repoUrl);
        if (!head)
        {
            const { token, fetchImpl } = this.options;
            head = { repoUrl, source: new GithubContentSource(repoUrl, { token, fetchImpl }), sha: null, checkedAt: 0, checking: null, current: null };
            this.heads.set(repoUrl, head);
        }

        return head;
    }

    private async checkHead(head: HeadState): Promise<void>
    {
        try
        {
            head.sha = await head.source.resolveHeadSha();
        }
        catch (error)
        {
            if (head.sha === null)
            {
                throw error;
            }
            // GitHub unreachable — keep serving the last known commit.
        }
        head.checkedAt = Date.now();
    }

    /** Background HEAD re-check; a changed SHA starts loading immediately so a hot page converges in one TTL. */
    private revalidateHead(head: HeadState): void
    {
        if (head.checking)
        {
            return;
        }

        head.checking = this.checkHead(head)
            .then(() =>
            {
                this.pinnedEntry(head, head.sha as string);
            })
            .catch(() => undefined)
            .finally(() =>
            {
                head.checking = null;
            });
    }

    private pinnedEntry(head: HeadState, sha: string): SiteEntry
    {
        const key = `${head.repoUrl}@${sha}`;
        const cached = this.sites.get(key);
        if (cached)
        {
            this.sites.delete(key);
            this.sites.set(key, cached);

            return cached;
        }

        const source = head.source.atRef(sha);
        const entry: SiteEntry = { head, promise: Promise.resolve(null as never), ready: null };
        entry.promise = loadSite(source).then(site =>
        {
            const loaded = { site, source, sha };
            if (this.sites.get(key) === entry)
            {
                entry.ready = loaded;
                head.current = loaded;
            }

            return loaded;
        });
        this.sites.set(key, entry);
        entry.promise.catch(() =>
        {
            if (this.sites.get(key) === entry)
            {
                this.sites.delete(key);
            }
        });

        while (this.sites.size > this.maxSites)
        {
            const oldest = this.sites.keys().next().value as string;
            const evicted = this.sites.get(oldest) as SiteEntry;
            this.sites.delete(oldest);
            // an evicted model must not survive through head.current — maxSites is the memory bound
            if (evicted.ready !== null && evicted.head.current === evicted.ready)
            {
                evicted.head.current = null;
            }
        }

        return entry;
    }
}
