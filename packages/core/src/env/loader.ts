/**
 * Environment Variable Management - Core Loader
 *
 * Centralized singleton environment variable loader with dotenv priority support
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger/index.js';
import type {
    LoadEnvironmentOptions,
    LoadResult,
    GetEnvOptions,
} from './config.js';
import { ENV_FILE_PRIORITY, TEST_ONLY_FILES } from './config.js';

const envLogger = logger.child('environment');

/**
 * Singleton state
 */
let environmentLoaded = false;
let cachedLoadResult: LoadResult | undefined;

/**
 * Build list of environment files to load based on NODE_ENV
 *
 * Next.js-style behavior:
 * - .env.local is excluded in test environment for test isolation
 * - Test files (.env.test*) are excluded in non-test environments
 *
 * @param basePath - Base directory for .env files
 * @param nodeEnv - Current NODE_ENV value
 * @returns Array of absolute file paths to load in priority order
 */
function buildFileList(basePath: string, nodeEnv: string): string[]
{
    const files: string[] = [];

    for (const pattern of ENV_FILE_PRIORITY)
    {
        const fileName = pattern.replace('{NODE_ENV}', nodeEnv);

        // Skip .env.local in test environment (Next.js-style)
        if (nodeEnv === 'test' && fileName === '.env.local')
        {
            continue;
        }

        // Skip test files in non-test environments
        if (nodeEnv !== 'test' && TEST_ONLY_FILES.includes(fileName as any))
        {
            continue;
        }

        files.push(join(basePath, fileName));
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
 * - development: .env → .env.development → .env.local → .env.development.local
 * - production:  .env → .env.production → .env.local → .env.production.local
 * - test:        .env → .env.test → (skip .env.local) → .env.test.local
 *
 * Note: .env.local is excluded in test environment for proper test isolation
 *
 * @param options - Loading options
 * @returns Load result with success status and loaded variables
 *
 * @example
 * ```typescript
 * // Simple usage
 * const result = loadEnvironment();
 *
 * // With options
 * const result = loadEnvironment({
 *   debug: true,
 *   required: ['DATABASE_URL'],
 * });
 * ```
 */
export function loadEnvironment(options: LoadEnvironmentOptions = {}): LoadResult
{
    const {
        basePath = process.cwd(),
        customPaths = [],
        debug = false,
        nodeEnv = process.env.NODE_ENV || 'development',
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

    // Build standard file list
    const standardFiles = buildFileList(basePath, nodeEnv);
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

    // Cache result
    environmentLoaded = true;
    cachedLoadResult = result;

    return result;
}

/**
 * Get an environment variable with optional validation
 *
 * @param key - Environment variable name
 * @param options - Get options (default, required, validator)
 * @returns Variable value or undefined
 * @throws Error if required and not found, or validation fails
 *
 * @example
 * ```typescript
 * // Simple get
 * const dbUrl = getEnvVar('DATABASE_URL');
 *
 * // With default
 * const port = getEnvVar('PORT', { default: '3000' });
 *
 * // Required
 * const apiKey = getEnvVar('API_KEY', { required: true });
 *
 * // With validation
 * const url = getEnvVar('API_URL', {
 *   validator: (val) => val.startsWith('https://'),
 *   validationError: 'API_URL must use HTTPS',
 * });
 * ```
 */
export function getEnvVar(key: string, options: GetEnvOptions = {}): string | undefined
{
    const {
        required = false,
        default: defaultValue,
        validator,
        validationError,
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

    // Validate if validator provided
    if (validator && !validator(value))
    {
        const message = validationError || `Invalid value for environment variable: ${key}`;
        throw new Error(message);
    }

    return value;
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
    return getEnvVar(key, { required: true })!;
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