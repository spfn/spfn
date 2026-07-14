import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageProvider } from '../server/local.provider';

describe('LocalStorageProvider deletion', () =>
{
    let storageRoot: string;
    let testRoot: string;
    let previousStorageDir: string | undefined;

    beforeEach(async () =>
    {
        previousStorageDir = process.env.LOCAL_STORAGE_DIR;
        testRoot = await mkdtemp(join(tmpdir(), 'spfn-storage-'));
        storageRoot = join(testRoot, 'storage');
        process.env.LOCAL_STORAGE_DIR = storageRoot;
    });

    afterEach(async () =>
    {
        if (previousStorageDir === undefined)
        {
            delete process.env.LOCAL_STORAGE_DIR;
        }
        else
        {
            process.env.LOCAL_STORAGE_DIR = previousStorageDir;
        }
        await rm(testRoot, { recursive: true, force: true });
    });

    it('deletes an object and treats a missing key as success', async () =>
    {
        const provider = new LocalStorageProvider();
        await provider.upload('public/card.webp', 'card', 'image/webp');

        await provider.delete('public/card.webp');
        await expect(provider.delete('public/card.webp')).resolves.toBeUndefined();
        await expect(provider.download('public/card.webp')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('rejects lexical path traversal without deleting an outside file', async () =>
    {
        const outside = join(testRoot, 'outside.txt');
        await writeFile(outside, 'keep');
        const provider = new LocalStorageProvider();

        await expect(provider.delete('../outside.txt')).rejects.toThrow('Invalid storage key');
        await expect(readFile(outside, 'utf8')).resolves.toBe('keep');
    });

    it('rejects a URL instead of treating it as an object key', async () =>
    {
        const provider = new LocalStorageProvider();

        await expect(provider.delete('https://cdn.example.com/card.webp')).rejects.toThrow(
            'requires a storage key',
        );
    });

    it('rejects a symlinked parent that escapes the storage root', async () =>
    {
        const outsideDir = join(testRoot, 'outside');
        await mkdir(storageRoot, { recursive: true });
        await mkdir(outsideDir);
        await writeFile(join(outsideDir, 'keep.txt'), 'keep');
        await symlink(outsideDir, join(storageRoot, 'escape'));
        const provider = new LocalStorageProvider();

        await expect(provider.delete('escape/keep.txt')).rejects.toThrow('Invalid storage key');
        await expect(readFile(join(outsideDir, 'keep.txt'), 'utf8')).resolves.toBe('keep');
    });

    it('propagates filesystem errors', async () =>
    {
        await mkdir(join(storageRoot, 'not-a-file'), { recursive: true });
        const provider = new LocalStorageProvider();

        await expect(provider.delete('not-a-file')).rejects.toSatisfy((error: NodeJS.ErrnoException) =>
            error.code === 'EISDIR' || error.code === 'EPERM');
    });

    it('returns partial results from deleteMany', async () =>
    {
        await mkdir(join(storageRoot, 'directory'), { recursive: true });
        const provider = new LocalStorageProvider();
        await provider.upload('delete-me.txt', 'content', 'text/plain');

        await expect(provider.deleteMany(['delete-me.txt', 'missing.txt', 'directory'])).resolves.toEqual({
            deleted: ['delete-me.txt', 'missing.txt'],
            failed: [{ key: 'directory', error: expect.any(String) }],
        });
    });
});
