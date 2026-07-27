import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        await expect(provider.download('public/card.webp')).rejects.toMatchObject({
            name: 'StorageObjectNotFoundError',
            code: 'ENOENT',
        });
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

describe('LocalStorageProvider server-side object operations', () =>
{
    let storageRoot: string;
    let testRoot: string;

    beforeEach(async () =>
    {
        testRoot = await mkdtemp(join(tmpdir(), 'spfn-storage-ops-'));
        storageRoot = join(testRoot, 'storage');
    });

    afterEach(async () =>
    {
        await rm(testRoot, { recursive: true, force: true });
    });

    it('does not enumerate a symlink that escapes the storage root', async () =>
    {
        const outsideDir = join(testRoot, 'outside');
        await mkdir(join(storageRoot, 'gen', 'req-1'), { recursive: true });
        await mkdir(outsideDir);
        await writeFile(join(outsideDir, 'secret.txt'), 'secret');
        await symlink(outsideDir, join(storageRoot, 'gen', 'req-1', 'escape'));
        const provider = new LocalStorageProvider({ dir: storageRoot });
        await provider.upload('gen/req-1/real.txt', 'real', 'text/plain');

        const listed = await provider.list('gen/req-1');

        expect(listed.objects.map(object => object.key)).toEqual(['gen/req-1/real.txt']);
    });

    it('leaves an escaping symlink target untouched when the prefix is deleted', async () =>
    {
        const outsideDir = join(testRoot, 'outside');
        await mkdir(join(storageRoot, 'gen', 'req-1'), { recursive: true });
        await mkdir(outsideDir);
        await writeFile(join(outsideDir, 'secret.txt'), 'secret');
        await symlink(outsideDir, join(storageRoot, 'gen', 'req-1', 'escape'));
        const provider = new LocalStorageProvider({ dir: storageRoot });

        await provider.deletePrefix('gen/req-1');

        await expect(readFile(join(outsideDir, 'secret.txt'), 'utf8')).resolves.toBe('secret');
    });

    it('rejects a traversal destination on copy without writing outside the root', async () =>
    {
        const provider = new LocalStorageProvider({ dir: storageRoot });
        await provider.upload('gen/a.txt', 'a', 'text/plain');

        await expect(provider.copy('gen/a.txt', '../escaped.txt')).rejects.toThrow('Invalid storage key');
        await expect(readFile(join(testRoot, 'escaped.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('refuses to write through a symlink that escapes the storage root', async () =>
    {
        const outsideDir = join(testRoot, 'outside');
        await mkdir(storageRoot, { recursive: true });
        await mkdir(outsideDir);
        await symlink(outsideDir, join(storageRoot, 'escape'));
        const provider = new LocalStorageProvider({ dir: storageRoot });
        await provider.upload('gen/a.txt', 'a', 'text/plain');

        await expect(provider.upload('escape/written.txt', 'x', 'text/plain')).rejects.toThrow('Invalid storage key');
        await expect(provider.copy('gen/a.txt', 'escape/copied.txt')).rejects.toThrow('Invalid storage key');
        await expect(readFile(join(outsideDir, 'written.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(readFile(join(outsideDir, 'copied.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('reports a per-key failure from deletePrefix instead of throwing', async () =>
    {
        const provider = new LocalStorageProvider({ dir: storageRoot });
        await provider.upload('gen/req-1/a.txt', 'a', 'text/plain');
        vi.spyOn(provider, 'delete').mockRejectedValue(new Error('device busy'));

        await expect(provider.deletePrefix('gen/req-1')).resolves.toEqual({
            deleted: 0,
            failed: [{ key: 'gen/req-1/a.txt', error: 'device busy' }],
        });
        vi.restoreAllMocks();
    });
});
