/**
 * @deprecated Use `loadEnv` from '@spfn/core/env/loader' instead.
 * This module will be removed in the next major version.
 */

import { loadEnv } from '../env/loader';

let warned = false;

/**
 * @deprecated Use `loadEnv()` from '@spfn/core/env/loader' instead.
 */
export function loadEnvFiles(): void
{
    if (!warned)
    {
        warned = true;
        console.warn(
            '[SPFN] loadEnvFiles() is deprecated. Use loadEnv() from "@spfn/core/env/loader" instead.',
        );
    }

    loadEnv();
}
