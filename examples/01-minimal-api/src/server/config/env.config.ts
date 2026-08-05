/**
 * Environment Variable Configuration
 *
 * Define app-specific environment variables here with type-safety and validation.
 * This minimal example declares none; SPFN core still validates its own required
 * variables (e.g. SPFN_API_URL for the Next.js proxy).
 *
 * @see https://superfunction.xyz/docs/packages/core/env
 */

import { defineEnvSchema, createEnvRegistry } from '@spfn/core/env';

export const envSchema = defineEnvSchema({
});

export const env = createEnvRegistry(envSchema).validate();

export default env;
