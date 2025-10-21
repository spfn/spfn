/**
 * Logger Class
 *
 * Central logging class with multiple transports, child loggers, and sensitive data masking.
 */

import type { LogLevel, LogMetadata, LoggerConfig, Transport } from './types';
import { LOG_LEVEL_PRIORITY } from './types';
import { maskSensitiveData } from './formatters';

/**
 * Logger class
 */
export class Logger
{
    private readonly config: LoggerConfig;
    private readonly module?: string;

    constructor(config: LoggerConfig)
    {
        this.config = config;
        this.module = config.module;
    }

    /**
     * Get current log level
     */
    get level(): LogLevel
    {
        return this.config.level;
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
        // Early return if log level is below configured level
        // This prevents unnecessary metadata creation and processing
        if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.config.level])
        {
            return;
        }

        const metadata: LogMetadata = {
            timestamp: new Date(),
            level,
            message,
            module: this.module,
            error,
            // Mask sensitive information in context to prevent credential leaks
            context: context ? maskSensitiveData(context) as Record<string, unknown> : undefined,
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
            // Use stderr directly to avoid circular logging
            const errorMessage = error instanceof Error ? error.message : String(error);
            process.stderr.write(`[Logger] Transport error: ${errorMessage}\n`);
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
            // Use stderr directly to avoid circular logging
            const errorMessage = error instanceof Error ? error.message : String(error);
            process.stderr.write(`[Logger] Transport "${transport.name}" failed: ${errorMessage}\n`);
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