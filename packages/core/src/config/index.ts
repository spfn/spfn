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

import { createEnvRegistry, type InferEnvType } from '../env';
import { coreEnvSchema } from './schema';

/**
 * Environment configuration type
 */
export type EnvConfig = InferEnvType<typeof coreEnvSchema>;

/**
 * Environment registry
 */
const registry = createEnvRegistry(coreEnvSchema);
export const env = registry.validate();