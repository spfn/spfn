/**
 * @spfn/storage — provider-agnostic object storage.
 *
 * presigned 업로드(S3 SigV4 / GCS V4 / R2 등 S3호환)·직접 업/다운로드·공개 URL·
 * 서버사이드 복사·프리픽스 정리·스트리밍 다운로드를 단일 인터페이스로 제공한다.
 * DB 없이 결과 key/URL은 소비 앱의 도메인 엔티티에 저장한다.
 */

import type { Readable } from 'node:stream';

/**
 * 키·프리픽스가 구조적으로 유효하지 않을 때. provider에 요청을 보내기 전에 던지므로
 * 잘못된 키가 스토리지에 닿지 않는다.
 */
export class StorageKeyError extends Error
{
    constructor(message: string)
    {
        super(message);
        this.name = 'StorageKeyError';
    }
}

/**
 * 대상 객체가 없을 때 — provider 3종이 같은 타입으로 통일한다. `code`는 Node 관습을
 * 따라 `ENOENT`이므로 provider와 무관하게 `error.code === 'ENOENT'`로도 판정할 수 있다.
 */
export class StorageObjectNotFoundError extends Error
{
    readonly key: string;
    readonly code = 'ENOENT';

    constructor(key: string)
    {
        super(`Object not found: ${key}`);
        this.name = 'StorageObjectNotFoundError';
        this.key = key;
    }
}

export interface PresignedUrlParams
{
    key: string;
    contentType: string;
    expiresIn?: number;
    /** 업로드 크기 상한(bytes). GCS는 서명으로 강제, S3 presigned PUT은 강제 불가(README 참고). */
    maxBytes?: number;
    /** 정확한 업로드 크기(bytes). S3·GCS 모두 서명으로 강제. */
    contentLength?: number;
}

export interface PublicUploadParams
{
    key: string;
    contentType: string;
    /** 정확한 업로드 크기(bytes). S3·GCS 모두 서명으로 강제. */
    contentLength?: number;
    /** 업로드 크기 상한(bytes). GCS는 서명으로 강제, S3 presigned PUT은 강제 불가(README 참고). */
    maxBytes?: number;
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
    /** 서명에 포함된 헤더 — 클라이언트가 PUT 요청에 그대로 보내야 서명이 유효하다. */
    requiredHeaders?: Record<string, string>;
}

export interface DeleteManyResult
{
    deleted: string[];
    failed: Array<{ key: string; error: string }>;
}

/** `list`가 돌려주는 객체 한 건. */
export interface StorageObject
{
    key: string;
    /** 바이트 크기. provider가 알려주지 않으면 0. */
    size: number;
    lastModified?: Date;
}

export interface StorageListOptions
{
    /** 한 페이지 최대 개수(양의 정수). 미지정 시 1,000. */
    maxKeys?: number;
    /** 직전 페이지가 돌려준 커서. provider마다 형식이 다른 불투명 값이다. */
    cursor?: string;
}

export interface StorageListResult
{
    objects: StorageObject[];
    /** 다음 페이지 커서. `undefined`면 마지막 페이지다 — 빈 `objects`로 판단하면 안 된다. */
    cursor?: string;
}

/** `deletePrefix` 결과. 삭제 대상이 많을 수 있어 성공은 개수만 센다. */
export interface PrefixDeleteResult
{
    deleted: number;
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
    /**
     * presigned PUT URL. temp=true면 임시 업로드로 표시 — S3는 `lifecycle=temp` 태그,
     * GCS는 `tmp/<key>` prefix에 서명. 고아는 버킷 lifecycle 규칙이 정리(README 참고).
     * temp 객체는 finalizeObject 전에는 읽기가 보장되지 않는다(GCS는 최종 key에 없음).
     */
    getUploadUrl(params: PresignedUrlParams & { temp?: boolean }): Promise<PresignedUrlResult>;
    /** 공개 캐시 헤더가 붙은 presigned PUT URL. */
    getPublicUploadUrl(params: PublicUploadParams): Promise<PresignedUrlResult>;
    /** presigned GET URL(비공개 객체 다운로드용). */
    getDownloadUrl(key: string, expiresIn?: number): Promise<string>;
    /** 공개 객체의 영구 URL(서명 없이 서빙). */
    getPublicUrl(key: string): string;
    /** 서버 직접 업로드. */
    upload(key: string, body: string | Buffer, contentType: string): Promise<void>;
    /** 서버 직접 다운로드(전체를 메모리에 올린다). 객체가 없으면 StorageObjectNotFoundError. */
    download(key: string): Promise<Buffer>;
    /**
     * 스트리밍 다운로드 — 큰 객체를 메모리에 올리지 않고 프록시로 서빙하는 경로용.
     * 객체가 없으면 StorageObjectNotFoundError로 거부한다. 반환된 스트림은 호출자가
     * 반드시 소비하거나 `destroy()` 해야 한다(열린 파일 서술자·연결이 남는다).
     */
    getStream(key: string): Promise<Readable>;
    /**
     * 서버사이드 복사 — 바이트가 애플리케이션을 거치지 않는다. 원본이 없으면
     * StorageObjectNotFoundError, 대상이 이미 있으면 덮어쓴다. 원본은 남는다.
     */
    copy(from: string, to: string): Promise<void>;
    /**
     * `<prefix>/` 아래 객체를 한 페이지씩 나열한다. 경로 경계로만 매칭하므로
     * `list('gen/req-1')`은 `gen/req-10/...`을 절대 포함하지 않는다.
     * prefix 자체 키(`gen/req-1`)도 포함하지 않는다.
     */
    list(prefix: string, options?: StorageListOptions): Promise<StorageListResult>;
    /**
     * `<prefix>/` 아래 모든 객체를 삭제한다(경로 경계 매칭). prefix 자체 키는 남으므로
     * 그건 `delete(prefix)`로 지운다. 원자적이지 않다 — 진행 중 새로 올라온 객체는 남을 수 있다.
     */
    deletePrefix(prefix: string): Promise<PrefixDeleteResult>;
    /** 객체 key를 삭제한다. 존재하지 않는 객체도 성공으로 처리한다. 하위 객체는 건드리지 않는다. */
    delete(key: string): Promise<void>;
    /** 여러 객체를 삭제하고 key별 성공/실패 결과를 반환한다. */
    deleteMany?(keys: string[]): Promise<DeleteManyResult>;
    /**
     * 임시 객체를 영구화 — S3는 태그 제거, GCS는 `tmp/<key>` → `key` 이동. 멱등:
     * 이미 finalize된 key는 성공, temp·최종 어디에도 없으면(업로드 미완료) 에러.
     */
    finalizeObject(key: string): Promise<void>;
    getMaxFileSize(): number;
}

export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const DEFAULT_EXPIRES_IN = 3600;
