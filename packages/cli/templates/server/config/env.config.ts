/**
 * Environment Variable Configuration
 *
 * This file defines all environment variables with type-safety, validation, and documentation.
 * The schema-based approach provides:
 * - Type-safe environment variable access
 * - Automatic validation on app startup
 * - Auto-generated documentation
 * - Centralized configuration
 *
 * @see https://spfn.dev/docs/guides/environment for full documentation
 */

import {
    defineEnvSchema,
    createEnvRegistry,
    envString,
    envNumber,
    envBoolean,
    envUrl,
    parsePostgresUrl,
    createNumberParser,
} from '@spfn/core/env';

/**
 * Environment Variable Schema
 *
 * Define all your environment variables here with metadata and validation.
 * This schema is used for:
 * - Runtime validation
 * - Type-safe access
 * - Auto-generated .env.example
 * - Documentation generation
 */
export const envSchema = defineEnvSchema({
});

/**
 * Type-safe Environment Variables
 *
 * Variables are lazily validated on access — if a required variable is
 * missing or invalid, an error is thrown at the first access point.
 * This is timing-safe with dotenv loading.
 *
 * @example
 * ```typescript
 * import env from '@/server/config/env.config';
 *
 * const dbUrl = env.DATABASE_URL;   // throws if required and missing
 * const port = env.PORT ?? 8790;    // optional with fallback
 * ```
 *
 * For explicit upfront validation (e.g. in a CLI script), call
 * `createEnvRegistry(envSchema).validateAll()` to get `{ errors, warnings }`.
 */
export const env = createEnvRegistry(envSchema).validate();

export default env;