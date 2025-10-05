/**
 * Logger Class
 *
 * Main logger class
 *
 * ✅ Implemented:
 * - 5 log level methods (debug, info, warn, error, fatal)
 * - Child logger creation (per module)
 * - Multiple Transport support
 * - Context object support
 * - Automatic Error object handling
 *
 * 💡 Future considerations:
 * - Log sampling (limit high-frequency logs)
 * - Async batch processing
 * - Memory usage monitoring
 *
 * 🔗 Related files:
 * - src/logger/types.ts (Type definitions)
 * - src/logger/transports/ (Transport implementations)
 * - src/logger/adapter-factory.ts (Singleton instance)
 */

import type { LogLevel, LogMetadata, LoggerConfig, Transport } from './types';

/**
 * Logger class
 */
export class Logger
{
    private config: LoggerConfig;
    private module?: string;

    constructor(config: LoggerConfig)
    {
        this.config = config;
        this.module = config.module;
    }

    /**
     * Create child logger (per module)
     */
    child(module: string): Logger
    {
        return new Logger({
            ...this.config,
            module,
        });
    }

    /**
     * Debug log
     */
    debug(message: string, context?: Record<string, unknown>): void
    {
        this.log('debug', message, undefined, context);
    }

    /**
     * Info log
     */
    info(message: string, context?: Record<string, unknown>): void
    {
        this.log('info', message, undefined, context);
    }

    /**
     * Warn log
     */
    warn(message: string, context?: Record<string, unknown>): void;
    warn(message: string, error: Error, context?: Record<string, unknown>): void;
    warn(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.log('warn', message, errorOrContext, context);
        }
        else
        {
            this.log('warn', message, undefined, errorOrContext);
        }
    }

    /**
     * Error log
     */
    error(message: string, context?: Record<string, unknown>): void;
    error(message: string, error: Error, context?: Record<string, unknown>): void;
    error(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.log('error', message, errorOrContext, context);
        }
        else
        {
            this.log('error', message, undefined, errorOrContext);
        }
    }

    /**
     * Fatal log
     */
    fatal(message: string, context?: Record<string, unknown>): void;
    fatal(message: string, error: Error, context?: Record<string, unknown>): void;
    fatal(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.log('fatal', message, errorOrContext, context);
        }
        else
        {
            this.log('fatal', message, undefined, errorOrContext);
        }
    }

    /**
     * Log processing (internal)
     */
    private log(level: LogLevel, message: string, error?: Error, context?: Record<string, unknown>): void
    {
        const metadata: LogMetadata = {
            timestamp: new Date(),
            level,
            message,
            module: this.module,
            error,
            context,
        };

        // Pass to all enabled Transports
        this.processTransports(metadata);
    }

    /**
     * Process Transports
     */
    private processTransports(metadata: LogMetadata): void
    {
        const promises = this.config.transports
            .filter(transport => transport.enabled)
            .map(transport => this.safeTransportLog(transport, metadata));

        // Async processing to prevent Transport errors from blocking logs
        Promise.all(promises).catch(error =>
        {
            console.error('Transport error:', error);
        });
    }

    /**
     * Transport log (error-safe)
     */
    private async safeTransportLog(transport: Transport, metadata: LogMetadata): Promise<void>
    {
        try
        {
            await transport.log(metadata);
        }
        catch (error)
        {
            console.error(`Transport "${transport.name}" failed:`, error);
        }
    }

    /**
     * Close all Transports
     */
    async close(): Promise<void>
    {
        const closePromises = this.config.transports
            .filter(transport => transport.close)
            .map(transport => transport.close!());

        await Promise.all(closePromises);
    }
}