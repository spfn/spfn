/**
 * Environment Variable Management
 *
 * Centralized environment variable loading with dotenv priority support
 *
 * @example
 * ```typescript
 * import { loadEnvironment, requireEnvVar } from '@spfn/core/env';
 *
 * // Load environment variables
 * loadEnvironment({
 *   debug: true,
 *   required: ['DATABASE_URL'],
 * });
 *
 * // Get required variables
 * const dbUrl = requireEnvVar('DATABASE_URL');
 * ```
 *
 * @module env
 */

// Core loader functions
export {
    loadEnvironment,
    getEnvVar,
    requireEnvVar,
    hasEnvVar,
    getEnvVars,
    isEnvironmentLoaded,
    resetEnvironment,
} from './loader.js';

// Type definitions
export type {
    LoadEnvironmentOptions,
    LoadResult,
    GetEnvOptions,
} from './config.js';

export {
    ENV_FILE_PRIORITY,
    TEST_ONLY_FILES,
} from './config.js';

// Validation utilities
export {
    validateUrl,
    createUrlValidator,
    validateNumber,
    createNumberValidator,
    validateBoolean,
    parseBoolean,
    validateEnum,
    createEnumValidator,
    validatePattern,
    createPatternValidator,
    validateNotEmpty,
    validateMinLength,
    createMinLengthValidator,
    combineValidators,
    validatePostgresUrl,
    validateRedisUrl,
} from './validator.js';