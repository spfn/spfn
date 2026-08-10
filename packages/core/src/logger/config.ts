/**
 * Logger Configuration
 *
 * Environment-based logger configuration for the console transport.
 *
 * NODE_ENV is deliberately NOT checked here. The logger is a module-level
 * singleton, so anything this module runs happens at import time — and the env
 * loader imports the logger, which puts every logger-side check strictly before
 * any .env file is read. A NODE_ENV warning raised from here therefore fires
 * even when .env.server sets NODE_ENV, which is what issue #136 reported. The
 * check now lives in `loadEnv` (src/env/loader.ts), where the environment is
 * settled.
 */

import type {
    ConsoleTransportConfig,
} from './types';

/**
 * Console Transport configuration
 */
export function getConsoleConfig(): ConsoleTransportConfig
{
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'debug',
        enabled: true,
        colorize: !isProduction, // Dev: colored output, Production: plain text
    };
}
