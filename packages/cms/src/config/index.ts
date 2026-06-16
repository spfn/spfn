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

import { createEnvRegistry } from '@spfn/core/env';
import { cmsEnvSchema } from './schema';

/**
 * Environment registry
 */
const registry = createEnvRegistry(cmsEnvSchema);
export const env = registry.validate();
