import { promises as fs } from 'fs';
import path from 'path';

interface Rewrite
{
    source: string;
    destination: string;
}

const DEV_HTML_PREFIX = '/spfn-dev-html';

/**
 * Dev-only rewrites that serve designed html pages straight from the site
 * source. `next dev` resolves the app catch-all before `public/`, so synced
 * html pages 404 in dev; these rewrites route them to the dev html handler
 * instead, which reads the source file on every request.
 *
 * Wire into `next.config` as `beforeFiles` (so fresh source beats the synced
 * `public/` copy), only in development:
 *
 *     rewrites: async () => ({ beforeFiles: await devHtmlRewrites('../site') }),
 *
 * Returns [] outside development. Pages are scanned once at dev-server start —
 * adding a new html file needs a dev restart; editing one does not.
 */
export async function devHtmlRewrites(root: string): Promise<Rewrite[]>
{
    if (process.env.NODE_ENV === 'production')
    {
        return [];
    }

    const pagesDir = path.resolve(root, 'pages');
    const slugs = await htmlSlugs(pagesDir, '');

    return slugs.map(slug => ({
        source: slug === '' ? '/' : `/${slug}`,
        destination: `${DEV_HTML_PREFIX}/${slug === '' ? 'index' : slug}`,
    }));
}

async function htmlSlugs(dir: string, prefix: string): Promise<string[]>
{
    let entries;
    try
    {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch
    {
        return [];
    }

    const slugs: string[] = [];
    for (const entry of entries)
    {
        if (entry.isDirectory())
        {
            slugs.push(...await htmlSlugs(path.join(dir, entry.name), `${prefix}${entry.name}/`));
        }
        else if (entry.name.endsWith('.html'))
        {
            const base = entry.name.slice(0, -'.html'.length);
            slugs.push(base === 'index' ? prefix.replace(/\/$/, '') : `${prefix}${base}`);
        }
    }

    return slugs;
}

/**
 * Route handler behind `devHtmlRewrites` — mount as a dev-only route at
 * `app/spfn-dev-html/[...slug]/route.dev.ts`:
 *
 *     export const { GET } = createDevHtmlHandler({ root: '../site' });
 *
 * with `next.config` gating both the extension and export mode to keep the
 * route (and export enforcement) out of production builds entirely:
 *
 *     const isDev = process.env.NODE_ENV === 'development';
 *     pageExtensions: isDev ? ['ts', 'tsx', 'dev.ts'] : ['ts', 'tsx'],
 *     ...(isDev ? {} : { output: 'export' }),
 *
 * Constraints that shaped this: an `_`-prefixed folder is private and
 * unrouted; route handlers support only required catch-alls (`/` arrives as
 * the `index` slug); and `output: 'export'` refuses route handlers whose
 * `generateStaticParams` it cannot statically see — so the route only exists
 * in dev. Reads `<root>/pages/<slug>.html` per request (no-store), 404s
 * outside development.
 */
export function createDevHtmlHandler({ root }: { root: string })
{
    const pagesDir = path.resolve(root, 'pages');

    async function GET(_req: Request, ctx: { params: Promise<{ slug: string[] }> }): Promise<Response>
    {
        if (process.env.NODE_ENV === 'production')
        {
            return new Response('Not found', { status: 404 });
        }

        const rel = (await ctx.params).slug.join('/');
        const file = path.resolve(pagesDir, `${rel}.html`);
        if (!file.startsWith(pagesDir + path.sep))
        {
            return new Response('Not found', { status: 404 });
        }

        try
        {
            const html = await fs.readFile(file, 'utf8');

            return new Response(html, {
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'cache-control': 'no-store',
                },
            });
        }
        catch
        {
            return new Response('Not found', { status: 404 });
        }
    }

    return { GET };
}
