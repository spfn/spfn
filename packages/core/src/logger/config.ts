/**
 * Logger Configuration
 *
 * Environment-based logger configuration with validation for console, Slack, and Email transports.
 */

import type {
    LogLevel,
    ConsoleTransportConfig,
} from './types';

/**
 * Get default log level by environment
 */
export function getDefaultLogLevel(): LogLevel
{
    // Allow explicit LOG_LEVEL override
    const logLevelEnv = process.env.LOG_LEVEL?.toLowerCase();
    if (logLevelEnv && ['debug', 'info', 'warn', 'error', 'fatal'].includes(logLevelEnv))
    {
        return logLevelEnv as LogLevel;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment)
    {
        return 'debug';
    }

    if (isProduction)
    {
        return 'info';
    }

    // Test environment
    return 'warn';
}


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
            '[Logger] Warning: NODE_ENV is not set. Defaulting to test environment.\n'
        );
    }
    // Allow any NODE_ENV value (development, production, test, staging, local, etc.)
    // No validation needed - users can use custom environments
}

/**
 * Validate all logger configuration
 * Throws an error if configuration is invalid
 */
export function validateConfig(): void
{
    try
    {
        validateEnvironment();
    }
    catch (error)
    {
        if (error instanceof Error)
        {
            throw new Error(`[Logger] Configuration validation failed: ${error.message}`);
        }
        throw error;
    }
}