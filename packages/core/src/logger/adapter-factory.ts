/**
 * Logger Adapter Factory
 *
 * Adapter creation and initialization logic
 */

import { PinoAdapter } from './adapters/pino.js';
import { CustomAdapter } from './adapters/custom.js';
import { getDefaultLogLevel, validateConfig } from './config.js';
import type { LoggerAdapter } from './adapters/types.js';

/**
 * Adapter type
 */
type AdapterType = 'pino' | 'custom';

/**
 * Create adapter instance
 */
function createAdapter(type: AdapterType): LoggerAdapter
{
    const level = getDefaultLogLevel();

    switch (type)
    {
        case 'pino':
            return new PinoAdapter({ level });

        case 'custom':
            return new CustomAdapter({ level });

        default:
            return new PinoAdapter({ level });
    }
}

/**
 * Read adapter type from environment variable
 */
function getAdapterType(): AdapterType
{
    const adapterEnv = process.env.LOGGER_ADAPTER as AdapterType;

    if (adapterEnv === 'custom' || adapterEnv === 'pino')
    {
        return adapterEnv;
    }

    // Default: pino
    return 'pino';
}

/**
 * Initialize logger with configuration validation
 */
function initializeLogger(): LoggerAdapter
{
    // Validate configuration before creating logger
    validateConfig();

    // Create and return logger instance
    return createAdapter(getAdapterType());
}

/**
 * Singleton Logger instance
 */
export const logger: LoggerAdapter = initializeLogger();