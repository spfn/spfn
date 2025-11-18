/**
 * CMS Package Configuration
 *
 * Centralized environment variable management for @spfn/cms.
 * Provides type-safe access to all environment variables with validation and defaults.
 *
 * @example
 * ```typescript
 * import { env, getCmsConfig } from '@spfn/cms/config';
 *
 * // Use global env object (lazy-loaded)
 * console.log(env.SPFN_CMS_DEFAULT_LOCALE);
 *
 * // Or get CMS configuration
 * const config = getCmsConfig();
 * console.log(config.defaultLocale);
 * ```
 *
 * @module config
 */

import { getEnvVar, parseBoolean } from '@spfn/core/env';
import { type CmsEnvKey, cmsEnvSchema } from './schema';
import type { CmsEnvConfig } from './types';
import type { CmsConfig } from '@/lib/types/config';
import { logger } from '@spfn/core/logger';

const configLogger = logger.child('@spfn/cms:config');

// ============================================================================
// Environment Variable Access
// ============================================================================

/**
 * Get CMS environment configuration based on schema
 *
 * Reads environment variables and applies defaults/validation from schema.
 *
 * @returns Type-safe CMS environment configuration object
 *
 * @example
 * ```typescript
 * const config = getEnvConfig();
 *
 * // Fully typed access
 * const locale: string = config.SPFN_CMS_DEFAULT_LOCALE;
 * const detectBrowser: boolean = config.SPFN_CMS_DETECT_BROWSER_LANGUAGE;
 * ```
 */
export function getEnvConfig(): CmsEnvConfig
{
    const config: Record<string, any> = {};

    // Iterate through schema and get each environment variable
    for (const key of Object.keys(cmsEnvSchema) as CmsEnvKey[])
    {
        const schema = cmsEnvSchema[key];

        // Determine validator based on type if not explicitly provided
        let validator = schema.validator;

        if (!validator)
        {
            if (schema.type === 'boolean')
            {
                validator = parseBoolean;
            }
        }

        // Get environment variable with schema's default and validator
        config[key] = getEnvVar(key, {
            default: schema.default,
            validator,
        });
    }

    return config as CmsEnvConfig;
}

/**
 * Global CMS environment configuration singleton
 *
 * Lazy-loaded on first access. Use this for convenient access throughout your application.
 *
 * @example
 * ```typescript
 * import { env } from '@spfn/cms/config';
 *
 * // Access anywhere in your code
 * if (env.SPFN_CMS_DETECT_BROWSER_LANGUAGE) {
 *   // Detect browser language
 * }
 * ```
 */
let _envConfig: CmsEnvConfig | null = null;

export const env = new Proxy({} as CmsEnvConfig, {
    get(_target, prop: string)
    {
        if (!_envConfig)
        {
            _envConfig = getEnvConfig();
        }

        return _envConfig[prop as keyof CmsEnvConfig];
    },
});

/**
 * Reset the global environment configuration cache
 *
 * Useful for testing when you need to reload environment variables.
 *
 * @example
 * ```typescript
 * import { resetEnvConfig, env } from '@spfn/cms/config';
 *
 * // In tests
 * beforeEach(() => {
 *   process.env.SPFN_CMS_DEFAULT_LOCALE = 'ko';
 *   resetEnvConfig(); // Force reload
 * });
 * ```
 */
export function resetEnvConfig(): void
{
    _envConfig = null;
    _cmsConfig = null;
}

/**
 * Validate CMS environment configuration
 *
 * Checks if all required environment variables are set.
 * Logs errors and warnings, then exits process if validation fails.
 *
 * @example
 * ```typescript
 * import { validateEnvConfig } from '@spfn/cms/config';
 *
 * // Call at application startup
 * validateEnvConfig();
 * ```
 */
export function validateEnvConfig(): void
{
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const key of Object.keys(cmsEnvSchema) as CmsEnvKey[])
    {
        const schema = cmsEnvSchema[key];

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

    // Check for deprecated variables
    if (process.env.SPFN_CMS_SUPPORTED_LOCALES)
    {
        warnings.push(
            'SPFN_CMS_SUPPORTED_LOCALES is deprecated. Use SPFN_CMS_LOCALES instead.'
        );
    }

    // Log errors
    if (errors.length > 0)
    {
        configLogger.error('\n❌ CMS Environment Validation Failed\n');
        configLogger.error('The following CMS environment variables are missing or invalid:\n');

        errors.forEach((error) =>
        {
            configLogger.error(`  • ${error}`);
        });

        configLogger.error('\nPlease check your .env files and ensure all required variables are set.');
        configLogger.error('See packages/cms/.env.example for reference.\n');

        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test')
        {
            process.exit(1);
        }
    }

    // Log warnings
    if (warnings.length > 0)
    {
        configLogger.warn('\n⚠️  CMS Environment Warnings:\n');

        warnings.forEach((warning) =>
        {
            configLogger.warn(`  • ${warning}`);
        });

        configLogger.warn('');
    }
}

/**
 * Get environment variable schema by category
 *
 * @param category - Category name (e.g., 'cms')
 * @returns Array of schema entries for the category
 *
 * @example
 * ```typescript
 * import { getSchemaByCategory } from '@spfn/cms/config';
 *
 * const cmsVars = getSchemaByCategory('cms');
 * console.log(cmsVars.map(v => v.key));
 * ```
 */
export function getSchemaByCategory(category: string)
{
    return Object.entries(cmsEnvSchema)
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
 * import { getCategories } from '@spfn/cms/config';
 *
 * const categories = getCategories();
 * console.log(categories); // ['cms']
 * ```
 */
export function getCategories(): string[]
{
    const categories = new Set<string>();

    for (const key of Object.keys(cmsEnvSchema) as CmsEnvKey[])
    {
        const schema = cmsEnvSchema[key];
        if (schema.category)
        {
            categories.add(schema.category);
        }
    }

    return Array.from(categories).sort();
}

// ============================================================================
// CMS Configuration (High-level API)
// ============================================================================

/**
 * Load CMS configuration from environment variables
 */
function loadCmsConfigFromEnv(): CmsConfig
{
    const defaultLocale = env.SPFN_CMS_DEFAULT_LOCALE ?? 'en';

    // Backward compatibility: SPFN_CMS_SUPPORTED_LOCALES → SPFN_CMS_LOCALES
    // Use process.env directly to check if SPFN_CMS_LOCALES is explicitly set
    const localesStr = process.env.SPFN_CMS_LOCALES
        ?? process.env.SPFN_CMS_SUPPORTED_LOCALES
        ?? 'en,ko';

    const detectBrowserLanguage = env.SPFN_CMS_DETECT_BROWSER_LANGUAGE ?? true;

    const locales = localesStr
        .split(',')
        .map(locale => locale.trim())
        .filter(locale => locale.length > 0);

    // Add default locale to supported locales if not present
    if (!locales.includes(defaultLocale))
    {
        locales.unshift(defaultLocale);
    }

    return {
        defaultLocale,
        locales,
        detectBrowserLanguage,
    };
}

/**
 * Current CMS configuration cache
 */
let _cmsConfig: CmsConfig | null = null;

/**
 * Get CMS configuration
 *
 * Returns a high-level CMS configuration object with parsed locale settings.
 *
 * @returns Current CMS configuration
 *
 * @example
 * ```typescript
 * import { getCmsConfig } from '@spfn/cms/config';
 *
 * const config = getCmsConfig();
 * console.log(config.defaultLocale); // 'en'
 * console.log(config.locales); // ['en', 'ko']
 * console.log(config.detectBrowserLanguage); // true
 * ```
 */
export function getCmsConfig(): Readonly<CmsConfig>
{
    if (!_cmsConfig)
    {
        _cmsConfig = loadCmsConfigFromEnv();
    }

    return _cmsConfig;
}

/**
 * Configure CMS (runtime override)
 *
 * Override environment variable settings at runtime.
 * Mainly used for testing or special cases.
 *
 * @param config - Configuration to apply (partial update possible)
 *
 * @example
 * ```typescript
 * import { configureCms } from '@spfn/cms/config';
 *
 * // During app initialization (optional)
 * configureCms({
 *     defaultLocale: 'en',
 *     locales: ['en', 'ko', 'ja'],
 *     detectBrowserLanguage: true,
 * });
 * ```
 */
export function configureCms(config: Partial<CmsConfig>): void
{
    const currentConfig = getCmsConfig();

    _cmsConfig = {
        ...currentConfig,
        ...config,
    };

    // Ensure default locale is in locales list
    if (config.defaultLocale && !_cmsConfig.locales.includes(config.defaultLocale))
    {
        configLogger.warn(
            `Default locale '${config.defaultLocale}' not in locales, adding automatically. Locales: [${_cmsConfig.locales.join(', ')}]`
        );

        _cmsConfig.locales.unshift(config.defaultLocale);
    }
}

/**
 * Reset CMS configuration (reload from environment)
 *
 * @example
 * ```typescript
 * import { resetCmsConfig } from '@spfn/cms/config';
 *
 * // Reset to environment variable settings
 * resetCmsConfig();
 * ```
 */
export function resetCmsConfig(): void
{
    _cmsConfig = null;
}

// ============================================================================
// Re-exports
// ============================================================================

// Re-export schema and types
export { cmsEnvSchema, cmsEnvKeys, type CmsEnvKey } from './schema';
export type { CmsEnvConfig } from './types';
export type { CmsConfig } from '@/lib/types/config';

// Validate on module load (skip in test environment)
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test')
{
    validateEnvConfig();
}