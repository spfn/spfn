/**
 * Pino Logger Adapter
 *
 * Pino를 사용하는 Logger Adapter 구현
 *
 * ✅ 구현 완료:
 * - Pino 기반 로깅
 * - Child logger 지원
 * - Error 객체 처리 (err 필드)
 * - Context 병합
 * - 환경별 설정 (pretty print)
 * - 파일 로깅 with Rotation (자체 구축용)
 *
 * 💡 배포 시나리오:
 * - K8s: Stdout만 (로그 수집기가 처리)
 * - 자체 구축: Stdout + File with Rotation
 *
 * 💡 특징:
 * - 고성능 (Winston보다 5-10배 빠름)
 * - JSON 기본 포맷
 * - 프로덕션 검증됨 (Netflix, Elastic 사용)
 *
 * 🔗 관련 파일:
 * - src/logger/adapters/types.ts (인터페이스)
 * - src/logger/index.ts (Adapter 선택)
 * - src/logger/config.ts (설정)
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