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

// Parser utilities
export {
    // Core types
    type Parser,
    // String parsers
    parseString,
    createStringParser,
    // Boolean parser
    parseBoolean,
    // Number parsers
    parseNumber,
    createNumberParser,
    parseInteger,
    parseDecimal,
    // URL parsers
    parseUrl,
    createUrlParser,
    parsePostgresUrl,
    parseRedisUrl,
    // Enum parser
    parseEnum,
    createEnumParser,
    // JSON parser
    parseJson,
    createJsonParser,
    // Array parser
    parseArray,
    createArrayParser,
    // Parser composition
    chain,
    withFallback,
    optional,
    //
    createSecureSecretParser,
    createPasswordParser
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

export type * from './types';