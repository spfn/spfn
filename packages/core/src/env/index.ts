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
} from './loader';

// Type definitions
export type {
    LoadEnvironmentOptions,
    LoadResult,
    GetEnvOptions,
} from './config';

export {
    ENV_FILE_PRIORITY,
    TEST_ONLY_FILES,
} from './config';

// Validation utilities
export {
    // Deprecated validators (use parsers instead)
    validateUrl,
    createUrlValidator,
    validateNumber,
    createNumberValidator,
    validateBoolean,
    validateEnum,
    createEnumValidator,
    validatePostgresUrl,
    validateRedisUrl,
    // Parsers (recommended)
    parseBoolean,
    parseUrl,
    createUrlParser,
    parseNumber,
    createNumberParser,
    parseEnum,
    createEnumParser,
    parsePostgresUrl,
    parseRedisUrl,
    // Other validators
    validatePattern,
    createPatternValidator,
    validateNotEmpty,
    validateMinLength,
    createMinLengthValidator,
    combineValidators,
} from './validator';

// === Schema-based Environment Management (NEW) ===

// Schema definition
export {
    defineEnvSchema,
    envString,
    envNumber,
    envBoolean,
    envUrl,
    envEnum,
    envJson,
    isClientAccessible,
    isServerOnly,
} from './schema';

export type {
    EnvVarSchema,
    EnvSchemaCollection,
    InferEnvType,
} from './schema';

// Registry
export {
    EnvRegistry,
    createEnvRegistry,
} from './registry';

export type {
    ValidationResult,
    ValidationError,
    ValidationWarning,
} from './registry';

// Documentation generators
export {
    generateMarkdownDocs,
    generateEnvExample,
    generateJsonDocs,
} from './docs-generator';