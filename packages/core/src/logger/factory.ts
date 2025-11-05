/**
 * Logger Factory
 *
 * Creates and initializes the logger instance with configured transports
 */

import { Logger } from './logger.js';
import { ConsoleTransport } from './transports/console.js';
import { FileTransport } from './transports/file.js';
import { getDefaultLogLevel, getConsoleConfig, getFileConfig, validateConfig } from './config.js';
import type { Transport } from './types.js';

/**
 * Initialize transports based on environment and configuration
 */
function initializeTransports(): Transport[]
{
    const transports: Transport[] = [];

    // Console Transport (always enabled)
    const consoleConfig = getConsoleConfig();
    transports.push(new ConsoleTransport(consoleConfig));

    // File Transport (enabled in production or via config)
    const fileConfig = getFileConfig();
    if (fileConfig.enabled)
    {
        transports.push(new FileTransport(fileConfig));
    }

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
        level: getDefaultLogLevel(),
        transports: initializeTransports(),
    });
}

/**
 * Singleton Logger instance
 */
export const logger: Logger = initializeLogger();