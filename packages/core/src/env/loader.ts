/**
 * Environment Variable Loader
 *
 * Next.js 스타일의 환경변수 파일 로딩
 *
 * @example
 * ```typescript
 * import { loadEnv } from '@spfn/core/env/loader';
 *
 * // SPFN 서버 진입점에서 호출
 * loadEnv();
 *
 * // 이후 스키마 검증
 * const env = createEnvRegistry(envSchema).validate();
 * ```
 *
 * @module env/loader
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';
import { logger } from '@spfn/core/logger';

const envLogger = logger.child('@spfn/core:env-loader');

/**
 * loadEnv 옵션
 */
export interface LoadEnvOptions
{
    /**
     * 프로젝트 루트 경로
     * @default process.cwd()
     */
    cwd?: string;

    /**
     * 디버그 모드 (로드된 파일 로깅)
     * @default false
     */
    debug?: boolean;

    /**
     * 기존 process.env 값 덮어쓰기 허용
     * @default false
     */
    override?: boolean;
}

/**
 * 환경변수 파일 로딩 순서 (우선순위 낮음 → 높음)
 *
 * 1. .env              - 기본값 (커밋 O)
 * 2. .env.local        - 로컬 오버라이드 (커밋 X)
 * 3. .env.server       - 서버 전용 기본값 (커밋 O)
 * 4. .env.server.local - 서버 전용 민감정보 (커밋 X)
 */
const ENV_FILES = [
    '.env',
    '.env.local',
    '.env.server',
    '.env.server.local',
] as const;

/**
 * 단일 .env 파일 파싱
 */
function parseEnvFile(filePath: string): Record<string, string> | null
{
    if (!existsSync(filePath))
    {
        return null;
    }

    const content = readFileSync(filePath, 'utf-8');
    return parse(content);
}

/**
 * 환경변수 로드 결과
 */
export interface LoadEnvResult
{
    /**
     * 로드된 파일 목록
     */
    loadedFiles: string[];

    /**
     * 로드된 환경변수 키 목록
     */
    loadedKeys: string[];
}

/**
 * 프로젝트 루트의 환경변수 파일들을 규칙에 따라 로드
 *
 * Next.js 스타일의 우선순위를 따름:
 * - .env → .env.local → .env.server → .env.server.local
 * - 나중에 로드된 값이 이전 값을 덮어씀
 *
 * @param options - 로드 옵션
 * @returns 로드 결과 (로드된 파일, 키 목록)
 *
 * @example
 * ```typescript
 * // 기본 사용
 * loadEnv();
 *
 * // 커스텀 경로
 * loadEnv({ cwd: '/path/to/project' });
 *
 * // 디버그 모드
 * loadEnv({ debug: true });
 * ```
 */
export function loadEnv(options: LoadEnvOptions = {}): LoadEnvResult
{
    const {
        cwd = process.cwd(),
        debug = false,
        override = false,
    } = options;

    const loadedFiles: string[] = [];
    const loadedKeys = new Set<string>();

    for (const fileName of ENV_FILES)
    {
        const filePath = resolve(cwd, fileName);
        const parsed = parseEnvFile(filePath);

        if (parsed === null)
        {
            continue;
        }

        loadedFiles.push(fileName);

        for (const [key, value] of Object.entries(parsed))
        {
            // 기존 값이 있고 override가 false면 스킵
            if (!override && process.env[key] !== undefined)
            {
                continue;
            }

            process.env[key] = value;
            loadedKeys.add(key);
        }
    }

    if (debug && loadedFiles.length > 0)
    {
        envLogger.debug(`Loaded env files: ${loadedFiles.join(', ')}`);
        envLogger.debug(`Loaded ${loadedKeys.size} environment variables`);
    }

    return {
        loadedFiles,
        loadedKeys: Array.from(loadedKeys),
    };
}

/**
 * 환경변수가 이미 로드되었는지 확인하는 플래그
 */
let isEnvLoaded = false;

/**
 * 환경변수를 한 번만 로드 (중복 호출 방지)
 *
 * @param options - 로드 옵션
 * @returns 로드 결과 (이미 로드된 경우 빈 결과)
 */
export function loadEnvOnce(options: LoadEnvOptions = {}): LoadEnvResult
{
    if (isEnvLoaded)
    {
        return {
            loadedFiles: [],
            loadedKeys: [],
        };
    }

    isEnvLoaded = true;
    return loadEnv(options);
}

/**
 * 환경변수 로드 상태 리셋 (테스트용)
 */
export function resetEnvLoadState(): void
{
    isEnvLoaded = false;
}
