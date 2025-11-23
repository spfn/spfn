/**
 * Core Package Configuration
 *
 * @example
 * ```typescript
 * import { registry } from '@spfn/core/config';
 *
 * const env = registry.validate();
 * console.log(env.DB_POOL_MAX);
 * ```
 *
 * @module config
 */

import { createEnvRegistry, type InferEnvType } from '@spfn/core/env';
import { authEnvSchema } from './schema';

/**
 * Environment configuration type
 */
export type EnvConfig = InferEnvType<typeof authEnvSchema>;

/**
 * Environment registry
 */
const registry = createEnvRegistry(authEnvSchema);
export const env = registry.validate();