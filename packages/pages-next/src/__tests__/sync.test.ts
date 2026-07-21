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

    it('reports no public dir without failing', async () =>
    {
        await fs.rm(join(root, 'site/public'), { recursive: true });

        const result = await syncSite({ root, out });

        expect(result.copiedAssets).toBe(false);
    });
});
