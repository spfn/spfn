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
        const fileLoggingEnabled = process.env.LOGGER_FILE_ENABLED === 'true';

        // Transport 설정
        const targets: pino.TransportTargetOptions[] = [];

        // 1. Stdout Transport (항상)
        if (!isProduction && isDevelopment)
        {
            // 개발: Pretty Print
            targets.push({
                target: 'pino-pretty',
                level: 'debug',
                options: {
                    colorize: true,
                    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
                    ignore: 'pid,hostname',
                    // 메시지와 필드를 한 줄로 표시
                    messageFormat: '{if module}[module={module}] {end}{msg}',
                    // context 필드들도 한 줄로 표시
                    singleLine: true,
                },
            });
        }
        else
        {
            // 프로덕션: JSON (기본 stdout)
            // targets가 비어있으면 자동으로 stdout JSON 사용
        }

        // 2. File Transport (자체 구축 시)
        if (fileLoggingEnabled && isProduction)
        {
            const logDir = process.env.LOG_DIR || './logs';
            const maxFileSize = process.env.LOG_MAX_FILE_SIZE || '10M';
            const maxFiles = parseInt(process.env.LOG_MAX_FILES || '10', 10);

            targets.push({
                target: 'pino-roll',
                level: 'info',
                options: {
                    file: `${logDir}/app.log`,
                    frequency: 'daily',
                    size: maxFileSize,
                    limit: { count: maxFiles },
                    mkdir: true,
                },
            });
        }

        this.logger = pino({
            level: config.level,

            // Transport 설정 (targets가 있으면 사용, 없으면 기본 stdout)
            transport: targets.length > 0 ? { targets } : undefined,

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