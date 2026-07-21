import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { FsContentSource, loadSite } from '@spfn/pages/server';
import type { SiteProblem } from '@spfn/pages';

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
    problems: SiteProblem[];
}

/**
 * Materialize what Next.js can't render from the site model: raw HTML
 * escape-hatch pages (written as `<slug>/index.html`) and `public/` assets,
 * copied into Next's public dir before `next build`. This is what makes
 * `output: 'export'` (Cloudflare Pages, any static host) serve the full spec.
 */
export async function syncSite({ root, out }: SyncOptions): Promise<SyncResult>
{
    const site = await loadSite(new FsContentSource(root));

    const copiedAssets = await copyPublicAssets(root, site.config.root, out);
    for (const page of site.htmlPages)
    {
        const target = page.slug === '/' ? join(out, 'index.html') : join(out, page.slug.slice(1), 'index.html');
        await fs.mkdir(dirname(target), { recursive: true });
        await fs.writeFile(target, page.html, 'utf8');
    }

    return { htmlPages: site.htmlPages.length, copiedAssets, problems: site.problems };
}

async function copyPublicAssets(root: string, contentRoot: string, out: string): Promise<boolean>
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

    await fs.mkdir(out, { recursive: true });
    await fs.cp(source, out, { recursive: true });

    return true;
}
