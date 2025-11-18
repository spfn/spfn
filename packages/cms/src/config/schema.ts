/**
 * CMS Environment Variable Schema
 *
 * Centralized schema definition for all environment variables used in @spfn/cms.
 * This provides type safety, validation, and documentation for CMS configuration.
 *
 * @module config/schema
 */

import {
    defineEnvSchema,
    envString,
    envBoolean,
} from '@spfn/core/env';

/**
 * CMS environment variable schema
 *
 * Defines all CMS environment variables with:
 * - Type information
 * - Default values
 * - Validation rules
 * - Documentation
 *
 * @example
 * ```typescript
 * import { cmsEnvSchema } from '@spfn/cms/config';
 *
 * // Access schema information
 * console.log(cmsEnvSchema.SPFN_CMS_DEFAULT_LOCALE.description);
 * console.log(cmsEnvSchema.SPFN_CMS_DEFAULT_LOCALE.default);
 * ```
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
 * Type-safe CMS environment variable keys
 */
export type CmsEnvKey = keyof typeof cmsEnvSchema;

/**
 * Get all CMS environment variable keys
 */
export const cmsEnvKeys = Object.keys(cmsEnvSchema) as CmsEnvKey[];