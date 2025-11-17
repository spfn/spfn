/**
 * Environment Variable Registry
 *
 * 환경변수 스키마를 등록하고 타입 안전하게 접근할 수 있는 레지스트리
 *
 * @example
 * ```typescript
 * const schema = defineEnvSchema({
 *   DATABASE_URL: {
 *     ...envString({ description: 'Database URL', required: true }),
 *     key: 'DATABASE_URL',
 *   }
 * });
 *
 * const env = createEnvRegistry(schema);
 * const dbUrl = env.require('DATABASE_URL');
 * ```
 *
 * @module env/registry
 */

import type { EnvVarSchema, EnvSchemaCollection, InferEnvType } from './schema';
import { isClientAccessible } from './schema';
import { getEnvVar, hasEnvVar } from './loader';

/**
 * 검증 결과
 */
export interface ValidationResult
{
    /** 검증 성공 여부 */
    valid: boolean;
    /** 에러 목록 */
    errors: ValidationError[];
    /** 경고 목록 */
    warnings: ValidationWarning[];
}

/**
 * 검증 에러
 */
export interface ValidationError
{
    /** 환경변수 키 */
    key: string;
    /** 에러 타입 */
    type: 'missing' | 'invalid' | 'type_mismatch';
    /** 에러 메시지 */
    message: string;
    /** 관련 스키마 */
    schema?: EnvVarSchema;
}

/**
 * 검증 경고
 */
export interface ValidationWarning
{
    /** 환경변수 키 */
    key: string;
    /** 경고 타입 */
    type: 'no_schema' | 'sensitive_in_client';
    /** 경고 메시지 */
    message: string;
    /** 제안 사항 */
    suggestion?: string;
}

/**
 * 환경변수 레지스트리
 *
 * 스키마 기반 환경변수 관리 및 검증
 */
export class EnvRegistry<T extends EnvSchemaCollection = EnvSchemaCollection>
{
    private schemas = new Map<string, EnvVarSchema>();

    constructor(schemas?: T)
    {
        if (schemas)
        {
            this.registerMultiple(schemas);
        }
    }

    /**
     * 스키마 등록
     */
    register(schema: EnvVarSchema): void
    {
        this.schemas.set(schema.key, schema);
    }

    /**
     * 여러 스키마 등록
     */
    registerMultiple(schemas: EnvSchemaCollection): void
    {
        for (const [key, schema] of Object.entries(schemas))
        {
            this.register({ ...schema, key });
        }
    }

    /**
     * 환경변수 가져오기 (스키마 기반)
     *
     * @param key - 환경변수 키
     * @returns 환경변수 값 (없으면 undefined)
     */
    get<K extends keyof T>(key: K): InferEnvType<T>[K] | undefined
    {
        const schema = this.schemas.get(key as string);
        if (!schema)
        {
            throw new Error(`Schema not found for key: ${String(key)}`);
        }

        return this.getBySchema(schema) as InferEnvType<T>[K] | undefined;
    }

    /**
     * 필수 환경변수 가져오기
     *
     * @param key - 환경변수 키
     * @returns 환경변수 값
     * @throws 값이 없으면 에러
     */
    require<K extends keyof T>(key: K): InferEnvType<T>[K]
    {
        const value = this.get(key);
        if (value === undefined)
        {
            throw new Error(`Required environment variable missing: ${String(key)}`);
        }

        return value;
    }

    /**
     * 스키마 기반으로 값 가져오기
     */
    private getBySchema<U>(schema: EnvVarSchema<U>): U | undefined
    {
        const options: any = {
            required: false, // Don't use schema.required here, let registry.require() handle it
            default: schema.default,
            validator: schema.validator,
        };

        return getEnvVar<U>(schema.key, options);
    }

    /**
     * 모든 환경변수를 타입 안전하게 가져오기
     */
    getAll(): Partial<InferEnvType<T>>
    {
        const result: any = {};

        for (const [key, schema] of this.schemas)
        {
            try
            {
                result[key] = this.getBySchema(schema);
            }
            catch (error)
            {
                if (schema.required)
                {
                    throw error;
                }
            }
        }

        return result;
    }

    /**
     * 환경변수 검증
     */
    validate(): ValidationResult
    {
        const errors: ValidationError[] = [];
        const warnings: ValidationWarning[] = [];

        // 1. 필수 변수 확인
        for (const [key, schema] of this.schemas)
        {
            if (schema.required && !hasEnvVar(key))
            {
                errors.push({
                    key,
                    type: 'missing',
                    message: `Required environment variable missing: ${key}`,
                    schema,
                });
            }
        }

        // 2. 클라이언트 변수 중 민감정보 경고
        for (const [key, schema] of this.schemas)
        {
            if (isClientAccessible(key) && schema.sensitive)
            {
                warnings.push({
                    key,
                    type: 'sensitive_in_client',
                    message: `${key} is marked as sensitive but accessible from client (NEXT_PUBLIC_*)`,
                    suggestion: 'Remove NEXT_PUBLIC_ prefix or unmark as sensitive',
                });
            }
        }

        // 3. 스키마에 없는 환경변수 감지 (선택적)
        if (typeof process !== 'undefined' && process.env)
        {
            const schemaKeys = new Set(this.schemas.keys());
            for (const key of Object.keys(process.env))
            {
                // 시스템/CI/빌드 도구 변수 제외
                if (this.isSystemVariable(key))
                {
                    continue;
                }
                if (!schemaKeys.has(key))
                {
                    warnings.push({
                        key,
                        type: 'no_schema',
                        message: `Environment variable ${key} has no schema definition`,
                        suggestion: 'Consider adding schema or remove if unused',
                    });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * 시스템 환경변수인지 확인
     * (npm, Node.js, CI, 빌드 도구 등의 변수 제외)
     */
    private isSystemVariable(key: string): boolean
    {
        const systemPrefixes = [
            'npm_',           // npm
            'NODE_',          // Node.js
            'CI_',            // GitLab CI
            'GITHUB_',        // GitHub Actions
            'TRAVIS_',        // Travis CI
            'CIRCLE_',        // CircleCI
            'JENKINS_',       // Jenkins
            'GITLAB_',        // GitLab
            'BITBUCKET_',     // Bitbucket
            'VERCEL_',        // Vercel (keep for potential use)
            'NETLIFY_',       // Netlify (keep for potential use)
        ];

        // Check prefixes
        if (systemPrefixes.some((prefix) => key.startsWith(prefix)))
        {
            return true;
        }

        // Common system variables
        const systemVars = [
            'PATH',
            'HOME',
            'USER',
            'SHELL',
            'TERM',
            'PWD',
            'OLDPWD',
            'LANG',
            'LC_ALL',
            'TMPDIR',
            'EDITOR',
            'PAGER',
            'CI',
        ];

        return systemVars.includes(key);
    }

    /**
     * 스키마 조회
     */
    getSchema(key: string): EnvVarSchema | undefined
    {
        return this.schemas.get(key);
    }

    /**
     * 모든 스키마 조회
     */
    getAllSchemas(): Map<string, EnvVarSchema>
    {
        return new Map(this.schemas);
    }

    /**
     * 카테고리별 스키마 조회
     */
    getByCategory(category: string): EnvVarSchema[]
    {
        return Array.from(this.schemas.values()).filter(
            (s) => s.category === category
        );
    }

    /**
     * 필수 변수 목록
     */
    getRequired(): EnvVarSchema[]
    {
        return Array.from(this.schemas.values()).filter((s) => s.required);
    }

    /**
     * 민감정보 목록
     */
    getSensitive(): EnvVarSchema[]
    {
        return Array.from(this.schemas.values()).filter((s) => s.sensitive);
    }

    /**
     * 서버 전용 변수 목록
     */
    getServerOnly(): EnvVarSchema[]
    {
        return Array.from(this.schemas.values()).filter((s) => !isClientAccessible(s.key));
    }

    /**
     * 클라이언트 접근 가능 변수 목록
     */
    getClientAccessible(): EnvVarSchema[]
    {
        return Array.from(this.schemas.values()).filter((s) => isClientAccessible(s.key));
    }
}

/**
 * 레지스트리 생성 헬퍼
 *
 * @example
 * ```typescript
 * const schema = defineEnvSchema({
 *   DATABASE_URL: {
 *     ...envString({ description: 'Database URL', required: true }),
 *     key: 'DATABASE_URL',
 *   }
 * });
 *
 * const env = createEnvRegistry(schema);
 * ```
 */
export function createEnvRegistry<T extends EnvSchemaCollection>(
    schemas: T
): EnvRegistry<T>
{
    return new EnvRegistry(schemas);
}