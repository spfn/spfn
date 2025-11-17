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
    // ==========================================
    // Database
    // ==========================================
    DATABASE_URL: {
        ...envUrl({
            description: 'PostgreSQL database connection string',
            required: true,
            validator: parsePostgresUrl,
            category: 'database',
            sensitive: true,
            examples: [
                'postgresql://user:password@localhost:5432/mydb',
                'postgresql://user:password@db.example.com:5432/production',
            ],
        }),
        key: 'DATABASE_URL',
    },

    // ==========================================
    // Cache (Optional)
    // ==========================================
    REDIS_URL: {
        ...envUrl({
            description: 'Redis connection string for caching and sessions',
            required: false,
            category: 'cache',
            examples: [
                'redis://localhost:6379',
                'redis://:password@redis.example.com:6379',
            ],
        }),
        key: 'REDIS_URL',
    },

    // ==========================================
    // API URLs
    // ==========================================
    SERVER_API_URL: {
        ...envUrl({
            description: 'Internal API URL for server-side requests (SSR, API Routes)',
            default: 'http://localhost:8790',
            category: 'api',
            examples: [
                'http://localhost:8790',
                'http://api-server:8790',
            ],
        }),
        key: 'SERVER_API_URL',
    },

    NEXT_PUBLIC_API_URL: {
        ...envUrl({
            description: 'Public API URL for client-side requests (browser)',
            default: 'http://localhost:8790',
            category: 'api',
            examples: [
                'http://localhost:8790',
                'https://api.example.com',
            ],
        }),
        key: 'NEXT_PUBLIC_API_URL',
    },

    // ==========================================
    // Server Configuration
    // ==========================================
    PORT: {
        ...envNumber({
            description: 'SPFN API server port',
            default: 8790,
            validator: createNumberParser({ min: 1, max: 65535, integer: true }),
            category: 'server',
        }),
        key: 'PORT',
    },

    HOST: {
        ...envString({
            description: 'Server host address',
            default: '0.0.0.0',
            category: 'server',
        }),
        key: 'HOST',
    },

    NODE_ENV: {
        ...envString({
            description: 'Node.js environment mode',
            default: 'development',
            category: 'server',
            examples: ['development', 'production', 'test'],
        }),
        key: 'NODE_ENV',
    },

    // ==========================================
    // Features & Debugging
    // ==========================================
    DEBUG: {
        ...envBoolean({
            description: 'Enable debug logging (verbose output)',
            default: false,
            category: 'features',
        }),
        key: 'DEBUG',
    },

    LOG_LEVEL: {
        ...envString({
            description: 'Logging level for application logs',
            default: 'info',
            category: 'features',
            examples: ['debug', 'info', 'warn', 'error'],
        }),
        key: 'LOG_LEVEL',
    },

    // ==========================================
    // Add your custom environment variables below
    // ==========================================

    // Example: External API
    // API_KEY: {
    //     ...envString({
    //         description: 'External API key for third-party service',
    //         required: true,
    //         sensitive: true,
    //         category: 'external',
    //     }),
    //     key: 'API_KEY',
    // },

    // Example: Feature flags
    // FEATURE_PAYMENTS: {
    //     ...envBoolean({
    //         description: 'Enable payment feature',
    //         default: false,
    //         category: 'features',
    //     }),
    //     key: 'FEATURE_PAYMENTS',
    // },
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