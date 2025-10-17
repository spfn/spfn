/**
 * Environment Variable Management - Configuration Types
 *
 * Type definitions for centralized environment variable loading
 */

/**
 * Options for loading environment variables
 */
export interface LoadEnvironmentOptions
{
    /**
     * Base directory for .env files
     * @default process.cwd()
     */
    basePath?: string;

    /**
     * Additional custom paths to load
     * Loaded after standard files
     * @default []
     */
    customPaths?: string[];

    /**
     * Enable debug logging
     * @default false
     */
    debug?: boolean;

    /**
     * Override NODE_ENV for file selection
     * @default process.env.NODE_ENV
     */
    nodeEnv?: string;

    /**
     * Required environment variables
     * Throws error if any are missing after loading
     * @default []
     */
    required?: string[];

    /**
     * Skip loading if environment already loaded
     * Set to false to force reload (useful for testing)
     * @default true
     */
    useCache?: boolean;
}

/**
 * Result of environment loading operation
 */
export interface LoadResult
{
    /**
     * Whether loading was successful overall
     */
    success: boolean;

    /**
     * Files that were successfully loaded
     */
    loaded: string[];

    /**
     * Files that failed to load (with reasons)
     */
    failed: Array<{ path: string; reason: string }>;

    /**
     * Environment variables that were parsed from files
     */
    parsed: Record<string, string>;

    /**
     * Error messages if any critical errors occurred
     */
    errors?: string[];

    /**
     * Warning messages for non-critical issues
     */
    warnings?: string[];
}

/**
 * Options for getting environment variables
 */
export interface GetEnvOptions
{
    /**
     * Throw error if variable not found
     * @default false
     */
    required?: boolean;

    /**
     * Default value if variable not found
     * Only used if required is false
     */
    default?: string;

    /**
     * Custom validation function
     * Return true if valid, false if invalid
     */
    validator?: (value: string) => boolean;

    /**
     * Custom error message for validation failure
     */
    validationError?: string;
}

/**
 * Standard environment file names in priority order
 */
export const ENV_FILE_PRIORITY = [
    '.env',                     // Base configuration (lowest priority)
    '.env.{NODE_ENV}',         // Environment-specific
    '.env.local',              // Local overrides
    '.env.{NODE_ENV}.local',   // Local environment-specific (highest priority)
] as const;

/**
 * Environment files that should never be loaded in production
 */
export const TEST_ONLY_FILES = [
    '.env.test',
    '.env.test.local',
] as const;
