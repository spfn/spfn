/**
 * Logger Factory
 *
 * Creates and initializes the logger instance with configured transports
 */

import { Logger } from './logger';
import { ConsoleTransport } from './transports/console';
import { getConsoleConfig } from './config';
import type { LogLevel, Transport } from './types';
import { LOG_LEVEL_PRIORITY } from './types';

/**
 * Initialize transports based on environment and configuration
 */
function initializeTransports(): Transport[]
{
    const transports: Transport[] = [];

    // Console Transport (always enabled)
    const consoleConfig = getConsoleConfig();
    transports.push(new ConsoleTransport(consoleConfig));

    // Future: Add more transports (Slack, Email, etc.)
    // if (config.slack?.enabled) {
    //   transports.push(new SlackTransport(config.slack));
    // }

    return transports;
}

/**
 * Get validated log level from environment variables
 */
function getLogLevel(): LogLevel
{
    const envLevel = process.env.SPFN_LOG_LEVEL
        || process.env.NEXT_PUBLIC_SPFN_LOG_LEVEL
        || 'info';

    if (envLevel in LOG_LEVEL_PRIORITY)
    {
        return envLevel as LogLevel;
    }

    process.stderr.write(
        `[Logger] Invalid log level "${envLevel}", defaulting to "info"\n`,
    );

    return 'info';
}

/**
 * Initialize logger
 *
 * Runs at import time, so it must not inspect anything a .env file can supply —
 * see the note in ./config.
 */
function initializeLogger(): Logger
{
    return new Logger({
        level: getLogLevel(),
        transports: initializeTransports(),
    });
}

/**
 * Singleton Logger instance
 */
export const logger: Logger = initializeLogger();
