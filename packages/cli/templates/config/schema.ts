/**
 * Environment Variable Schema
 *
 * Centralized schema definition for all environment variables.
 * This provides type safety, validation, and documentation for your application configuration.
 *
 * @example
 * ```typescript
 * import { envSchema } from './config/schema';
 *
 * // Access validated environment variables
 * console.log(envSchema.DATABASE_URL.description);
 * console.log(envSchema.PORT.default);
 * ```
 *
 * @module config/schema
 */

import {
    defineEnvSchema,
    envString,
    envNumber,
} from '@spfn/core/env';

/**
 * Application environment variable schema
 *
 * Add your environment variables here with proper types and validation.
 */
export const envSchema = defineEnvSchema({
    // Example: API configuration
    API_KEY: envString({
        description: 'Third-party API key',
        required: true,
    }),

    // Example: Server port
    PORT: envNumber({
        description: 'Server port number',
        default: 8790,
    }),
});