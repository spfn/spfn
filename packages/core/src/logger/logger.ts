/**
 * Logger Class
 *
 * 메인 로거 클래스
 *
 * ✅ 구현 완료:
 * - 5가지 로그 레벨 메서드 (debug, info, warn, error, fatal)
 * - Child logger 생성 (모듈별)
 * - 다중 Transport 지원
 * - Context 객체 지원
 * - Error 객체 자동 처리
 *
 * 💡 향후 고려사항:
 * - 로그 샘플링 (고빈도 로그 제한)
 * - 비동기 배치 처리
 * - 메모리 사용량 모니터링
 *
 * 🔗 관련 파일:
 * - src/server/core/logger/types.ts (타입 정의)
 * - src/server/core/logger/transports/ (Transport 구현체)
 * - src/server/core/logger/index.ts (싱글톤 인스턴스)
 */

import type { LogLevel, LogMetadata, LoggerConfig, Transport } from './types';

/**
 * Logger 클래스
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
     * Child logger 생성 (모듈별)
     */
    child(module: string): Logger
    {
        return new Logger({
            ...this.config,
            module,
        });
    }

    /**
     * Debug 로그
     */
    debug(message: string, context?: Record<string, unknown>): void
    {
        this.log('debug', message, undefined, context);
    }

    /**
     * Info 로그
     */
    info(message: string, context?: Record<string, unknown>): void
    {
        this.log('info', message, undefined, context);
    }

    /**
     * Warn 로그
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
     * Error 로그
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
     * Fatal 로그
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
     * 로그 처리 (내부)
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

        // 모든 활성화된 Transport에 전달
        this.processTransports(metadata);
    }

    /**
     * Transport 처리
     */
    private processTransports(metadata: LogMetadata): void
    {
        const promises = this.config.transports
            .filter(transport => transport.enabled)
            .map(transport => this.safeTransportLog(transport, metadata));

        // Transport 에러가 로그 자체를 막지 않도록 비동기 처리
        Promise.all(promises).catch(error =>
        {
            console.error('Transport error:', error);
        });
    }

    /**
     * Transport 로그 (에러 안전)
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
     * 모든 Transport 종료
     */
    async close(): Promise<void>
    {
        const closePromises = this.config.transports
            .filter(transport => transport.close)
            .map(transport => transport.close!());

        await Promise.all(closePromises);
    }
}