import { promises as fs } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { FsContentSource, loadSite } from '@spfn/pages/server';
import type { SiteContent, SiteProblem } from '@spfn/pages';

/** Records what sync wrote, so the next run can remove outputs whose source is gone. */
const MANIFEST_NAME = '.spfn-pages-sync.json';

export interface SyncOptions
{
    /** Content repo root (where spfn.site.yaml lives). */
    root: string;
    /** Next.js public dir to materialize into. */
    out: string;
}

export interface SyncResult
{
    htmlPages: number;
    copiedAssets: boolean;
    removedStale: number;
    /** Generated SEO outputs (sitemap.xml, robots.txt) — 0 when `url` is unset or the site ships its own. */
    seoFiles: number;
    problems: SiteProblem[];
}

/**
 * Materialize what Next.js can't render from the site model: raw HTML
 * escape-hatch pages (written as `<slug>/index.html`) and `public/` assets,
 * copied into Next's public dir before `next build`. This is what makes
 * `output: 'export'` (Cloudflare Pages, any static host) serve the full spec.
 *
 * Sync owns only what it wrote: every output lands in a manifest, and a later
 * run deletes manifest entries it no longer produces (a moved landing, a
 * removed asset). Files the manifest never listed are left alone.
 */
export async function syncSite({ root, out }: SyncOptions): Promise<SyncResult>
{
    const site = await loadSite(new FsContentSource(root));
    const written: string[] = [];
    const baseUrl = site.config.url?.replace(/\/+$/, '');

    const copiedAssets = await copyPublicAssets(root, site.config.root, out, written);
    for (const page of site.htmlPages)
    {
        const target = page.slug === '/' ? 'index.html' : join(page.slug.slice(1), 'index.html');
        const html = baseUrl ? withCanonical(page.html, pageUrl(baseUrl, page.slug)) : page.html;
        await writeOutput(out, target, html, written);
    }

    // '/theme.css' — the well-known URL html escape-hatch pages can opt into
    await writeOutput(out, 'theme.css', site.themeCss, written);

    const seoFiles = baseUrl ? await writeSeoFiles(site, baseUrl, out, written) : 0;

    const removedStale = await removeStale(out, written);
    await fs.writeFile(join(out, MANIFEST_NAME), `${JSON.stringify({ files: [...written].sort() }, null, 4)}\n`, 'utf8');

    return { htmlPages: site.htmlPages.length, copiedAssets, removedStale, seoFiles, problems: site.problems };
}

/** The absolute served URL for a slug — the homepage keeps its trailing slash. */
function pageUrl(baseUrl: string, slug: string): string
{
    return slug === '/' ? `${baseUrl}/` : `${baseUrl}${slug}`;
}

/** Inject a canonical link into an html escape-hatch page that doesn't declare one. */
function withCanonical(html: string, href: string): string
{
    if (/rel=["']canonical["']/i.test(html))
    {
        return html;
    }
    const headEnd = html.search(/<\/head>/i);

    return headEnd === -1 ? html : `${html.slice(0, headEnd)}<link rel="canonical" href="${href}">\n${html.slice(headEnd)}`;
}

/**
 * sitemap.xml + robots.txt, derived from the loaded site model — the one place
 * that sees every served route (markdown docs and html pages alike). A file the
 * site ships in its own `public/` wins; generation is skipped for it.
 */
async function writeSeoFiles(site: SiteContent, baseUrl: string, out: string, written: string[]): Promise<number>
{
    let generated = 0;
    if (!written.includes('sitemap.xml'))
    {
        const slugs = [...site.pages, ...site.mounted, ...site.posts, ...site.htmlPages].map(doc => doc.slug);
        const urls = [...new Set(slugs)].sort().map(slug => `    <url><loc>${escapeXml(pageUrl(baseUrl, slug))}</loc></url>`);
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
        await writeOutput(out, 'sitemap.xml', xml, written);
        generated += 1;
    }
    if (!written.includes('robots.txt'))
    {
        await writeOutput(out, 'robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`, written);
        generated += 1;
    }

    return generated;
}

function escapeXml(value: string): string
{
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function writeOutput(out: string, relativePath: string, content: string, written: string[]): Promise<void>
{
    const target = join(out, relativePath);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
    written.push(toPosix(relativePath));
}

async function copyPublicAssets(root: string, contentRoot: string, out: string, written: string[]): Promise<boolean>
{
    const source = join(root, ...(contentRoot ? [contentRoot] : []), 'public');

    try
    {
        await fs.access(source);
    }
    catch
    {
        return false;
    }

    for (const relativePath of await walkFiles(source))
    {
        const target = join(out, relativePath);
        await fs.mkdir(dirname(target), { recursive: true });
        await fs.copyFile(join(source, relativePath), target);
        written.push(toPosix(relativePath));
    }

    return true;
}

async function walkFiles(dir: string, prefix = ''): Promise<string[]>
{
    const files: string[] = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true }))
    {
        const relativePath = prefix ? join(prefix, entry.name) : entry.name;
        if (entry.isDirectory())
        {
            files.push(...await walkFiles(join(dir, entry.name), relativePath));
        }
        else
        {
            files.push(relativePath);
        }
    }

    return files;
}

async function removeStale(out: string, written: string[]): Promise<number>
{
    const keep = new Set(written);
    const stale = (await readManifest(out)).filter(file => !keep.has(file));

    for (const relativePath of stale)
    {
        await fs.rm(join(out, relativePath), { force: true });
        await pruneEmptyDirs(out, dirname(relativePath));
    }

    return stale.length;
}

async function readManifest(out: string): Promise<string[]>
{
    try
    {
        const parsed = JSON.parse(await fs.readFile(join(out, MANIFEST_NAME), 'utf8')) as { files?: unknown };

        return Array.isArray(parsed.files) ? parsed.files.filter((file): file is string => typeof file === 'string') : [];
    }
    catch
    {
        return [];
    }
}

/** Best-effort: rmdir fails on non-empty dirs, which ends the climb. */
async function pruneEmptyDirs(out: string, relativeDir: string): Promise<void>
{
    let current = relativeDir;
    while (current && current !== '.')
    {
        try
        {
            await fs.rmdir(join(out, current));
        }
        catch
        {
            return;
        }
        current = dirname(current);
    }
}

function toPosix(path: string): string
{
    return path.split(sep).join('/');
}
