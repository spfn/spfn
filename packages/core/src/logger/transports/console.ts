/**
 * Console Transport
 *
 * 콘솔 출력 Transport
 *
 * ✅ 구현 완료:
 * - 콘솔 출력 (stdout/stderr)
 * - 컬러 출력 지원
 * - 로그 레벨별 스트림 분리 (warn/error/fatal → stderr)
 *
 * 🔗 관련 파일:
 * - src/logger/types.ts (Transport 인터페이스)
 * - src/logger/formatters.ts (포맷터)
 * - src/logger/config.ts (설정)
 */

import type { Transport, LogMetadata, LogLevel, ConsoleTransportConfig } from '../types';
import { LOG_LEVEL_PRIORITY } from '../types';
import { formatConsole } from '../formatters';

/**
 * Console Transport
 */
export class ConsoleTransport implements Transport
{
    public readonly name = 'console';
    public readonly level: LogLevel;
    public readonly enabled: boolean;
    private readonly colorize: boolean;

    constructor(config: ConsoleTransportConfig)
    {
        this.level = config.level;
        this.enabled = config.enabled;
        this.colorize = config.colorize ?? true;
    }

    async log(metadata: LogMetadata): Promise<void>
    {
        // Enabled 상태 체크
        if (!this.enabled)
        {
            return;
        }

        // 로그 레벨 체크
        if (LOG_LEVEL_PRIORITY[metadata.level] < LOG_LEVEL_PRIORITY[this.level])
        {
            return;
        }

        // 포맷팅
        const message = formatConsole(metadata, this.colorize);

        // warn/error/fatal은 stderr로, 나머지는 stdout으로
        if (metadata.level === 'warn' || metadata.level === 'error' || metadata.level === 'fatal')
        {
            console.error(message);
        }
        else
        {
            console.log(message);
        }
    }
}