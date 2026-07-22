import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncSite } from '../sync';

let root: string;
let out: string;

beforeEach(async () =>
{
    root = await fs.mkdtemp(join(tmpdir(), 'spfn-pages-sync-'));
    out = join(root, '.out');

    await fs.mkdir(join(root, 'site/pages'), { recursive: true });
    await fs.mkdir(join(root, 'site/public/img'), { recursive: true });
    await fs.writeFile(join(root, 'spfn.site.yaml'), 'name: Demo\n');
    await fs.writeFile(join(root, 'site/pages/index.md'), '---\ntitle: Home\n---\nhi\n');
    await fs.writeFile(join(root, 'site/pages/playground.html'), '<!doctype html><html><head><title>PG</title></head><body>x</body></html>');
    await fs.writeFile(join(root, 'site/public/img/logo.png'), 'binaryish');
});

afterEach(async () =>
{
    await fs.rm(root, { recursive: true, force: true });
});

describe('syncSite', () =>
{
    it('writes html pages as <slug>/index.html and copies public assets', async () =>
    {
        const result = await syncSite({ root, out });

        expect(result.htmlPages).toBe(1);
        expect(result.copiedAssets).toBe(true);
        expect(await fs.readFile(join(out, 'playground/index.html'), 'utf8')).toContain('<title>PG</title>');
        expect(await fs.readFile(join(out, 'img/logo.png'), 'utf8')).toBe('binaryish');
        expect(await fs.readFile(join(out, 'theme.css'), 'utf8')).toContain('.shiki');
    });

    it('removes outputs whose source is gone, keeping files it never wrote', async () =>
    {
        await syncSite({ root, out });
        await fs.writeFile(join(out, 'hand-placed.txt'), 'mine');

        await fs.rm(join(root, 'site/pages/playground.html'));
        await fs.rm(join(root, 'site/public/img/logo.png'));
        const result = await syncSite({ root, out });

        expect(result.removedStale).toBe(2);
        await expect(fs.access(join(out, 'playground'))).rejects.toThrow();
        await expect(fs.access(join(out, 'img'))).rejects.toThrow();
        expect(await fs.readFile(join(out, 'hand-placed.txt'), 'utf8')).toBe('mine');
        expect(await fs.readFile(join(out, 'theme.css'), 'utf8')).toContain('.shiki');
    });

    it('reports no public dir without failing', async () =>
    {
        await fs.rm(join(root, 'site/public'), { recursive: true });

        const result = await syncSite({ root, out });

        expect(result.copiedAssets).toBe(false);
    });

    it('skips seo outputs and canonical injection when the config has no url', async () =>
    {
        const result = await syncSite({ root, out });

        expect(result.seoFiles).toBe(0);
        await expect(fs.access(join(out, 'sitemap.xml'))).rejects.toThrow();
        await expect(fs.access(join(out, 'robots.txt'))).rejects.toThrow();
        expect(await fs.readFile(join(out, 'playground/index.html'), 'utf8')).not.toContain('canonical');
    });

    it('generates sitemap.xml and robots.txt from all served routes when url is set', async () =>
    {
        await fs.writeFile(join(root, 'spfn.site.yaml'), 'name: Demo\nurl: https://demo.example/\n');

        const result = await syncSite({ root, out });

        expect(result.seoFiles).toBe(2);
        const sitemap = await fs.readFile(join(out, 'sitemap.xml'), 'utf8');
        expect(sitemap).toContain('<loc>https://demo.example/</loc>');
        expect(sitemap).toContain('<loc>https://demo.example/playground</loc>');
        expect(await fs.readFile(join(out, 'robots.txt'), 'utf8')).toContain('Sitemap: https://demo.example/sitemap.xml');
    });

    it('injects a canonical link into html pages that lack one, preserving a declared one', async () =>
    {
        await fs.writeFile(join(root, 'spfn.site.yaml'), 'name: Demo\nurl: https://demo.example\n');
        await fs.writeFile(join(root, 'site/pages/declared.html'), '<!doctype html><html><head><title>D</title><link rel="canonical" href="https://demo.example/elsewhere"></head><body>x</body></html>');

        await syncSite({ root, out });

        expect(await fs.readFile(join(out, 'playground/index.html'), 'utf8')).toContain('<link rel="canonical" href="https://demo.example/playground">');
        const declared = await fs.readFile(join(out, 'declared/index.html'), 'utf8');
        expect(declared).toContain('href="https://demo.example/elsewhere"');
        expect(declared.match(/canonical/g)).toHaveLength(1);
    });

    it('prefers a site-shipped robots.txt or sitemap.xml over generation', async () =>
    {
        await fs.writeFile(join(root, 'spfn.site.yaml'), 'name: Demo\nurl: https://demo.example\n');
        await fs.writeFile(join(root, 'site/public/robots.txt'), 'User-agent: *\nDisallow: /private\n');

        const result = await syncSite({ root, out });

        expect(result.seoFiles).toBe(1);
        expect(await fs.readFile(join(out, 'robots.txt'), 'utf8')).toContain('Disallow: /private');
        expect(await fs.readFile(join(out, 'sitemap.xml'), 'utf8')).toContain('<loc>https://demo.example/</loc>');
    });
});
