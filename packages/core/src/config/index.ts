/**
 * Core Package Configuration
 *
 * Centralized environment variable management for @spfn/core.
 * Provides type-safe access to all environment variables with validation and defaults.
 *
 * @example
 * ```typescript
 * import { env, getEnvConfig } from '@spfn/core/config';
 *
 * // Use global env object (lazy-loaded)
 * console.log(env.DB_POOL_MAX);
 *
 * // Or get fresh config
 * const config = getEnvConfig();
 * console.log(config.LOG_LEVEL);
 * ```
 *
 * @module config
 */

import { getEnvVar, parseBoolean, parseNumber } from '../env';
import { type CoreEnvKey, coreEnvSchema } from './schema';
import type { EnvConfig } from './types';

/**
 * Get environment configuration based on schema
 *
 * Reads environment variables and applies defaults/validation from schema.
 *
 * @returns Type-safe environment configuration object
 *
 * @example
 * ```typescript
 * const config = getEnvConfig();
 *
 * // Fully typed access
 * const poolMax: number = config.DB_POOL_MAX;
 * const logLevel: LogLevel = config.LOG_LEVEL;
 * ```
 */
export function getEnvConfig(): EnvConfig
{
    const config: Record<string, any> = {};

    // Check current environment for dynamic defaults
    const isDev = process.env.NODE_ENV === 'development';
    const isProd = process.env.NODE_ENV === 'production';

    // Iterate through schema and get each environment variable
    for (const key of Object.keys(coreEnvSchema) as CoreEnvKey[])
    {
        const schema = coreEnvSchema[key];

        // Determine validator based on type if not explicitly provided
        let validator = schema.validator;

        if (!validator)
        {
            if (schema.type === 'number')
            {
                validator = parseNumber;
            }
            else if (schema.type === 'boolean')
            {
                validator = parseBoolean;
            }
        }

        // Calculate dynamic default based on current NODE_ENV
        let defaultValue = schema.default;

        // Environment-specific defaults for database pool
        if (key === 'DB_POOL_MAX')
        {
            defaultValue = isProd ? 20 : 10;
        }
        else if (key === 'DB_POOL_IDLE_TIMEOUT')
        {
            defaultValue = isProd ? 30 : 20;
        }
        else if (key === 'DB_RETRY_MAX')
        {
            defaultValue = isProd ? 5 : 3;
        }
        else if (key === 'DB_RETRY_INITIAL_DELAY')
        {
            defaultValue = isProd ? 100 : 50;
        }
        else if (key === 'DB_RETRY_MAX_DELAY')
        {
            defaultValue = isProd ? 10000 : 5000;
        }
        else if (key === 'DB_MONITORING_ENABLED')
        {
            defaultValue = isDev;
        }
        else if (key === 'LOG_LEVEL')
        {
            defaultValue = isDev ? 'debug' : isProd ? 'info' : 'warn';
        }

        // Get environment variable with schema's default and validator
        config[key] = getEnvVar(key, {
            default: defaultValue,
            validator,
        });
    }

    return config as EnvConfig;
}

/**
 * Global environment configuration singleton
 *
 * Lazy-loaded on first access. Use this for convenient access throughout your application.
 *
 * @example
 * ```typescript
 * import { env } from '@spfn/core/config';
 *
 * // Access anywhere in your code
 * if (env.DB_MONITORING_ENABLED) {
 *   // Monitor queries
 * }
 * ```
 */
let _envConfig: EnvConfig | null = null;

export const env = new Proxy({} as EnvConfig, {
    get(_target, prop: string)
    {
        if (!_envConfig)
        {
            _envConfig = getEnvConfig();
        }

        return _envConfig[prop as keyof EnvConfig];
    },
});

/**
 * Reset the global environment configuration cache
 *
 * Useful for testing when you need to reload environment variables.
 *
 * @example
 * ```typescript
 * import { resetEnvConfig, env } from '@spfn/core/config';
 *
 * // In tests
 * beforeEach(() => {
 *   process.env.DB_POOL_MAX = '50';
 *   resetEnvConfig(); // Force reload
 * });
 * ```
 */
export function resetEnvConfig(): void
{
    _envConfig = null;
}

/**
 * Validate environment configuration
 *
 * Checks if all required environment variables are set.
 * Throws an error if any required variable is missing or invalid.
 *
 * @throws {Error} If any required environment variable is missing or invalid
 *
 * @example
 * ```typescript
 * import { validateEnvConfig } from '@spfn/core/config';
 *
 * // Call at application startup
 * try {
 *   validateEnvConfig();
 *   console.log('Environment configuration is valid');
 * } catch (error) {
 *   console.error('Invalid environment configuration:', error);
 *   process.exit(1);
 * }
 * ```
 */
export function validateEnvConfig(): void
{
    const errors: string[] = [];

    for (const key of Object.keys(coreEnvSchema) as CoreEnvKey[])
    {
        const schema = coreEnvSchema[key];

        // Only validate required variables
        if (!schema.required)
        {
            continue;
        }

        const value = process.env[key];

        if (value === undefined || value === '')
        {
            errors.push(
                `${key} is required but not set. ${schema.description}`
            );
        }

        // Run validator if provided
        if (value && schema.validator)
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

    if (errors.length > 0)
    {
        throw new Error(
            `Environment configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`
        );
    }
}

/**
 * Get environment variable schema by category
 *
 * @param category - Category name (e.g., 'database', 'logger')
 * @returns Array of schema entries for the category
 *
 * @example
 * ```typescript
 * import { getSchemaByCategory } from '@spfn/core/config';
 *
 * const dbVars = getSchemaByCategory('database');
 * console.log(dbVars.map(v => v.key)); // ['DB_POOL_MAX', 'DB_POOL_IDLE_TIMEOUT', ...]
 * ```
 */
export function getSchemaByCategory(category: string)
{
    return Object.entries(coreEnvSchema)
        .filter(([_, schema]) => schema.category === category)
        .map(([key, schema]) => ({ ...schema, key }));
}

/**
 * Get all environment variable categories
 *
 * @returns Array of unique category names
 *
 * @example
 * ```typescript
 * import { getCategories } from '@spfn/core/config';
 *
 * const categories = getCategories();
 * console.log(categories); // ['core', 'database', 'logger', 'nextjs']
 * ```
 */
export function getCategories(): string[]
{
    const categories = new Set<string>();

    for (const key of Object.keys(coreEnvSchema) as CoreEnvKey[])
    {
        const schema = coreEnvSchema[key];
        if (schema.category)
        {
            categories.add(schema.category);
        }
    }

    return Array.from(categories).sort();
}

// Re-export schema and types
export { coreEnvSchema, coreEnvKeys, type CoreEnvKey } from './schema';
export type {
    EnvConfig,
    CoreEnvConfig,
    DatabaseEnvConfig,
    LoggerEnvConfig,
    NextjsEnvConfig,
    NodeEnv,
    LogLevel,
} from './types';