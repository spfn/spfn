/**
 * CMS Environment Variable Configuration Types
 *
 * Type definitions for CMS environment variables
 */

/**
 * CMS environment variables configuration
 */
export interface CmsEnvConfig
{
    /** Default language for CMS content */
    SPFN_CMS_DEFAULT_LOCALE: string;

    /** Comma-separated list of supported languages */
    SPFN_CMS_LOCALES: string;

    /** Automatically detect and use browser language */
    SPFN_CMS_DETECT_BROWSER_LANGUAGE: boolean;

    /** Directory path for JSON label files (relative to project root) */
    SPFN_CMS_LABELS_DIR: string;

    /** [DEPRECATED] Use SPFN_CMS_LOCALES instead */
    SPFN_CMS_SUPPORTED_LOCALES?: string;
}