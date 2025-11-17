/**
 * CMS Environment Variable Configuration
 *
 * Schema-based environment variable management for @spfn/cms
 * Provides type-safety, validation, and auto-documentation for CMS configuration.
 *
 * @see packages/core/src/env/README.md for full documentation
 */

import {
    defineEnvSchema,
    createEnvRegistry,
    envString,
    envBoolean,
} from '@spfn/core/env';

/**
 * CMS Environment Variable Schema
 *
 * Defines all CMS environment variables with metadata and validation.
 */
export const cmsEnvSchema = defineEnvSchema({
    // ==========================================
    // Locale Configuration
    // ==========================================
    SPFN_CMS_DEFAULT_LOCALE: {
        ...envString({
            description: 'Default language for CMS content',
            default: 'en',
            category: 'cms',
            examples: ['en', 'ko', 'ja', 'zh'],
        }),
        key: 'SPFN_CMS_DEFAULT_LOCALE',
    },

    SPFN_CMS_LOCALES: {
        ...envString({
            description: 'Comma-separated list of supported languages',
            default: 'en,ko',
            category: 'cms',
            examples: [
                'en,ko',
                'en,ko,ja',
                'en,ko,ja,zh,es,fr',
            ],
        }),
        key: 'SPFN_CMS_LOCALES',
    },

    SPFN_CMS_DETECT_BROWSER_LANGUAGE: {
        ...envBoolean({
            description: 'Automatically detect and use browser language',
            default: true,
            category: 'cms',
        }),
        key: 'SPFN_CMS_DETECT_BROWSER_LANGUAGE',
    },

    SPFN_CMS_LABELS_DIR: {
        ...envString({
            description: 'Directory path for JSON label files (relative to project root)',
            default: 'src/lib/labels',
            category: 'cms',
            examples: [
                'src/lib/labels',
                'src/content/labels',
                'labels',
            ],
        }),
        key: 'SPFN_CMS_LABELS_DIR',
    },

    // ==========================================
    // Backward Compatibility (Deprecated)
    // ==========================================
    SPFN_CMS_SUPPORTED_LOCALES: {
        ...envString({
            description: '[DEPRECATED] Use SPFN_CMS_LOCALES instead. Comma-separated list of supported languages',
            required: false,
            category: 'cms',
        }),
        key: 'SPFN_CMS_SUPPORTED_LOCALES',
    },
});

/**
 * Type-safe CMS Environment Registry
 *
 * Use this registry to access CMS environment variables.
 *
 * @example
 * ```typescript
 * import { cmsEnv } from '@spfn/cms/server/config/env.config';
 *
 * const defaultLocale = cmsEnv.get('SPFN_CMS_DEFAULT_LOCALE');
 * const locales = cmsEnv.get('SPFN_CMS_LOCALES');
 * ```
 */
export const cmsEnv = createEnvRegistry(cmsEnvSchema);

/**
 * Validate CMS Environment Variables
 *
 * Validates configuration on module load (skipped in test environment).
 */
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test')
{
    const validation = cmsEnv.validate();

    // Critical errors
    if (!validation.valid)
    {
        console.error('\n❌ CMS Environment Validation Failed\n');
        console.error('The following CMS environment variables are missing or invalid:\n');

        validation.errors.forEach((error) =>
        {
            console.error(`  • ${error.key}`);
            console.error(`    ${error.message}`);

            if ('suggestion' in error && error.suggestion)
            {
                console.error(`    💡 ${error.suggestion}`);
            }

            console.error('');
        });

        console.error('Please check your .env files and ensure all required variables are set.');
        console.error('See packages/cms/.env.example for reference.\n');

        process.exit(1);
    }

    // Non-critical warnings
    if (validation.warnings.length > 0)
    {
        console.warn('\n⚠️  CMS Environment Warnings:\n');

        validation.warnings.forEach((warning) =>
        {
            console.warn(`  • ${warning.key}: ${warning.message}`);

            if ('suggestion' in warning && warning.suggestion)
            {
                console.warn(`    💡 ${warning.suggestion}`);
            }
        });

        console.warn('');
    }
}

export default cmsEnv;