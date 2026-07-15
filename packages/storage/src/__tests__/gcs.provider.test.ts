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

describe('GcsStorageProvider temp upload and finalize', () =>
{
    it('signs tmp/<key> for temp uploads and keeps the final key in the result', async () =>
    {
        const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example']);
        const { provider, file } = providerWithFiles({ getSignedUrl });

        const result = await provider.getUploadUrl({ key: 'private/a.webp', contentType: 'image/webp', temp: true });

        expect(file).toHaveBeenCalledWith('tmp/private/a.webp');
        expect(result.key).toBe('private/a.webp');
    });

    it('signs the final key directly without temp', async () =>
    {
        const getSignedUrl = vi.fn().mockResolvedValue(['https://signed.example']);
        const { provider, file } = providerWithFiles({ getSignedUrl });

        await provider.getUploadUrl({ key: 'private/a.webp', contentType: 'image/webp' });

        expect(file).toHaveBeenCalledWith('private/a.webp');
    });

    it('finalizeObject moves tmp/<key> to the final key', async () =>
    {
        const move = vi.fn().mockResolvedValue([]);
        const { provider, file } = providerWithFiles({ move });

        await provider.finalizeObject('private/a.webp');

        expect(file).toHaveBeenCalledWith('tmp/private/a.webp');
        expect(move).toHaveBeenCalledWith('private/a.webp');
    });

    it('finalizeObject succeeds when already finalized', async () =>
    {
        const move = vi.fn().mockRejectedValue(notFoundError());
        const exists = vi.fn().mockResolvedValue([true]);
        const { provider } = providerWithFiles({ move, exists });

        await expect(provider.finalizeObject('private/a.webp')).resolves.toBeUndefined();
    });

    it('finalizeObject rejects when neither temp nor final object exists', async () =>
    {
        const move = vi.fn().mockRejectedValue(notFoundError());
        const exists = vi.fn().mockResolvedValue([false]);
        const { provider } = providerWithFiles({ move, exists });

        await expect(provider.finalizeObject('private/a.webp')).rejects.toMatchObject({ code: 404 });
    });

    it('finalizeObject propagates non-404 move errors without an existence check', async () =>
    {
        const move = vi.fn().mockRejectedValue(new Error('gcs unavailable'));
        const exists = vi.fn();
        const { provider } = providerWithFiles({ move, exists });

        await expect(provider.finalizeObject('private/a.webp')).rejects.toThrow('gcs unavailable');
        expect(exists).not.toHaveBeenCalled();
    });
});

function notFoundError(): Error & { code: number }
{
    return Object.assign(new Error('No such object'), { code: 404 });
}

function providerWithFiles(handlers: Record<string, unknown>): { provider: GcsStorageProvider; file: ReturnType<typeof vi.fn> }
{
    const provider = new GcsStorageProvider({ publicBucket: 'public-test-bucket', privateBucket: 'private-test-bucket' });
    const file = vi.fn().mockReturnValue(handlers);
    const internals = provider as unknown as { publicBucket: unknown; privateBucket: unknown };
    internals.publicBucket = { file };
    internals.privateBucket = { file };

    return { provider, file };
}

function providerWithSignedUrl(getSignedUrl: (options: unknown) => Promise<string[]>): GcsStorageProvider
{
    return providerWithFiles({ getSignedUrl }).provider;
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
