import { DeleteObjectCommand, DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { S3StorageProvider } from '../server/s3.provider';

describe('S3StorageProvider deletion', () =>
{
    afterEach(() =>
    {
        vi.restoreAllMocks();
    });

    it('uses DeleteObject and treats an empty provider response as success', async () =>
    {
        const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
        const provider = new S3StorageProvider();

        await provider.delete('public/card.webp');

        const command = send.mock.calls[0]?.[0];
        expect(command).toBeInstanceOf(DeleteObjectCommand);
        expect((command as DeleteObjectCommand).input).toMatchObject({ Key: 'public/card.webp' });
    });

    it('propagates DeleteObject provider errors', async () =>
    {
        vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('provider unavailable') as never);
        const provider = new S3StorageProvider();

        await expect(provider.delete('card.webp')).rejects.toThrow('provider unavailable');
    });

    it('rejects URLs before sending a provider command', async () =>
    {
        const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
        const provider = new S3StorageProvider();

        await expect(provider.delete('https://cdn.example.com/card.webp')).rejects.toThrow(
            'requires a storage key',
        );
        expect(send).not.toHaveBeenCalled();
    });

    it('uses DeleteObjects and reports per-key errors', async () =>
    {
        const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
            Errors: [{ Key: 'failed.webp', Code: 'AccessDenied', Message: 'denied' }],
        } as never);
        const provider = new S3StorageProvider();

        await expect(provider.deleteMany(['deleted.webp', 'failed.webp'])).resolves.toEqual({
            deleted: ['deleted.webp'],
            failed: [{ key: 'failed.webp', error: 'AccessDenied: denied' }],
        });
        expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectsCommand);
    });

    it('returns all keys as failed when a batch request rejects', async () =>
    {
        vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('network error') as never);
        const provider = new S3StorageProvider();

        await expect(provider.deleteMany(['one', 'two'])).resolves.toEqual({
            deleted: [],
            failed: [
                { key: 'one', error: 'network error' },
                { key: 'two', error: 'network error' },
            ],
        });
    });
});

describe('S3StorageProvider presigned upload size limits', () =>
{
    const provider = new S3StorageProvider({
        region: 'us-east-1',
        bucket: 'test-bucket',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
    });

    it('signs content-length when contentLength is given and returns it as a required header', async () =>
    {
        const result = await provider.getUploadUrl({ key: 'private/a.webp', contentType: 'image/webp', contentLength: 1234 });

        expect(signedHeaders(result.uploadUrl)).toContain('content-length');
        expect(result.requiredHeaders).toMatchObject({ 'content-length': '1234' });
    });

    it('does not sign content-length for maxBytes alone (not enforceable on presigned PUT)', async () =>
    {
        const result = await provider.getUploadUrl({ key: 'private/a.webp', contentType: 'image/webp', maxBytes: 10485760 });

        expect(signedHeaders(result.uploadUrl)).not.toContain('content-length');
        expect(result).not.toHaveProperty('requiredHeaders');
    });

    it('returns tagging and cache-control required headers for public uploads', async () =>
    {
        const result = await provider.getPublicUploadUrl({ key: 'public/a.webp', contentType: 'image/webp', contentLength: 99 });

        expect(signedHeaders(result.uploadUrl)).toContain('content-length');
        expect(result.requiredHeaders).toEqual({
            'cache-control': 'public, max-age=2592000, immutable',
            'x-amz-tagging': 'lifecycle=temp',
            'content-length': '99',
        });
    });

    it('rejects invalid size limits before signing', async () =>
    {
        await expect(provider.getUploadUrl({ key: 'a', contentType: 'image/webp', contentLength: 1.5 }))
            .rejects.toThrow('contentLength must be a positive integer');
    });
});

function signedHeaders(uploadUrl: string): string[]
{
    return (new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
}
