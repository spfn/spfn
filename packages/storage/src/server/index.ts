/**
 * @spfn/storage/server — 스토리지 서비스 진입점.
 *
 * provider는 env `STORAGE_PROVIDER`(`local`|`s3`|`gcs`)로 선택. 미설정이면 개발은 `local`,
 * 운영(NODE_ENV=production)은 `s3`. gcs/local은 동적 로드.
 */

import type { IStorageProvider } from '../shared/index';

let _service: IStorageProvider | null = null;

export async function getStorageService(): Promise<IStorageProvider>
{
    if (_service)
    {
        return _service;
    }
    const provider = process.env.STORAGE_PROVIDER
        ?? (process.env.NODE_ENV === 'production' ? 's3' : 'local');
    if (provider === 'local')
    {
        const { LocalStorageProvider } = await import('./local.provider');
        _service = new LocalStorageProvider();
    }
    else if (provider === 'gcs')
    {
        const { GcsStorageProvider } = await import('./gcs.provider');
        _service = new GcsStorageProvider();
    }
    else
    {
        const { S3StorageProvider } = await import('./s3.provider');
        _service = new S3StorageProvider();
    }

    return _service;
}

export * from './keys';
export type {
    DeleteManyResult,
    IStorageProvider,
    PresignedUrlParams,
    PublicUploadParams,
    PresignedUrlResult,
} from '../shared/index';
export { MAX_FILE_SIZE, DEFAULT_EXPIRES_IN } from '../shared/index';
