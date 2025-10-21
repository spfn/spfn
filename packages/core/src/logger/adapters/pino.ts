/**
 * Pino Logger Adapter
 *
 * High-performance logger adapter using Pino with pretty-print for development and JSON for production.
 */

import pino from 'pino';
import type { LoggerAdapter, AdapterConfig, LogLevel } from './types';

/**
 * Pino Logger Adapter
 */
export class PinoAdapter implements LoggerAdapter
{
    private logger: pino.Logger;

    constructor(config: AdapterConfig)
    {
        const isProduction = process.env.NODE_ENV === 'production';
        const isDevelopment = process.env.NODE_ENV === 'development';

        // Development: use simple console output without transport
        // Production: use JSON output
        this.logger = pino({
            level: config.level,

            // 기본 필드
            base: config.module ? { module: config.module } : undefined,
        });
    }

    child(module: string): LoggerAdapter
    {
        const childLogger = new PinoAdapter({ level: this.logger.level as LogLevel, module });
        childLogger.logger = this.logger.child({ module });
        return childLogger;
    }

    debug(message: string, context?: Record<string, unknown>): void
    {
        this.logger.debug(context || {}, message);
    }

    info(message: string, context?: Record<string, unknown>): void
    {
        this.logger.info(context || {}, message);
    }

    warn(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.logger.warn({ err: errorOrContext, ...context }, message);
        }
        else
        {
            this.logger.warn(errorOrContext || {}, message);
        }
    }

    error(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.logger.error({ err: errorOrContext, ...context }, message);
        }
        else
        {
            this.logger.error(errorOrContext || {}, message);
        }
    }

    fatal(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.logger.fatal({ err: errorOrContext, ...context }, message);
        }
        else
        {
            this.logger.fatal(errorOrContext || {}, message);
        }
    }

    async close(): Promise<void>
    {
        // Pino는 자동으로 flush됨
        // 필요시 pino.final() 사용 가능
    }
}