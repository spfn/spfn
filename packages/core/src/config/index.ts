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

import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createEnvRegistry, type InferEnvType } from '../env';
import { coreEnvSchema } from './schema';

/**
 * Load environment variables from .env files
 *
 * Follows Next.js priority order:
 * 1. .env.{NODE_ENV}.local (highest priority)
 * 2. .env.local (not loaded when NODE_ENV=test)
 * 3. .env.{NODE_ENV}
 * 4. .env (lowest priority)
 */
function loadEnvFiles(): void
{
    const cwd = process.cwd();
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Build list of .env files to load (in priority order)
    const envFiles: string[] = [
        `.env.${nodeEnv}.local`,
        nodeEnv !== 'test' ? '.env.local' : null,
        `.env.${nodeEnv}`,
        '.env',
    ].filter((file): file is string => file !== null);

    // Load each file if it exists
    // dotenv won't override existing vars, so loading high-priority files first works
    for (const file of envFiles)
    {
        const filePath = resolve(cwd, file);
        if (existsSync(filePath))
        {
            config({ path: filePath });
        }
    }
}

// Load .env files before validating environment variables
// This ensures environment variables are available when the config module is imported
loadEnvFiles();

/**
 * Environment configuration type
 */
export type EnvConfig = InferEnvType<typeof coreEnvSchema>;

/**
 * Environment registry
 */
const registry = createEnvRegistry(coreEnvSchema);
export const env = registry.validate();