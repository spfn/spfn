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
