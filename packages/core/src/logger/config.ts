/**
 * Logger Configuration
 *
 * Environment-based logger configuration with validation for console transport.
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

/**
 * Validate environment variables
 */
function validateEnvironment(): void
{
    const nodeEnv = process.env.NODE_ENV;

    if (!nodeEnv)
    {
        process.stderr.write(
            '[Logger] Warning: NODE_ENV is not set. Defaulting to test environment.\n',
        );
    }
    // Allow any NODE_ENV value (development, production, test, staging, local, etc.)
    // No validation needed - users can use custom environments
}

/**
 * Validate all logger configuration
 */
export function validateConfig(): void
{
    validateEnvironment();
}
