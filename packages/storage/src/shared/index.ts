/**
 * @spfn/storage — provider-agnostic object storage.
 *
 * presigned 업로드(S3 SigV4 / GCS V4 / R2 등 S3호환)·직접 업/다운로드·공개 URL을
 * 단일 인터페이스로 제공한다. DB 없이 결과 key/URL은 소비 앱의 도메인 엔티티에 저장한다.
 */

export interface PresignedUrlParams
{
    key: string;
    contentType: string;
    expiresIn?: number;
}

export interface PublicUploadParams
{
    key: string;
    contentType: string;
    contentLength?: number;
    maxAge?: number;
    expiresIn?: number;
}

export interface PresignedUrlResult
{
    /** 클라이언트가 PUT 할 presigned URL */
    uploadUrl: string;
    /** 업로드된 객체 key (provider-중립 이름) */
    key: string;
    expiresIn: number;
}

export interface DeleteManyResult
{
    deleted: string[];
    failed: Array<{ key: string; error: string }>;
}

/** S3/S3-호환 프로바이더 설정. 미지정 필드는 process.env(S3_*)로 fallback. */
export interface S3ProviderConfig
{
    region?: string;
    endpoint?: string;
    bucket?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicBaseUrl?: string;
}

/** GCS 프로바이더 설정. 미지정 필드는 process.env(GCS_*)로 fallback. */
export interface GcsProviderConfig
{
    projectId?: string;
    publicBucket?: string;
    privateBucket?: string;
    credentialsJsonBase64?: string;
}

/** 로컬 프로바이더 설정. 미지정 필드는 process.env(LOCAL_STORAGE_*)로 fallback. */
export interface LocalProviderConfig
{
    dir?: string;
    baseUrl?: string;
}

/**
 * getStorageService 옵션 — 앱의 검증된 설정(env 스키마 등)을 주입하는 경로.
 * provider 미지정 시 STORAGE_PROVIDER env, 그것도 없으면 dev=local/prod=s3.
 */
export interface StorageServiceOptions
{
    provider?: 'local' | 's3' | 'gcs';
    s3?: S3ProviderConfig;
    gcs?: GcsProviderConfig;
    local?: LocalProviderConfig;
}

export interface IStorageProvider
{
    /** presigned PUT URL. temp=true면 임시 태그(버킷 lifecycle이 정리). */
    getUploadUrl(params: PresignedUrlParams & { temp?: boolean }): Promise<PresignedUrlResult>;
    /** 공개 캐시 헤더가 붙은 presigned PUT URL. */
    getPublicUploadUrl(params: PublicUploadParams): Promise<PresignedUrlResult>;
    /** presigned GET URL(비공개 객체 다운로드용). */
    getDownloadUrl(key: string, expiresIn?: number): Promise<string>;
    /** 공개 객체의 영구 URL(서명 없이 서빙). */
    getPublicUrl(key: string): string;
    /** 서버 직접 업로드. */
    upload(key: string, body: string | Buffer, contentType: string): Promise<void>;
    /** 서버 직접 다운로드. */
    download(key: string): Promise<Buffer>;
    /** 객체 key를 삭제한다. 존재하지 않는 객체도 성공으로 처리한다. */
    delete(key: string): Promise<void>;
    /** 여러 객체를 삭제하고 key별 성공/실패 결과를 반환한다. */
    deleteMany?(keys: string[]): Promise<DeleteManyResult>;
    /** 임시 객체를 영구화(temp 태그 제거 등). */
    finalizeObject(key: string): Promise<void>;
    getMaxFileSize(): number;
}

export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const DEFAULT_EXPIRES_IN = 3600;
