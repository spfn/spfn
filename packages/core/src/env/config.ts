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
     * Namespace for environment file separation
     *
     * Can be used for:
     * - Package-specific config (monorepo): 'spfn-core', 'my-package'
     * - Feature/module-specific: 'auth', 'payment', 'email'
     * - Service-specific: 'api', 'worker', 'admin'
     * - Region-specific: 'us-east', 'eu-west'
     *
     * When specified, loads additional namespaced files after global files:
     * - .env.{namespace}
     * - .env.{namespace}.{NODE_ENV}
     * - .env.{namespace}.local
     * - .env.{namespace}.{NODE_ENV}.local
     *
     * @example
     * ```typescript
     * // Feature module
     * loadEnvironment({ namespace: 'auth' });
     * // Loads: .env, .env.dev, .env.auth, .env.auth.dev, etc.
     *
     * // Microservice
     * loadEnvironment({ namespace: 'api' });
     *
     * // Monorepo package
     * loadEnvironment({ namespace: 'spfn-core' });
     * ```
     */
    namespace?: string;

    /**
     * Use folder-based structure instead of flat naming
     * @default false
     *
     * When true with namespace 'auth':
     *   .env/global/.env
     *   .env/auth/.env
     *   .env/auth/.env.{NODE_ENV}
     *
     * When false with namespace 'auth':
     *   .env
     *   .env.auth
     *   .env.auth.{NODE_ENV}
     */
    useFolderStructure?: boolean;

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
    warnings: string[];
}

/**
 * Options for getting environment variables
 */
export interface GetEnvOptions<T = string>
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
    default?: T;

    /**
     * Custom validation and transformation function
     *
     * Should return the transformed value on success.
     * Should throw an error with a descriptive message on failure.
     *
     * @example
     * ```typescript
     * // Parse and validate integer
     * validator: (val) => {
     *   const parsed = parseInt(val, 10);
     *   if (Number.isNaN(parsed)) {
     *     throw new Error('Must be a valid integer');
     *   }
     *   return parsed;
     * }
     * ```
     */
    validator?: (value: string) => T;

    /**
     * Custom error message for validation failures
     * Only used with boolean-returning validators (deprecated)
     * @deprecated Use parser functions that throw their own descriptive errors
     */
    validationError?: string;
}

/**
 * Standard environment file names in priority order
 *
 * Next.js-style loading behavior:
 * - development: .env → .env.development → .env.local → .env.development.local
 * - production:  .env → .env.production → .env.local → .env.production.local
 * - test:        .env → .env.test → (skip .env.local) → .env.test.local
 *
 * Note: .env.local is excluded in test environment for proper test isolation
 */
export const ENV_FILE_PRIORITY = [
    '.env',                     // Base configuration (lowest priority)
    '.env.{NODE_ENV}',         // Environment-specific
    '.env.local',              // Local overrides (excluded in test)
    '.env.{NODE_ENV}.local',   // Local environment-specific (highest priority)
] as const;

/**
 * Environment files that should only be loaded in test environment
 */
export const TEST_ONLY_FILES = [
    '.env.test',
    '.env.test.local',
] as const;
