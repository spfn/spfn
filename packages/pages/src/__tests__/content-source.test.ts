import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemoryContentSource } from '../server/content-source';
import { FsContentSource } from '../server/fs-source';

describe('MemoryContentSource binary support', () =>
{
    it('round-trips string entries through both readers', async () =>
    {
        const source = new MemoryContentSource({ 'a.md': '# hi' });

        expect(await source.getFile('a.md')).toBe('# hi');
        expect(await source.getBinary('a.md')).toEqual(new TextEncoder().encode('# hi'));
    });

    it('round-trips byte entries through both readers', async () =>
    {
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
        const source = new MemoryContentSource({ 'og.png': bytes, 'b.md': 'text' });

        expect(await source.getBinary('og.png')).toBe(bytes);
        expect(await source.getFile('og.png')).toBe(new TextDecoder().decode(bytes));
        expect(await source.getBinary('missing.png')).toBeNull();
    });
});

describe('FsContentSource binary support', () =>
{
    it('reads bytes from disk and null for missing files', async () =>
    {
        const dir = await mkdtemp(join(tmpdir(), 'spfn-pages-'));
        const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        await writeFile(join(dir, 'og.png'), bytes);

        const source = new FsContentSource(dir);
        expect(await source.getBinary('og.png')).toEqual(bytes);
        expect(await source.getBinary('missing.png')).toBeNull();

        await rm(dir, { recursive: true, force: true });
    });
});
