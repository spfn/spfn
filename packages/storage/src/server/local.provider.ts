/**
 * 로컬 파일시스템 프로바이더 — 개발용.
 *
 * 객체를 `LOCAL_STORAGE_DIR`(기본 `.storage`) 아래 key 경로로 그대로 기록한다.
 * 공개 URL은 소비 앱이 `getStorageService().download(key)`로 스트리밍하는
 * provider-중립 라우트(`LOCAL_STORAGE_BASE_URL`, 기본 `/api/storage`)를 가리킨다.
 * presigned PUT은 서명 개념이 없어 미지원 — 그림 생성 등 서버 직접 업로드만 쓴다.
 */

import { mkdir, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { DEFAULT_EXPIRES_IN, MAX_FILE_SIZE } from '../shared/index';
import { assertStorageKey, deleteManyIndividually } from './delete-many';
import type {
    DeleteManyResult,
    IStorageProvider,
    PresignedUrlParams,
    PublicUploadParams,
    PresignedUrlResult,
} from '../shared/index';

export class LocalStorageProvider implements IStorageProvider
{
    private baseDir: string;
    private baseUrl: string;

    constructor()
    {
        this.baseDir = resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? '.storage');
        this.baseUrl = (process.env.LOCAL_STORAGE_BASE_URL ?? '/api/storage').replace(/\/+$/, '');
    }

    /** key를 baseDir 안의 실제 경로로. traversal(`..` 등)은 차단. */
    private pathFor(key: string): string
    {
        const full = resolve(this.baseDir, key);
        if (!isWithin(this.baseDir, full))
        {
            throw new Error(`Invalid storage key: ${key}`);
        }

        return full;
    }

    async getUploadUrl(_params: PresignedUrlParams & { temp?: boolean }): Promise<PresignedUrlResult>
    {
        throw new Error('presigned upload not supported by local storage provider');
    }

    async getPublicUploadUrl(_params: PublicUploadParams): Promise<PresignedUrlResult>
    {
        throw new Error('presigned upload not supported by local storage provider');
    }

    async getDownloadUrl(key: string, _expiresIn = DEFAULT_EXPIRES_IN): Promise<string>
    {
        return this.getPublicUrl(key);
    }

    getPublicUrl(key: string): string
    {
        return `${this.baseUrl}/${key}`;
    }

    async upload(key: string, body: string | Buffer, _contentType: string): Promise<void>
    {
        const path = this.pathFor(key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, body);
    }

    async download(key: string): Promise<Buffer>
    {
        return readFile(this.pathFor(key));
    }

    async delete(key: string): Promise<void>
    {
        assertStorageKey(key);
        const path = this.pathFor(key);

        try
        {
            const [realBaseDir, realParentDir] = await Promise.all([
                realpath(this.baseDir),
                realpath(dirname(path)),
            ]);
            if (!isWithin(realBaseDir, realParentDir))
            {
                throw new Error(`Invalid storage key: ${key}`);
            }
            await unlink(path);
        }
        catch (error)
        {
            if (!isNotFoundError(error))
            {
                throw error;
            }
        }
    }

    async deleteMany(keys: string[]): Promise<DeleteManyResult>
    {
        return deleteManyIndividually(keys, key => this.delete(key));
    }

    /** 로컬은 temp 태그 개념이 없어 no-op. */
    async finalizeObject(_key: string): Promise<void>
    {
    }

    getMaxFileSize(): number
    {
        return MAX_FILE_SIZE;
    }
}

function isWithin(root: string, candidate: string): boolean
{
    return candidate === root || candidate.startsWith(root + sep);
}

function isNotFoundError(error: unknown): boolean
{
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
