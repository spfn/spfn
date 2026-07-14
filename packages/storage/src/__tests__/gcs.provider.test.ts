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
