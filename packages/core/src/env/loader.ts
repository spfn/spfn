/**
 * Environment Variable Management - Core Loader
 *
 * Centralized singleton environment variable loader with dotenv priority support
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger';
import type { GetEnvOptions, LoadEnvironmentOptions, LoadResult, } from './config';
import { ENV_FILE_PRIORITY, TEST_ONLY_FILES } from './config';

const envLogger = logger.child('@spfn/core:environment');

/**
 * Singleton state
 */
let environmentLoaded = false;
let cachedLoadResult: LoadResult | undefined;

/**
 * Build list of environment files to load based on NODE_ENV and namespace
 *
 * Next.js-style behavior:
 * - .env.local is excluded in test environment for test isolation
 * - Test files (.env.test*) are excluded in non-test environments
 * - If NODE_ENV is not set, .env and .env.local are loaded
 *
 * With namespace:
 * - Loads global files first, then namespaced files
 * - Namespaced files override global files
 *
 * @param basePath - Base directory for .env files
 * @param nodeEnv - Current NODE_ENV value (empty string if not set)
 * @param namespace - Optional namespace for file separation
 * @param useFolderStructure - Use folder-based structure instead of flat naming
 * @returns Array of absolute file paths to load in priority order
 */
function buildFileList(
    basePath: string,
    nodeEnv: string,
    namespace?: string,
    useFolderStructure = false
): string[]
{
    const files: string[] = [];

    // Build global files list
    const globalFiles = buildGlobalFileList(basePath, nodeEnv, useFolderStructure);
    files.push(...globalFiles);

    // Build namespaced files list if namespace is provided
    if (namespace)
    {
        const namespacedFiles = buildNamespacedFileList(
            basePath,
            nodeEnv,
            namespace,
            useFolderStructure
        );
        files.push(...namespacedFiles);
    }

    return files;
}

/**
 * Build list of global environment files
 */
function buildGlobalFileList(
    basePath: string,
    nodeEnv: string,
    useFolderStructure: boolean
): string[]
{
    const files: string[] = [];
    const baseDir = useFolderStructure ? join(basePath, '.env', 'global') : basePath;

    // If NODE_ENV is not set, load .env and .env.local (Next.js style)
    if (!nodeEnv)
    {
        files.push(join(baseDir, '.env'));
        files.push(join(baseDir, '.env.local'));
        return files;
    }

    for (const pattern of ENV_FILE_PRIORITY)
    {
        const fileName = pattern.replace('{NODE_ENV}', nodeEnv);

        // Skip .env.local in test environment (Next.js-style)
        if (nodeEnv === 'test' && fileName === '.env.local')
        {
            continue;
        }

        // Skip duplicate .env.local when NODE_ENV=local
        if (nodeEnv === 'local' && pattern === '.env.local')
        {
            continue;
        }

        // Skip test files in non-test environments
        if (nodeEnv !== 'test' && TEST_ONLY_FILES.includes(fileName as any))
        {
            continue;
        }

        files.push(join(baseDir, fileName));
    }

    return files;
}

/**
 * Build list of namespaced environment files
 */
function buildNamespacedFileList(
    basePath: string,
    nodeEnv: string,
    namespace: string,
    useFolderStructure: boolean
): string[]
{
    const files: string[] = [];

    if (useFolderStructure)
    {
        // Folder structure: .env/{namespace}/.env, .env/{namespace}/.env.{NODE_ENV}
        const namespacedDir = join(basePath, '.env', namespace);

        if (!nodeEnv)
        {
            files.push(join(namespacedDir, '.env'));
            files.push(join(namespacedDir, '.env.local'));
            return files;
        }

        for (const pattern of ENV_FILE_PRIORITY)
        {
            const fileName = pattern.replace('{NODE_ENV}', nodeEnv);

            if (nodeEnv === 'test' && fileName === '.env.local')
            {
                continue;
            }

            if (nodeEnv === 'local' && pattern === '.env.local')
            {
                continue;
            }

            if (nodeEnv !== 'test' && TEST_ONLY_FILES.includes(fileName as any))
            {
                continue;
            }

            files.push(join(namespacedDir, fileName));
        }
    }
    else
    {
        // Flat structure: .env.{namespace}, .env.{namespace}.{NODE_ENV}
        if (!nodeEnv)
        {
            files.push(join(basePath, `.env.${namespace}`));
            files.push(join(basePath, `.env.${namespace}.local`));
            return files;
        }

        for (const pattern of ENV_FILE_PRIORITY)
        {
            let fileName = pattern.replace('{NODE_ENV}', nodeEnv);

            // Convert to namespaced pattern
            // .env → .env.{namespace}
            // .env.{NODE_ENV} → .env.{namespace}.{NODE_ENV}
            // .env.local → .env.{namespace}.local
            // .env.{NODE_ENV}.local → .env.{namespace}.{NODE_ENV}.local
            if (fileName === '.env')
            {
                fileName = `.env.${namespace}`;
            }
            else if (fileName === '.env.local')
            {
                fileName = `.env.${namespace}.local`;
            }
            else
            {
                // .env.{NODE_ENV} or .env.{NODE_ENV}.local
                fileName = fileName.replace('.env.', `.env.${namespace}.`);
            }

            if (nodeEnv === 'test' && fileName.endsWith('.local') && !fileName.includes('.test.'))
            {
                continue;
            }

            if (nodeEnv === 'local' && pattern === '.env.local')
            {
                continue;
            }

            if (nodeEnv !== 'test' && TEST_ONLY_FILES.some((testFile) => fileName.includes(testFile)))
            {
                continue;
            }

            files.push(join(basePath, fileName));
        }
    }

    return files;
}

/**
 * Load a single environment file
 *
 * @param filePath - Absolute path to .env file
 * @param debug - Whether to log debug information
 * @returns Object with success status and parsed variables
 */
function loadSingleFile(
    filePath: string,
    debug: boolean
): { success: boolean; parsed: Record<string, string>; error?: string }
{
    if (!existsSync(filePath))
    {
        if (debug)
        {
            envLogger.debug('Environment file not found (optional)', {
                path: filePath,
            });
        }
        return { success: false, parsed: {}, error: 'File not found' };
    }

    try
    {
        const result = dotenvConfig({ path: filePath });

        if (result.error)
        {
            envLogger.warn('Failed to parse environment file', {
                path: filePath,
                error: result.error.message,
            });
            return {
                success: false,
                parsed: {},
                error: result.error.message,
            };
        }

        const parsed = result.parsed || {};

        if (debug)
        {
            envLogger.debug('Environment file loaded successfully', {
                path: filePath,
                variables: Object.keys(parsed),
                count: Object.keys(parsed).length,
            });
        }

        return { success: true, parsed };
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : 'Unknown error';
        envLogger.error('Error loading environment file', {
            path: filePath,
            error: message,
        });
        return { success: false, parsed: {}, error: message };
    }
}

/**
 * Validate required environment variables
 *
 * @param required - Array of required variable names
 * @param debug - Whether to log debug information
 * @throws Error if any required variables are missing
 */
function validateRequiredVars(required: string[], debug: boolean): void
{
    const missing: string[] = [];

    for (const varName of required)
    {
        if (!process.env[varName])
        {
            missing.push(varName);
        }
    }

    if (missing.length > 0)
    {
        const error = `Required environment variables missing: ${missing.join(', ')}`;
        envLogger.error('Environment validation failed', {
            missing,
            required,
        });
        throw new Error(error);
    }

    if (debug)
    {
        envLogger.debug('Required environment variables validated', {
            required,
            allPresent: true,
        });
    }
}

/**
 * Load environment variables from .env files with Next.js-style priority
 *
 * Loading behavior by environment:
 * - (no NODE_ENV): .env → .env.local
 * - development: .env → .env.development → .env.local → .env.development.local
 * - production:  .env → .env.production → .env.local → .env.production.local
 * - test:        .env → .env.test → (skip .env.local) → .env.test.local
 * - local:       .env → .env.local → .env.local.local (duplicate .env.local prevented)
 * - staging/qa/etc: .env → .env.{NODE_ENV} → .env.local → .env.{NODE_ENV}.local
 *
 * Notes:
 * - .env.local is excluded in test environment for proper test isolation
 * - Any custom NODE_ENV value is supported (staging, qa, uat, preview, etc.)
 * - If NODE_ENV is not set, .env and .env.local are loaded
 *
 * @param options - Loading options
 * @returns Load result with success status and loaded variables
 *
 * @example
 * ```typescript
 * // Simple usage (no NODE_ENV set)
 * const result = loadEnvironment();
 *
 * // With NODE_ENV=local
 * process.env.NODE_ENV = 'local';
 * const result = loadEnvironment({
 *   debug: true,
 *   required: ['DATABASE_URL'],
 * });
 *
 * // With custom environment
 * process.env.NODE_ENV = 'staging';
 * const result = loadEnvironment();
 * ```
 */
export function loadEnvironment(options: LoadEnvironmentOptions = {}): LoadResult
{
    const {
        basePath = process.cwd(),
        namespace,
        useFolderStructure = false,
        customPaths = [],
        debug = false,
        nodeEnv = process.env.NODE_ENV || '',
        required = [],
        useCache = true,
    } = options;

    // Return cached result if available
    if (useCache && environmentLoaded && cachedLoadResult)
    {
        if (debug)
        {
            envLogger.debug('Returning cached environment', {
                loaded: cachedLoadResult.loaded.length,
                variables: Object.keys(cachedLoadResult.parsed).length,
            });
        }
        return cachedLoadResult;
    }

    if (debug)
    {
        envLogger.debug('Loading environment variables', {
            basePath,
            nodeEnv,
            namespace,
            useFolderStructure,
            customPaths,
            required,
        });
    }

    const result: LoadResult = {
        success: true,
        loaded: [],
        failed: [],
        parsed: {},
        warnings: [],
    };

    // Build standard file list (includes namespace files if provided)
    const standardFiles = buildFileList(basePath, nodeEnv, namespace, useFolderStructure);
    const allFiles = [...standardFiles, ...customPaths];

    if (debug)
    {
        envLogger.debug('Environment files to load', {
            standardFiles,
            customPaths,
            total: allFiles.length,
        });
    }

    // Load files in reverse order (highest priority first)
    // This is because dotenv doesn't override existing variables
    // So loading high-priority files first ensures they take precedence
    const reversedFiles = [...allFiles].reverse();

    // Load each file in reverse order
    for (const filePath of reversedFiles)
    {
        const fileResult = loadSingleFile(filePath, debug);

        if (fileResult.success)
        {
            result.loaded.push(filePath);
            Object.assign(result.parsed, fileResult.parsed);

            // Warn if NODE_ENV is set in .env files (Next.js style)
            if (fileResult.parsed['NODE_ENV'])
            {
                const fileName = filePath.split('/').pop() || filePath;
                result.warnings.push(
                    `NODE_ENV found in ${fileName}. ` +
                    `It's recommended to set NODE_ENV via CLI (e.g., 'spfn dev', 'spfn build') ` +
                    `instead of .env files for consistent environment behavior.`
                );
            }
        }
        else if (fileResult.error)
        {
            result.failed.push({
                path: filePath,
                reason: fileResult.error,
            });
        }
    }

    // Log summary
    if (debug || result.loaded.length > 0)
    {
        envLogger.info('Environment loading complete', {
            loaded: result.loaded.length,
            failed: result.failed.length,
            variables: Object.keys(result.parsed).length,
            files: result.loaded,
        });
    }

    // Validate required variables
    if (required.length > 0)
    {
        try
        {
            validateRequiredVars(required, debug);
        }
        catch (error)
        {
            result.success = false;
            result.errors = [
                error instanceof Error ? error.message : 'Validation failed',
            ];
            throw error;
        }
    }

    // Log warnings after validation
    if (result.warnings.length > 0)
    {
        for (const warning of result.warnings)
        {
            envLogger.warn(warning);
        }
    }

    // Cache result
    environmentLoaded = true;
    cachedLoadResult = result;

    return result;
}

/**
 * Get an environment variable with optional validation
 *
 * Type-safe overloads ensure proper return types:
 * - `required: true` → Always returns T (never undefined)
 * - `default` provided → Always returns T (never undefined)
 * - Neither → Returns T | undefined
 *
 * @param key - Environment variable name
 * @param options - Get options (default, required, validator)
 * @returns Variable value or undefined (based on options)
 * @throws Error if required and not found, or validation fails
 *
 * @example
 * ```typescript
 * // Optional - may be undefined
 * const dbUrl = getEnvVar('DATABASE_URL');  // string | undefined
 *
 * // With default - never undefined
 * const port = getEnvVar('PORT', { default: 3000 });  // number
 *
 * // Required - never undefined
 * const apiKey = getEnvVar('API_KEY', { required: true });  // string
 *
 * // With validation and transformation
 * const timeout = getEnvVar('TIMEOUT', {
 *   default: 5000,
 *   validator: (val) => {
 *     const n = parseInt(val, 10);
 *     if (Number.isNaN(n)) throw new Error('Must be a number');
 *     return n;
 *   }
 * });  // number
 * ```
 */
// Overload: required = true → T (never undefined)
export function getEnvVar<T = string>(key: string, options: GetEnvOptions<T> & { required: true }): T;
// Overload: default provided → T (never undefined)
export function getEnvVar<T>(key: string, options: GetEnvOptions<T> & { default: T }): T;
// Overload: neither required nor default → T | undefined
export function getEnvVar<T = string>(key: string, options?: GetEnvOptions<T>): T | undefined;
// Implementation
export function getEnvVar<T = string>(key: string, options: GetEnvOptions<T> = {}): T | undefined
{
    const {
        required = false,
        default: defaultValue,
        validator,
    } = options;

    const value = process.env[key];

    // Handle missing value
    if (value === undefined || value === '')
    {
        if (required)
        {
            throw new Error(`Required environment variable not found: ${key}`);
        }

        return defaultValue;
    }

    // Validate and transform if validator provided
    if (validator)
    {
        try
        {
            return validator(value);
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid value for environment variable ${key}: ${message}`);
        }
    }

    // No validator - return as-is (cast to T, assuming T is string)
    return value as unknown as T;
}

/**
 * Get a required environment variable
 *
 * @param key - Environment variable name
 * @returns Variable value
 * @throws Error if not found
 *
 * @example
 * ```typescript
 * const dbUrl = requireEnvVar('DATABASE_URL');
 * ```
 */
export function requireEnvVar(key: string): string
{
    return getEnvVar(key, { required: true });
}

/**
 * Check if an environment variable exists
 *
 * @param key - Environment variable name
 * @returns True if variable exists and is non-empty
 *
 * @example
 * ```typescript
 * if (hasEnvVar('REDIS_URL')) {
 *   // Use Redis
 * }
 * ```
 */
export function hasEnvVar(key: string): boolean
{
    const value = process.env[key];
    return value !== undefined && value !== '';
}

/**
 * Get multiple environment variables at once
 *
 * @param keys - Array of environment variable names
 * @returns Object mapping keys to values (undefined if not found)
 *
 * @example
 * ```typescript
 * const { DATABASE_URL, REDIS_URL } = getEnvVars([
 *   'DATABASE_URL',
 *   'REDIS_URL',
 * ]);
 * ```
 */
export function getEnvVars(keys: string[]): Record<string, string | undefined>
{
    const result: Record<string, string | undefined> = {};

    for (const key of keys)
    {
        result[key] = process.env[key];
    }

    return result;
}

/**
 * Check if environment has been loaded
 *
 * @returns True if loadEnvironment has been called successfully
 *
 * @example
 * ```typescript
 * if (!isEnvironmentLoaded()) {
 *   loadEnvironment();
 * }
 * ```
 */
export function isEnvironmentLoaded(): boolean
{
    return environmentLoaded;
}

/**
 * Reset environment loading state
 * FOR TESTING ONLY - DO NOT USE IN PRODUCTION
 *
 * @example
 * ```typescript
 * // In test cleanup
 * afterEach(() => {
 *   resetEnvironment();
 * });
 * ```
 */
export function resetEnvironment(): void
{
    environmentLoaded = false;
    cachedLoadResult = undefined;
}