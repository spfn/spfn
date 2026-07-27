/**
 * S3 / S3-호환 프로바이더 (AWS S3 · Cloudflare R2 · MinIO · Wasabi).
 * R2 등은 `S3_ENDPOINT`만 추가하면 동작(S3 API 호환).
 * temp 업로드는 `lifecycle=temp` 태그 → finalizeObject로 제거. 고아 정리는 버킷 lifecycle 규칙(인프라).
 */

import {
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    DeleteObjectTaggingCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DEFAULT_EXPIRES_IN, MAX_FILE_SIZE, StorageObjectNotFoundError } from '../shared/index';
import { errorMessage } from './delete-many';
import { assertKeyPrefix, assertObjectKey, resolveMaxKeys } from './object-key';
import { deleteEveryListedObject } from './prefix-delete';
import { assertSizeLimits } from './size-limit';
import type { GetObjectCommandOutput } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type {
    DeleteManyResult,
    IStorageProvider,
    PrefixDeleteResult,
    PresignedUrlParams,
    PublicUploadParams,
    PresignedUrlResult,
    S3ProviderConfig,
    StorageListOptions,
    StorageListResult,
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

    /** maxBytes는 presigned PUT 서명 조건에 넣을 수 없어 무시된다 — 크기 강제는 contentLength로. */
    async getUploadUrl(params: PresignedUrlParams & { temp?: boolean }): Promise<PresignedUrlResult>
    {
        const { key, contentType, expiresIn = DEFAULT_EXPIRES_IN, temp, maxBytes, contentLength } = params;
        assertSizeLimits(maxBytes, contentLength);
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            ...(temp ? { Tagging: 'lifecycle=temp' } : {}),
            ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
        });
        const requiredHeaders = {
            ...(temp ? { 'x-amz-tagging': 'lifecycle=temp' } : {}),
            ...(contentLength !== undefined ? { 'content-length': String(contentLength) } : {}),
        };

        return {
            uploadUrl: await getSignedUrl(this.client, command, { expiresIn }), key, expiresIn,
            ...(Object.keys(requiredHeaders).length > 0 ? { requiredHeaders } : {}),
        };
    }

    /** maxBytes는 presigned PUT 서명 조건에 넣을 수 없어 무시된다 — 크기 강제는 contentLength로. */
    async getPublicUploadUrl(params: PublicUploadParams): Promise<PresignedUrlResult>
    {
        const { key, contentType, contentLength, maxBytes, maxAge = 2592000, expiresIn = DEFAULT_EXPIRES_IN } = params;
        assertSizeLimits(maxBytes, contentLength);
        const cacheControl = `public, max-age=${maxAge}, immutable`;
        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            ContentType: contentType,
            CacheControl: cacheControl,
            Tagging: 'lifecycle=temp',
            ...(contentLength ? { ContentLength: contentLength } : {}),
        });
        const requiredHeaders = {
            'cache-control': cacheControl,
            'x-amz-tagging': 'lifecycle=temp',
            ...(contentLength ? { 'content-length': String(contentLength) } : {}),
        };

        return { uploadUrl: await getSignedUrl(this.client, command, { expiresIn }), key, expiresIn, requiredHeaders };
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
        assertObjectKey(key);
        await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    }

    async download(key: string): Promise<Buffer>
    {
        const body = await this.getObjectBody(key);

        return Buffer.from(await body.transformToByteArray());
    }

    /** Node 런타임에서 SDK가 돌려주는 Body는 Readable이다(브라우저 빌드가 아님). */
    async getStream(key: string): Promise<Readable>
    {
        return await this.getObjectBody(key) as unknown as Readable;
    }

    async copy(from: string, to: string): Promise<void>
    {
        assertObjectKey(from);
        assertObjectKey(to);
        await this.client
            .send(new CopyObjectCommand({
                Bucket: this.bucket,
                CopySource: encodeCopySource(this.bucket, from),
                Key: to,
            }))
            .catch((error: unknown) =>
            {
                throw isS3NotFound(error) ? new StorageObjectNotFoundError(from) : error;
            });
    }

    async list(prefix: string, options: StorageListOptions = {}): Promise<StorageListResult>
    {
        assertKeyPrefix(prefix);
        const page = await this.client.send(new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: `${prefix}/`,
            MaxKeys: resolveMaxKeys(options.maxKeys),
            ...(options.cursor ? { ContinuationToken: options.cursor } : {}),
        }));

        return {
            objects: (page.Contents ?? [])
                .filter(item => typeof item.Key === 'string')
                .map(item => ({
                    key: item.Key as string,
                    size: item.Size ?? 0,
                    ...(item.LastModified ? { lastModified: item.LastModified } : {}),
                })),
            ...(page.IsTruncated && page.NextContinuationToken ? { cursor: page.NextContinuationToken } : {}),
        };
    }

    /** 키 단위 삭제 루프 — GCS interoperability가 `DeleteObjects`를 지원하지 않는다. */
    async deletePrefix(prefix: string): Promise<PrefixDeleteResult>
    {
        assertKeyPrefix(prefix);

        return deleteEveryListedObject(
            cursor => this.list(prefix, cursor === undefined ? {} : { cursor }),
            key => this.delete(key),
        );
    }

    async delete(key: string): Promise<void>
    {
        assertObjectKey(key);
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
                assertObjectKey(key);
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

    private async getObjectBody(key: string): Promise<NonNullable<GetObjectCommandOutput['Body']>>
    {
        assertObjectKey(key);
        const response = await this.client
            .send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
            .catch((error: unknown) =>
            {
                throw isS3NotFound(error) ? new StorageObjectNotFoundError(key) : error;
            });
        if (!response.Body)
        {
            throw new StorageObjectNotFoundError(key);
        }

        return response.Body;
    }
}

function formatS3Error(code?: string, message?: string): string
{
    return [code, message].filter(Boolean).join(': ') || 'Object deletion failed';
}

/**
 * `x-amz-copy-source` 값은 URL 인코딩해야 하고 SDK가 대신 해주지 않는다. 세그먼트 단위로
 * 인코딩해 `/` 구분자는 남기고 `?`·`#`·`+`·공백·유니코드가 든 키도 그대로 복사되게 한다.
 */
function encodeCopySource(bucket: string, key: string): string
{
    return `${bucket}/${key}`.split('/').map(encodeURIComponent).join('/');
}

/** SDK 오류는 name과 HTTP 상태 둘 중 하나로만 404를 알릴 때가 있어 양쪽을 본다. */
function isS3NotFound(error: unknown): boolean
{
    const name = (error as { name?: string } | null)?.name;
    const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;

    return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}
