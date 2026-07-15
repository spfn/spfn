/**
 * Google Cloud Storage 프로바이더.
 * `public/*` 키 → 공개 버킷, 그 외 → 비공개 버킷(V4 signed). presigned는 GCS V4 native.
 * temp/finalize는 인프라 lifecycle(customTime)로 처리 — finalizeObject는 no-op.
 *
 * @google-cloud/storage는 optional dependency — STORAGE_PROVIDER=gcs일 때만 동적 로드된다.
 */

import { Storage, type Bucket } from '@google-cloud/storage';
import { DEFAULT_EXPIRES_IN, MAX_FILE_SIZE } from '../shared/index';
import { assertStorageKey, deleteManyIndividually } from './delete-many';
import { isPublicKey } from './keys';
import { assertSizeLimits, gcsContentLengthRange } from './size-limit';
import type {
    DeleteManyResult,
    GcsProviderConfig,
    IStorageProvider,
    PresignedUrlParams,
    PublicUploadParams,
    PresignedUrlResult,
} from '../shared/index';

export class GcsStorageProvider implements IStorageProvider
{
    private storage: Storage;
    private publicBucket: Bucket;
    private privateBucket: Bucket;
    private publicBucketName: string;

    constructor(config: GcsProviderConfig = {})
    {
        const credentials = decodeCredentials(config.credentialsJsonBase64 ?? process.env.GCS_CREDENTIALS_JSON_BASE64 ?? '');
        this.storage = new Storage({
            projectId: (config.projectId ?? process.env.GCS_PROJECT_ID) || undefined,
            ...(credentials ? { credentials } : {}),
        });
        this.publicBucketName = config.publicBucket ?? process.env.GCS_PUBLIC_BUCKET ?? '';
        this.publicBucket = this.storage.bucket(this.publicBucketName);
        this.privateBucket = this.storage.bucket(config.privateBucket ?? process.env.GCS_PRIVATE_BUCKET ?? '');
    }

    private resolveBucket(key: string): Bucket
    {
        return isPublicKey(key) ? this.publicBucket : this.privateBucket;
    }

    async getUploadUrl(params: PresignedUrlParams & { temp?: boolean }): Promise<PresignedUrlResult>
    {
        const { key, contentType, expiresIn = DEFAULT_EXPIRES_IN, maxBytes, contentLength } = params;
        assertSizeLimits(maxBytes, contentLength);
        const extensionHeaders = sizeExtensionHeaders(maxBytes, contentLength);
        const [uploadUrl] = await this.resolveBucket(key).file(key).getSignedUrl({
            version: 'v4', action: 'write', expires: Date.now() + expiresIn * 1000, contentType,
            ...(extensionHeaders ? { extensionHeaders } : {}),
        });

        return { uploadUrl, key, expiresIn, ...(extensionHeaders ? { requiredHeaders: extensionHeaders } : {}) };
    }

    async getPublicUploadUrl(params: PublicUploadParams): Promise<PresignedUrlResult>
    {
        const { key, contentType, maxAge = 2592000, expiresIn = DEFAULT_EXPIRES_IN, maxBytes, contentLength } = params;
        assertSizeLimits(maxBytes, contentLength);
        const extensionHeaders = {
            'cache-control': `public, max-age=${maxAge}, immutable`,
            ...sizeExtensionHeaders(maxBytes, contentLength),
        };
        const [uploadUrl] = await this.resolveBucket(key).file(key).getSignedUrl({
            version: 'v4', action: 'write', expires: Date.now() + expiresIn * 1000, contentType,
            extensionHeaders,
        });

        return { uploadUrl, key, expiresIn, requiredHeaders: extensionHeaders };
    }

    async getDownloadUrl(key: string, expiresIn = DEFAULT_EXPIRES_IN): Promise<string>
    {
        const [url] = await this.resolveBucket(key).file(key).getSignedUrl({
            version: 'v4', action: 'read', expires: Date.now() + expiresIn * 1000,
        });

        return url;
    }

    getPublicUrl(key: string): string
    {
        return `https://storage.googleapis.com/${this.publicBucketName}/${key}`;
    }

    async upload(key: string, body: string | Buffer, contentType: string): Promise<void>
    {
        await this.resolveBucket(key).file(key).save(
            typeof body === 'string' ? Buffer.from(body) : body,
            { contentType, resumable: false },
        );
    }

    async download(key: string): Promise<Buffer>
    {
        const [buffer] = await this.resolveBucket(key).file(key).download();

        return buffer;
    }

    async delete(key: string): Promise<void>
    {
        assertStorageKey(key);
        await this.resolveBucket(key).file(key).delete({ ignoreNotFound: true });
    }

    async deleteMany(keys: string[]): Promise<DeleteManyResult>
    {
        return deleteManyIndividually(keys, key => this.delete(key));
    }

    async finalizeObject(_key: string): Promise<void>
    {
        // GCS는 인프라 lifecycle로 정리 — 의도적 no-op.
    }

    getMaxFileSize(): number
    {
        return MAX_FILE_SIZE;
    }
}

function sizeExtensionHeaders(maxBytes?: number, contentLength?: number): Record<string, string> | null
{
    const range = gcsContentLengthRange(maxBytes, contentLength);

    return range ? { 'x-goog-content-length-range': range } : null;
}

function decodeCredentials(base64: string): Record<string, unknown> | null
{
    if (!base64)
    {
        return null;
    }

    return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
}
