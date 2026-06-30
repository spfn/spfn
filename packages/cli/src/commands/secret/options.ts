/**
 * Shared option shape and `--env` validation for the `spfn secret` subcommands.
 */

import { logger } from '../../utils/logger.js';
import { VALID_ENVS } from '../../utils/env-schema.js';

export interface SecretOptions
{
    env?: string;
    package?: string;
    all?: boolean;
}

/**
 * Resolve and validate the `--env` value, defaulting to `local`.
 */
export function resolveEnv(env?: string): string
{
    const value = env ?? 'local';

    if (!VALID_ENVS.includes(value as (typeof VALID_ENVS)[number]))
    {
        logger.error(`Invalid environment: "${value}". Valid values: ${VALID_ENVS.join(', ')}`);
        process.exit(1);
    }

    return value;
}
