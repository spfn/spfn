import type { SiteContent } from '@spfn/pages';

/**
 * Site-wide SEO surface shared by both serving modes: sync writes these as
 * static files for the self-deploy export, the hosted edge generates the same
 * bytes per request. Everything derives from `spfn.site.yaml`'s `url:` —
 * without it there is no absolute base and nothing here applies.
 */

/** The site's absolute base URL without a trailing slash, when configured. */
export function siteBaseUrl(site: SiteContent): string | undefined
{
    return site.config.url?.replace(/\/+$/, '');
}

/** The absolute served URL for a slug — the homepage keeps its trailing slash. */
export function pageUrl(baseUrl: string, slug: string): string
{
    return slug === '/' ? `${baseUrl}/` : `${baseUrl}${slug}`;
}

/** Inject a canonical link into an html escape-hatch page that doesn't declare one. */
export function withCanonical(html: string, href: string): string
{
    if (/rel=["']canonical["']/i.test(html))
    {
        return html;
    }
    const headEnd = html.search(/<\/head>/i);

    return headEnd === -1 ? html : `${html.slice(0, headEnd)}<link rel="canonical" href="${href}">\n${html.slice(headEnd)}`;
}

/** Every served route (markdown docs and html pages alike), one `<url>` each. */
export function sitemapXml(site: SiteContent, baseUrl: string): string
{
    const slugs = [...site.pages, ...site.mounted, ...site.posts, ...site.htmlPages].map(doc => doc.slug);
    const urls = [...new Set(slugs)].sort().map(slug => `    <url><loc>${escapeXml(pageUrl(baseUrl, slug))}</loc></url>`);

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(baseUrl: string): string
{
    return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

function escapeXml(value: string): string
{
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
