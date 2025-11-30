/**
 * Environment Variable Configuration
 *
 * This file defines all environment variables with type-safety, validation, and documentation.
 * The schema-based approach provides:
 * - Type-safe environment variable access
 * - Automatic validation on app startup
 * - Auto-generated documentation
 * - Centralized configuration
 *
 * @see https://spfn.dev/docs/guides/environment for full documentation
 */

import {
    defineEnvSchema,
    createEnvRegistry,
    envString,
    envNumber,
    envBoolean,
    envUrl,
    parsePostgresUrl,
    createNumberParser,
} from '@spfn/core/env';

/**
 * Environment Variable Schema
 *
 * Define all your environment variables here with metadata and validation.
 * This schema is used for:
 * - Runtime validation
 * - Type-safe access
 * - Auto-generated .env.example
 * - Documentation generation
 */
export const envSchema = defineEnvSchema({
});

/**
 * Type-safe Environment Registry
 *
 * Use this registry to access environment variables throughout your application.
 * It provides type-safe access and automatic validation.
 *
 * @example
 * ```typescript
 * import env from '@/server/config/env.config';
 *
 * // Get required variable (throws if missing)
 * const dbUrl = env.require('DATABASE_URL');
 *
 * // Get optional variable (returns undefined if missing)
 * const redisUrl = env.get('REDIS_URL');
 *
 * // Get with default value
 * const port = env.get('PORT') ?? 8790;
 * ```
 */
export const env = createEnvRegistry(envSchema);

/**
 * Validate Environment Variables
 *
 * This validation runs automatically when this module is imported.
 * It will fail fast on startup if any required variables are missing
 * or if there are configuration errors.
 */
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test')
{
    const validation = env.validate();

    // Critical errors (missing required variables)
    if (!validation.valid)
    {
        console.error('\n❌ Environment Validation Failed\n');
        console.error('The following required environment variables are missing or invalid:\n');

        validation.errors.forEach((error) =>
        {
            console.error(`  • ${error.key}`);
            console.error(`    ${error.message}`);

            if (error.suggestion)
            {
                console.error(`    💡 ${error.suggestion}`);
            }

            console.error('');
        });

        console.error('Please check your .env files and ensure all required variables are set.');
        console.error('See .env.example for reference.\n');

        process.exit(1);
    }

    // Non-critical warnings
    if (validation.warnings.length > 0)
    {
        console.warn('\n⚠️  Environment Warnings:\n');

        validation.warnings.forEach((warning) =>
        {
            console.warn(`  • ${warning.key}: ${warning.message}`);

            if (warning.suggestion)
            {
                console.warn(`    💡 ${warning.suggestion}`);
            }
        });

        console.warn('');
    }
}

/**
 * Export the registry as default
 *
 * Import this in your application to access environment variables:
 * ```typescript
 * import env from '@/server/config/env.config';
 * ```
 */
export default env;