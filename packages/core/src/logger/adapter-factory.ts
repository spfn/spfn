/**
 * Logger Adapter Factory
 *
 * Adapter creation and initialization logic
 */

import { PinoAdapter } from './adapters/pino.js';
import { CustomAdapter } from './adapters/custom.js';
import { getDefaultLogLevel } from './config.js';
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
 * Singleton Logger instance
 */
export const logger: LoggerAdapter = createAdapter(getAdapterType());