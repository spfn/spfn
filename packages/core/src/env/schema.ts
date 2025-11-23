/**
 * Environment Variable Schema Definition System
 *
 * 환경변수에 메타데이터를 정의하여 중앙 관리, 문서화, 검증을 지원합니다.
 *
 * @example
 * ```typescript
 * const schema = defineEnvSchema({
 *   DATABASE_URL: envUrl({
 *     description: 'Database connection',
 *     required: true,
 *     validator: parsePostgresUrl,
 *     sensitive: true,
 *   })
 * });
 * ```
 *
 * @module env/schema
 */

import { parseBoolean, parseNumber } from './validator';

/**
 * 환경변수 스키마 정의
 */
export interface EnvVarSchema<T = string>
{
    /** 환경변수 키 */
    key: string;

    /** 설명 (목적, 사용처) */
    description: string;

    /** 타입 */
    type: 'string' | 'number' | 'boolean' | 'url' | 'enum' | 'json';

    /** 필수 여부 */
    required?: boolean;

    /** 기본값 */
    default?: T;

    /** 검증/변환 함수 */
    validator?: (value: string) => T;

    // === 검증 옵션 ===

    /** Fallback 환경변수 키들 (backward compatibility) */
    fallbackKeys?: string[];

    /** 최소 길이 (문자열 타입) */
    minLength?: number;

    // === 메타데이터 ===

    /** 민감정보 여부 (로깅 시 마스킹) */
    sensitive?: boolean;

    /** 예시 값들 (타입과 일치해야 함) */
    examples?: T[];
}

/**
 * 스키마 컬렉션 타입
 */
export type EnvSchemaCollection = Record<string, EnvVarSchema<any>>;

/**
 * 스키마로부터 타입 추출
 */
export type InferEnvType<T extends EnvSchemaCollection> = {
    [K in keyof T]: T[K] extends EnvVarSchema<infer U> ? U : string;
};

/**
 * 스키마 정의 헬퍼 (타입 추론 지원)
 *
 * Automatically fills in the `key` property from object keys.
 *
 * @example
 * ```typescript
 * const schema = defineEnvSchema({
 *   DATABASE_URL: envString({ description: 'Database URL', required: true })
 * });
 * // Automatically adds key: 'DATABASE_URL'
 * ```
 */
export function defineEnvSchema<T extends Record<string, Omit<EnvVarSchema<any>, 'key'>>>(
    schema: T
): { [K in keyof T]: T[K] & { key: K } }
{
    const result: any = {};

    for (const key in schema)
    {
        result[key] = {
            ...schema[key],
            key,
        };
    }

    return result;
}

/**
 * 문자열 스키마 헬퍼
 *
 * @example
 * ```typescript
 * const schema = {
 *   API_KEY: {
 *     ...envString({
 *       description: 'API authentication key',
 *       required: true,
 *       sensitive: true,
 *     }),
 *     key: 'API_KEY',
 *   }
 * };
 * ```
 */
export function envString(
    options: Omit<EnvVarSchema, 'key' | 'type'>
): Omit<EnvVarSchema, 'key'>
{
    return {
        ...options,
        type: 'string',
    };
}

/**
 * 숫자 스키마 헬퍼
 *
 * @example
 * ```typescript
 * const schema = {
 *   PORT: {
 *     ...envNumber({
 *       description: 'Server port',
 *       default: 3000,
 *       validator: createNumberParser({ min: 1, max: 65535 }),
 *     }),
 *     key: 'PORT',
 *   }
 * };
 * ```
 */
export function envNumber(
    options: Omit<EnvVarSchema<number>, 'key' | 'type'>
): Omit<EnvVarSchema<number>, 'key'>
{
    return {
        ...options,
        type: 'number',
        validator: options.validator || parseNumber,
    };
}

/**
 * Boolean 스키마 헬퍼
 *
 * @example
 * ```typescript
 * const schema = {
 *   DEBUG: {
 *     ...envBoolean({
 *       description: 'Enable debug mode',
 *       default: false,
 *     }),
 *     key: 'DEBUG',
 *   }
 * };
 * ```
 */
export function envBoolean(
    options: Omit<EnvVarSchema<boolean>, 'key' | 'type'>
): Omit<EnvVarSchema<boolean>, 'key'>
{
    return {
        ...options,
        type: 'boolean',
        validator: options.validator || parseBoolean,
    };
}

/**
 * URL 스키마 헬퍼
 *
 * @example
 * ```typescript
 * const schema = {
 *   DATABASE_URL: {
 *     ...envUrl({
 *       description: 'Database connection URL',
 *       required: true,
 *       validator: parsePostgresUrl,
 *     }),
 *     key: 'DATABASE_URL',
 *   }
 * };
 * ```
 */
export function envUrl(
    options: Omit<EnvVarSchema, 'key' | 'type'>
): Omit<EnvVarSchema, 'key'>
{
    return {
        ...options,
        type: 'url',
    };
}

/**
 * Enum 스키마 헬퍼
 *
 * @example
 * ```typescript
 * const schema = {
 *   LOG_LEVEL: {
 *     ...envEnum(['debug', 'info', 'warn', 'error'] as const, {
 *       description: 'Logging level',
 *       default: 'info',
 *     }),
 *     key: 'LOG_LEVEL',
 *   }
 * };
 * ```
 */
export function envEnum<T extends string>(
    allowed: readonly T[],
    options: Omit<EnvVarSchema<T>, 'key' | 'type' | 'validator'>
): Omit<EnvVarSchema<T>, 'key'>
{
    return {
        ...options,
        type: 'enum',
        validator: (val: string): T =>
        {
            if (!allowed.includes(val as T))
            {
                throw new Error(`Must be one of: ${allowed.join(', ')}, got: ${val}`);
            }

            return val as T;
        },
    };
}

/**
 * JSON 스키마 헬퍼
 *
 * @example
 * ```typescript
 * const schema = {
 *   CONFIG_JSON: {
 *     ...envJson<{ host: string; port: number }>({
 *       description: 'JSON configuration object',
 *       required: true,
 *     }),
 *     key: 'CONFIG_JSON',
 *   }
 * };
 * ```
 */
export function envJson<T = any>(
    options: Omit<EnvVarSchema<T>, 'key' | 'type' | 'validator'>
): Omit<EnvVarSchema<T>, 'key'>
{
    // Import parseJson directly here to avoid circular dependency
    const parseJson = (val: string): T =>
    {
        try
        {
            return JSON.parse(val) as T;
        }
        catch (error)
        {
            throw new Error(
                `Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    };

    return {
        ...options,
        type: 'json',
        validator: parseJson,
    };
}

/**
 * 환경변수가 클라이언트에서 접근 가능한지 확인
 * (NEXT_PUBLIC_ 접두사로 판단)
 *
 * @param key - 환경변수 키
 * @returns 클라이언트에서 접근 가능하면 true
 *
 * @example
 * ```typescript
 * isClientAccessible('NEXT_PUBLIC_API_URL');  // true
 * isClientAccessible('DATABASE_URL');         // false
 * ```
 */
export function isClientAccessible(key: string): boolean
{
    return key.startsWith('NEXT_PUBLIC_');
}

/**
 * 환경변수가 서버 전용인지 확인
 * (NEXT_PUBLIC_ 접두사가 없으면 서버 전용)
 *
 * @param key - 환경변수 키
 * @returns 서버 전용이면 true
 *
 * @example
 * ```typescript
 * isServerOnly('DATABASE_URL');              // true
 * isServerOnly('NEXT_PUBLIC_API_URL');       // false
 * ```
 */
export function isServerOnly(key: string): boolean
{
    return !isClientAccessible(key);
}