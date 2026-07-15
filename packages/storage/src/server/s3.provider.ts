/**
 * S3 / S3-호환 프로바이더 (AWS S3 · Cloudflare R2 · MinIO · Wasabi).
 * R2 등은 `S3_ENDPOINT`만 추가하면 동작(S3 API 호환).
 * temp 업로드는 `lifecycle=temp` 태그 → finalizeObject로 제거. 고아 정리는 버킷 lifecycle 규칙(인프라).
 */

import {
    DeleteObjectCommand,
    DeleteObjectsCommand,
    DeleteObjectTaggingCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DEFAULT_EXPIRES_IN, MAX_FILE_SIZE } from '../shared/index';
import { assertStorageKey, errorMessage } from './delete-many';
import type {
    DeleteManyResult,
    IStorageProvider,
    PresignedUrlParams,
    PublicUploadParams,
    PresignedUrlResult,
    S3ProviderConfig,
} from '../shared/index';

const MAX_DELETE_OBJECTS = 1000;

export class S3StorageProvider implements IStorageProvider
{
    private client: S3Client;
    private bucket: string;
    private publicBaseUrl: string;

    constructor(config: S3ProviderConfig = {})
    {
        const region = config.region ?? process.env.S3_REGION ?? 'us-east-1';
        const endpoint = config.endpoint ?? process.env.S3_ENDPOINT;
        this.bucket = config.bucket ?? process.env.S3_BUCKET ?? '';
        this.client = new S3Client({
            region,
            credentials: {
                accessKeyId: config.accessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? '',
                secretAccessKey: config.secretAccessKey ?? process.env.S3_SECRET_ACCESS_KEY ?? '',
            },
            ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
        });
        this.publicBaseUrl = (config.publicBaseUrl ?? process.env.S3_PUBLIC_BASE_URL
            ?? `https://${this.bucket}.s3.${region}.amazonaws.com`).replace(/\/+$/, '');
    }

    async getUploadUrl(params: PresignedUrlParams & { temp?: boolean }): Promise<PresignedUrlResult>
    {
        const { key, contentType, expiresIn = DEFAULT_EXPIRES_IN, temp } = params;
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            ...(temp ? { Tagging: 'lifecycle=temp' } : {}),
        });

        return { uploadUrl: await getSignedUrl(this.client, command, { expiresIn }), key, expiresIn };
    }

    async getPublicUploadUrl(params: PublicUploadParams): Promise<PresignedUrlResult>
    {
        const { key, contentType, contentLength, maxAge = 2592000, expiresIn = DEFAULT_EXPIRES_IN } = params;
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            CacheControl: `public, max-age=${maxAge}, immutable`,
            Tagging: 'lifecycle=temp',
            ...(contentLength ? { ContentLength: contentLength } : {}),
        });

        return { uploadUrl: await getSignedUrl(this.client, command, { expiresIn }), key, expiresIn };
    }

    async getDownloadUrl(key: string, expiresIn = DEFAULT_EXPIRES_IN): Promise<string>
    {
        return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
    }

    getPublicUrl(key: string): string
    {
        return `${this.publicBaseUrl}/${key}`;
    }

    async upload(key: string, body: string | Buffer, contentType: string): Promise<void>
    {
        await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    }

    async download(key: string): Promise<Buffer>
    {
        const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
        if (!res.Body)
        {
            throw new Error(`Object not found: ${key}`);
        }

        return Buffer.from(await res.Body.transformToByteArray());
    }

    async delete(key: string): Promise<void>
    {
        assertStorageKey(key);
        await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    }

    async deleteMany(keys: string[]): Promise<DeleteManyResult>
    {
        const result: DeleteManyResult = { deleted: [], failed: [] };
        const validKeys: string[] = [];
        for (const key of keys)
        {
            try
            {
                assertStorageKey(key);
                validKeys.push(key);
            }
            catch (error)
            {
                result.failed.push({ key, error: errorMessage(error) });
            }
        }
        for (let offset = 0; offset < validKeys.length; offset += MAX_DELETE_OBJECTS)
        {
            const chunk = validKeys.slice(offset, offset + MAX_DELETE_OBJECTS);
            await this.deleteChunk(chunk, result);
        }

        return result;
    }

    private async deleteChunk(keys: string[], result: DeleteManyResult): Promise<void>
    {
        try
        {
            const response = await this.client.send(new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: { Objects: keys.map(Key => ({ Key })) },
            }));
            const errorsByKey = new Map(response.Errors
                ?.filter(error => error.Key)
                .map(error => [error.Key as string, formatS3Error(error.Code, error.Message)]));
            if (response.Errors?.some(error => !error.Key))
            {
                const error = formatS3Error(response.Errors[0]?.Code, response.Errors[0]?.Message);
                result.failed.push(...keys.map(key => ({ key, error })));

                return;
            }
            for (const key of keys)
            {
                const error = errorsByKey.get(key);
                if (error)
                {
                    result.failed.push({ key, error });
                }
                else
                {
                    result.deleted.push(key);
                }
            }
        }
        catch (error)
        {
            const message = errorMessage(error);
            result.failed.push(...keys.map(key => ({ key, error: message })));
        }
    }

    async finalizeObject(key: string): Promise<void>
    {
        await this.client.send(new DeleteObjectTaggingCommand({ Bucket: this.bucket, Key: key }));
    }

    getMaxFileSize(): number
    {
        return MAX_FILE_SIZE;
    }
}

function formatS3Error(code?: string, message?: string): string
{
    return [code, message].filter(Boolean).join(': ') || 'Object deletion failed';
}
