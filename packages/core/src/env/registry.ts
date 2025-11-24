/**
 * Environment Variable Registry
 *
 * 환경변수 스키마를 등록하고 타입 안전하게 접근할 수 있는 레지스트리
 *
 * @example
 * ```typescript
 * const schema = defineEnvSchema({
 *   DATABASE_URL: envString({ description: 'Database URL', required: true })
 * });
 *
 * const registry = createEnvRegistry(schema);
 * const env = registry.validate(); // 검증 + env 반환
 * console.log(env.DATABASE_URL);
 * ```
 *
 * @module env/registry
 */

import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import type { EnvVarSchema, EnvSchemaCollection, InferEnvType } from './schema';
import { isClientAccessible } from './schema';

/**
 * 환경변수 레지스트리
 *
 * 스키마 기반 환경변수 관리 및 검증
 */
export class EnvRegistry<T extends EnvSchemaCollection = EnvSchemaCollection>
{
    private schemas = new Map<string, EnvVarSchema>();
    private validatedCache: InferEnvType<T> | null = null;
    private hasValidated = false;

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
     * 스키마 기반으로 값 가져오기 (내부 헬퍼)
     */
    private getBySchema<U>(schema: EnvVarSchema<U>): U | undefined
    {
        // Try primary key first
        let value = process.env[schema.key];

        // Try fallback keys if primary not found
        if (!value && schema.fallbackKeys)
        {
            for (const fallbackKey of schema.fallbackKeys)
            {
                value = process.env[fallbackKey];
                if (value)
                {
                    break;
                }
            }
        }

        // If still no value, use default or return undefined
        if (!value)
        {
            return schema.default;
        }

        // Apply validator if provided
        if (schema.validator)
        {
            try
            {
                return schema.validator(value) as U;
            }
            catch (error)
            {
                throw new Error(
                    `Validation failed for ${schema.key}: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        // No validator - return as-is (string)
        return value as U;
    }

    /**
     * 모든 환경변수를 타입 안전하게 가져오기 (내부 헬퍼)
     */
    private getAll(): InferEnvType<T>
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
     * 환경변수 검증 및 타입 안전한 env 객체 반환
     *
     * 에러 발견 시 예외를 던지고, 경고가 있으면 콘솔에 출력합니다.
     * 검증 통과 시 모든 환경변수를 포함한 타입 안전한 객체를 반환합니다.
     *
     * 같은 레지스트리 인스턴스에서 여러 번 호출되어도 실제 검증은 한 번만 수행됩니다.
     *
     * @returns 검증된 환경변수 객체
     * @throws {Error} 필수 변수 누락 또는 검증 실패 시
     *
     * @example
     * ```typescript
     * const registry = createEnvRegistry(schema);
     * const env = registry.validate(); // 검증 + env 반환
     * console.log(env.DATABASE_URL);
     * ```
     */
    validate(): InferEnvType<T>
    {
        this.loadEnvFiles();

        // Return cached result if already validated
        if (this.hasValidated && this.validatedCache)
        {
            return this.validatedCache;
        }

        const errors: string[] = [];
        const warnings: string[] = [];

        console.log("validate 호출이다: ", this.schemas.size);

        // 1. 필수 변수 및 값 검증
        for (const [key, schema] of this.schemas)
        {
            // Get value (with fallback support)
            let value = process.env[key];

            console.log('스키마 검증: ', key);

            // Try fallback keys
            if (!value && schema.fallbackKeys)
            {
                for (const fallbackKey of schema.fallbackKeys)
                {
                    value = process.env[fallbackKey];
                    if (value)
                    {
                        break;
                    }
                }
            }

            // Check if required
            if (schema.required && !value)
            {
                const fallbackHint = schema.fallbackKeys
                    ? ` (or ${schema.fallbackKeys.join(', ')})`
                    : '';

                const errorMsg = `${key}${fallbackHint} is required but not set. ${schema.description || ''}`;
                errors.push(errorMsg);

                continue; // Skip further validation if missing
            }

            // Skip validation if no value and not required
            if (!value)
            {
                continue;
            }

            // Check minLength
            if (schema.minLength !== undefined && value.length < schema.minLength)
            {
                errors.push(
                    `${key} must be at least ${schema.minLength} characters long (current: ${value.length})`
                );
            }

            // Run validator if provided
            if (schema.validator)
            {
                try
                {
                    schema.validator(value);
                }
                catch (error)
                {
                    errors.push(
                        `${key} validation failed: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            }
        }

        // 2. 클라이언트 변수 중 민감정보 경고
        for (const [key, schema] of this.schemas)
        {
            if (isClientAccessible(key) && schema.sensitive)
            {
                warnings.push(
                    `${key} is marked as sensitive but accessible from client (NEXT_PUBLIC_*). Remove NEXT_PUBLIC_ prefix or unmark as sensitive.`
                );
            }
        }

        // Throw if errors
        if (errors.length > 0)
        {
            console.log('에러에 다 들어있겠지: ', errors);
            throw new Error(
                `Environment validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`
            );
        }

        // Log warnings
        if (warnings.length > 0)
        {
            console.warn('Environment validation warnings:');
            warnings.forEach(w => console.warn(`  - ${w}`));
        }

        // Get and cache validated environment variables
        const result = this.getAll();
        this.validatedCache = result;
        this.hasValidated = true;

        return result;
    }

    private loadEnvFiles()
    {
        const cwd = process.cwd();
        const nodeEnv = process.env.NODE_ENV || 'development';

        // Build list of .env files to load (in priority order)
        const envFiles: string[] = [
            `.env.${nodeEnv}.local`,
            nodeEnv !== 'test' ? '.env.local' : null,
            `.env.${nodeEnv}`,
            '.env',
        ].filter((file): file is string => file !== null);

        // Load each file if it exists
        // dotenv won't override existing vars, so loading high-priority files first works
        for (const file of envFiles)
        {
            const filePath = resolve(cwd, file);
            if (existsSync(filePath))
            {
                config({ path: filePath });
            }
        }
    }
}

/**
 * 레지스트리 생성 헬퍼
 *
 * @example
 * ```typescript
 * const schema = defineEnvSchema({
 *   DATABASE_URL: envString({ description: 'Database URL', required: true })
 * });
 *
 * const registry = createEnvRegistry(schema);
 * const env = registry.validate();
 * ```
 */
export function createEnvRegistry<T extends EnvSchemaCollection>(
    schemas: T
): EnvRegistry<T>
{
    return new EnvRegistry(schemas);
}