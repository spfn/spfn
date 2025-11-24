/**
 * Logger Factory
 *
 * Creates and initializes the logger instance with configured transports
 */

import { Logger } from './logger';
import { ConsoleTransport } from './transports/console';
import { getConsoleConfig, validateConfig } from './config';
import type { LogLevel, Transport } from './types';

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
 * Initialize logger with configuration validation
 */
function initializeLogger(): Logger
{
    // Validate configuration before creating logger
    validateConfig();

    // Create logger with configured transports
    return new Logger({
        level: (process.env.SPFN_LOG_LEVEL || process.env.NEXT_PUBLIC_SPFN_LOG_LEVEL || 'info') as LogLevel,  // Type inference not perfect yet, fallback needed
        transports: initializeTransports(),
    });
}

/**
 * Singleton Logger instance
 */
export const logger: Logger = initializeLogger();