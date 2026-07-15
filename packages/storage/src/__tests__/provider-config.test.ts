import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageProvider } from '../server/local.provider';
import { S3StorageProvider } from '../server/s3.provider';

describe('provider config injection', () =>
{
    let testRoot: string;
    let savedEnv: Record<string, string | undefined>;
    const ENV_KEYS = ['LOCAL_STORAGE_DIR', 'LOCAL_STORAGE_BASE_URL', 'S3_BUCKET', 'S3_REGION', 'S3_PUBLIC_BASE_URL'];

    beforeEach(async () =>
    {
        testRoot = await mkdtemp(join(tmpdir(), 'spfn-storage-config-'));
        savedEnv = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    });

    afterEach(async () =>
    {
        for (const k of ENV_KEYS)
        {
            if (savedEnv[k] === undefined)
            {
                delete process.env[k];
            }
            else
            {
                process.env[k] = savedEnv[k];
            }
        }
        await rm(testRoot, { recursive: true, force: true });
    });

    it('local: config overrides env for dir and baseUrl', async () =>
    {
        process.env.LOCAL_STORAGE_DIR = join(testRoot, 'env-dir');
        process.env.LOCAL_STORAGE_BASE_URL = '/env-url';
        const provider = new LocalStorageProvider({ dir: join(testRoot, 'config-dir'), baseUrl: '/config-url' });

        await provider.upload('public/a.txt', 'a', 'text/plain');
        await expect(provider.download('public/a.txt')).resolves.toEqual(Buffer.from('a'));
        expect(provider.getPublicUrl('public/a.txt')).toBe('/config-url/public/a.txt');
    });

    it('local: falls back to env when config omitted', () =>
    {
        process.env.LOCAL_STORAGE_BASE_URL = '/env-url';
        const provider = new LocalStorageProvider();

        expect(provider.getPublicUrl('public/a.txt')).toBe('/env-url/public/a.txt');
    });

    it('s3: config bucket/region shape the public URL over env', () =>
    {
        process.env.S3_BUCKET = 'env-bucket';
        process.env.S3_REGION = 'env-region';
        delete process.env.S3_PUBLIC_BASE_URL;
        const provider = new S3StorageProvider({ bucket: 'config-bucket', region: 'ap-northeast-2' });

        expect(provider.getPublicUrl('public/a.txt'))
            .toBe('https://config-bucket.s3.ap-northeast-2.amazonaws.com/public/a.txt');
    });
});
