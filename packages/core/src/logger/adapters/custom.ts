/**
 * Custom Logger Adapter
 *
 * 자체 구현한 Logger를 사용하는 Adapter
 *
 * ✅ 구현 완료:
 * - 기존 Logger 클래스 래핑
 * - Transport 시스템 (Console, File)
 * - Child logger 지원
 *
 * 💡 용도:
 * - Pino 의존성 제거 필요시
 * - 커스텀 Transport 필요시
 * - 완전한 제어가 필요한 경우
 *
 * 🔗 관련 파일:
 * - src/logger/logger.ts (Logger 클래스)
 * - src/logger/transports/ (Transport 구현)
 * - src/logger/adapters/types.ts (인터페이스)
 */

import { Logger } from '../logger';
import { ConsoleTransport } from '../transports/console';
import { FileTransport } from '../transports/file';
import { getConsoleConfig, getFileConfig } from '../config';
import type { LoggerAdapter, AdapterConfig } from './types';
import type { Transport } from '../types';

/**
 * Transport 초기화
 */
function initializeTransports(): Transport[]
{
    const transports: Transport[] = [];

    // Console Transport (항상 활성화)
    const consoleConfig = getConsoleConfig();
    transports.push(new ConsoleTransport(consoleConfig));

    // File Transport (프로덕션에서만 활성화)
    const fileConfig = getFileConfig();
    if (fileConfig.enabled)
    {
        transports.push(new FileTransport(fileConfig));
    }

    return transports;
}

/**
 * Custom Logger Adapter
 */
export class CustomAdapter implements LoggerAdapter
{
    private logger: Logger;

    constructor(config: AdapterConfig)
    {
        this.logger = new Logger({
            level: config.level,
            module: config.module,
            transports: initializeTransports(),
        });
    }

    child(module: string): LoggerAdapter
    {
        const adapter = new CustomAdapter({ level: this.logger.level, module });
        adapter.logger = this.logger.child(module);
        return adapter;
    }

    debug(message: string, context?: Record<string, unknown>): void
    {
        this.logger.debug(message, context);
    }

    info(message: string, context?: Record<string, unknown>): void
    {
        this.logger.info(message, context);
    }

    warn(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.logger.warn(message, errorOrContext, context);
        }
        else
        {
            this.logger.warn(message, errorOrContext);
        }
    }

    error(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.logger.error(message, errorOrContext, context);
        }
        else
        {
            this.logger.error(message, errorOrContext);
        }
    }

    fatal(message: string, errorOrContext?: Error | Record<string, unknown>, context?: Record<string, unknown>): void
    {
        if (errorOrContext instanceof Error)
        {
            this.logger.fatal(message, errorOrContext, context);
        }
        else
        {
            this.logger.fatal(message, errorOrContext);
        }
    }

    async close(): Promise<void>
    {
        await this.logger.close();
    }
}