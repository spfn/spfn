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
import type { EnvVarSchema, EnvSchemaCollection, InferEnvType } from './schema';
import { isClientAccessible } from './schema';
import { logger } from '@spfn/core/logger';

const envLogger = logger.child('@spfn/core:env-registry')


/**
 * 환경변수 레지스트리
 *
 * 스키마 기반 환경변수 관리 및 검증
 */
export class EnvRegistry<T extends EnvSchemaCollection = EnvSchemaCollection>
{
    private schemas = new Map<string, EnvVarSchema>();
    private hasValidated = false;
    private valueCache = new Map<string, any>();

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
     * 스키마 검증 수행 (값 읽기 없이)
     *
     * @internal
     */
    private validateSchemas(): void
    {
        // Skip if already validated
        if (this.hasValidated)
        {
            return;
        }

        const warnings: string[] = [];

        // 클라이언트 변수 중 민감정보 경고
        for (const [key, schema] of this.schemas)
        {
            if (isClientAccessible(key) && schema.sensitive)
            {
                warnings.push(
                    `${key} is marked as sensitive but accessible from client (NEXT_PUBLIC_*). Remove NEXT_PUBLIC_ prefix or unmark as sensitive.`
                );
            }
        }

        // Log warnings
        if (warnings.length > 0)
        {
            envLogger.warn('Environment validation warnings:');
            warnings.forEach(w => envLogger.warn(`  - ${w}`));
        }

        this.hasValidated = true;
    }

    /**
     * 실제 접근 시점에 환경변수 값 가져오기 및 검증
     *
     * @internal
     */
    private getAndValidate(key: string): any
    {
        // Check cache first
        if (this.valueCache.has(key))
        {
            return this.valueCache.get(key);
        }

        const schema = this.schemas.get(key);
        if (!schema)
        {
            return undefined;
        }

        // Get value (with fallback support)
        let value = process.env[key];

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
            envLogger.error(`Environment validation failed:\n  - ${errorMsg}`);
            throw new Error('Environment validation failed');
        }

        // If no value and not required, use default
        if (!value)
        {
            const result = schema.default;
            this.valueCache.set(key, result);
            return result;
        }

        // Check minLength
        if (schema.minLength !== undefined && value.length < schema.minLength)
        {
            const errorMsg = `${key} must be at least ${schema.minLength} characters long (current: ${value.length})`;
            envLogger.error(`Environment validation failed:\n  - ${errorMsg}`);
            throw new Error('Environment validation failed');
        }

        // Run validator and get typed value
        try
        {
            const result = this.getBySchema(schema);
            this.valueCache.set(key, result);
            return result;
        }
        catch (error)
        {
            const errorMsg = `${key} validation failed: ${error instanceof Error ? error.message : String(error)}`;
            envLogger.error(`Environment validation failed:\n  - ${errorMsg}`);
            throw new Error('Environment validation failed');
        }
    }

    /**
     * 환경변수 검증 및 타입 안전한 env 객체 반환
     *
     * Proxy 기반으로 구현되어 실제 환경변수 접근 시점에 값을 읽고 검증합니다.
     * 이를 통해 dotenv 로딩 타이밍과 무관하게 최신 환경변수 값을 가져올 수 있습니다.
     *
     * @returns 검증된 환경변수 객체 (Proxy)
     * @throws {Error} 필수 변수 누락 또는 검증 실패 시
     *
     * @example
     * ```typescript
     * const registry = createEnvRegistry(schema);
     * const env = registry.validate(); // 스키마만 검증
     * // ... dotenv 로딩 ...
     * console.log(env.DATABASE_URL); // 이 시점에 실제 값 읽기
     * ```
     */
    validate(): InferEnvType<T>
    {
        // Perform schema-level validation (without reading values)
        this.validateSchemas();

        // Return Proxy that lazily reads and validates on access
        return new Proxy({} as InferEnvType<T>, {
            get: (_target, prop: string) =>
            {
                return this.getAndValidate(prop);
            },

            ownKeys: () =>
            {
                return Array.from(this.schemas.keys());
            },

            getOwnPropertyDescriptor: (_target, prop: string) =>
            {
                if (this.schemas.has(prop))
                {
                    return {
                        enumerable: true,
                        configurable: true,
                        get: () => this.getAndValidate(prop)
                    };
                }

                return undefined;
            },

            has: (_target, prop: string) =>
            {
                return this.schemas.has(prop);
            }
        });
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