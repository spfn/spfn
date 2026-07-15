import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GcsStorageProvider } from '../server/gcs.provider';

interface TestProviderInternals
{
    publicBucket: { file: (key: string) => { delete: (options: { ignoreNotFound: boolean }) => Promise<unknown> } };
    privateBucket: { file: (key: string) => { delete: (options: { ignoreNotFound: boolean }) => Promise<unknown> } };
}

describe('GcsStorageProvider deletion', () =>
{
    let previousPublicBucket: string | undefined;
    let previousPrivateBucket: string | undefined;

    beforeEach(() =>
    {
        previousPublicBucket = process.env.GCS_PUBLIC_BUCKET;
        previousPrivateBucket = process.env.GCS_PRIVATE_BUCKET;
        process.env.GCS_PUBLIC_BUCKET = 'public-test-bucket';
        process.env.GCS_PRIVATE_BUCKET = 'private-test-bucket';
    });

    afterEach(() =>
    {
        restoreEnv('GCS_PUBLIC_BUCKET', previousPublicBucket);
        restoreEnv('GCS_PRIVATE_BUCKET', previousPrivateBucket);
        vi.restoreAllMocks();
    });

    it('deletes from the bucket selected by key and ignores not found', async () =>
    {
        const deleteObject = vi.fn().mockResolvedValue([]);
        const provider = providerWithDelete(deleteObject);

        await provider.delete('public/card.webp');

        expect(deleteObject).toHaveBeenCalledWith({ ignoreNotFound: true });
    });

    it('propagates provider errors', async () =>
    {
        const deleteObject = vi.fn().mockRejectedValue(new Error('gcs unavailable'));
        const provider = providerWithDelete(deleteObject);

        await expect(provider.delete('private/card.webp')).rejects.toThrow('gcs unavailable');
    });

    it('rejects URLs before calling GCS', async () =>
    {
        const deleteObject = vi.fn().mockResolvedValue([]);
        const provider = providerWithDelete(deleteObject);

        await expect(provider.delete('https://storage.googleapis.com/bucket/card.webp')).rejects.toThrow(
            'requires a storage key',
        );
        expect(deleteObject).not.toHaveBeenCalled();
    });

    it('returns partial batch results', async () =>
    {
        const deleteObject = vi.fn().mockImplementation((options: { ignoreNotFound: boolean }) =>
        {
            expect(options).toEqual({ ignoreNotFound: true });
            if (deleteObject.mock.calls.length === 2)
            {
                return Promise.reject(new Error('denied'));
            }

            return Promise.resolve([]);
        });
        const provider = providerWithDelete(deleteObject);

        await expect(provider.deleteMany(['one', 'two'])).resolves.toEqual({
            deleted: ['one'],
            failed: [{ key: 'two', error: 'denied' }],
        });
    });
});

describe('GcsStorageProvider presigned upload size limits', () =>
{
    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    it('signs x-goog-content-length-range 0,max for maxBytes and returns it as a required header', async () =>
    {
        const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example']);
        const provider = providerWithSignedUrl(getSignedUrl);

        const result = await provider.getUploadUrl({ key: 'private/a.webp', contentType: 'image/webp', maxBytes: 10485760 });

        expect(getSignedUrl.mock.calls[0]?.[0]).toMatchObject({
            extensionHeaders: { 'x-goog-content-length-range': '0,10485760' },
        });
        expect(result.requiredHeaders).toEqual({ 'x-goog-content-length-range': '0,10485760' });
    });

    it('signs an exact range for contentLength', async () =>
    {
        const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example']);
        const provider = providerWithSignedUrl(getSignedUrl);

        const result = await provider.getUploadUrl({ key: 'private/a.webp', contentType: 'image/webp', contentLength: 1234 });

        expect(result.requiredHeaders).toEqual({ 'x-goog-content-length-range': '1234,1234' });
    });

    it('omits size headers and requiredHeaders when no limit is given', async () =>
    {
        const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example']);
        const provider = providerWithSignedUrl(getSignedUrl);

        const result = await provider.getUploadUrl({ key: 'private/a.webp', contentType: 'image/webp' });

        expect(getSignedUrl.mock.calls[0]?.[0]).not.toHaveProperty('extensionHeaders');
        expect(result).not.toHaveProperty('requiredHeaders');
    });

    it('includes cache-control and the size range in public upload required headers', async () =>
    {
        const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example']);
        const provider = providerWithSignedUrl(getSignedUrl);

        const result = await provider.getPublicUploadUrl({ key: 'public/a.webp', contentType: 'image/webp', maxBytes: 512 });

        expect(result.requiredHeaders).toEqual({
            'cache-control': 'public, max-age=2592000, immutable',
            'x-goog-content-length-range': '0,512',
        });
    });

    it('rejects invalid size limits before signing', async () =>
    {
        const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example']);
        const provider = providerWithSignedUrl(getSignedUrl);

        await expect(provider.getUploadUrl({ key: 'a', contentType: 'image/webp', maxBytes: -1 }))
            .rejects.toThrow('maxBytes must be a positive integer');
        await expect(provider.getUploadUrl({ key: 'a', contentType: 'image/webp', maxBytes: 10, contentLength: 11 }))
            .rejects.toThrow('exceeds maxBytes');
        expect(getSignedUrl).not.toHaveBeenCalled();
    });
});

function providerWithSignedUrl(getSignedUrl: (options: unknown) => Promise<string[]>): GcsStorageProvider
{
    const provider = new GcsStorageProvider({ publicBucket: 'public-test-bucket', privateBucket: 'private-test-bucket' });
    const bucket = { file: (_key: string) => ({ getSignedUrl }) };
    const internals = provider as unknown as { publicBucket: unknown; privateBucket: unknown };
    internals.publicBucket = bucket;
    internals.privateBucket = bucket;

    return provider;
}

function providerWithDelete(deleteObject: (options: { ignoreNotFound: boolean }) => Promise<unknown>): GcsStorageProvider
{
    const provider = new GcsStorageProvider();
    const bucket = { file: (_key: string) => ({ delete: deleteObject }) };
    const internals = provider as unknown as TestProviderInternals;
    internals.publicBucket = bucket;
    internals.privateBucket = bucket;

    return provider;
}

function restoreEnv(key: string, value: string | undefined): void
{
    if (value === undefined)
    {
        delete process.env[key];
    }
    else
    {
        process.env[key] = value;
    }
}
