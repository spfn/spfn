/**
 * Logger Adapter Interface
 *
 * Logger 구현을 추상화하는 Adapter 인터페이스
 * Pino, Winston, Custom 등 다양한 구현체로 교체 가능
 *
 * ✅ 구현 완료:
 * - LoggerAdapter 인터페이스 정의
 * - Child logger 지원
 * - Error + Context 지원
 *
 * 💡 향후 고려사항:
 * - Winston Adapter
 * - Bunyan Adapter
 *
 * 🔗 관련 파일:
 * - src/logger/adapters/pino.ts (Pino 구현)
 * - src/logger/adapters/custom.ts (Custom 구현)
 * - src/logger/index.ts (Adapter 선택)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Logger Adapter 인터페이스
 *
 * 모든 Logger 구현체는 이 인터페이스를 구현해야 함
 */
export interface LoggerAdapter
{
    /**
     * Child logger 생성
     */
    child(module: string): LoggerAdapter;

    /**
     * Debug 로그
     */
    debug(message: string, context?: Record<string, unknown>): void;

    /**
     * Info 로그
     */
    info(message: string, context?: Record<string, unknown>): void;

    /**
     * Warn 로그
     */
    warn(message: string, context?: Record<string, unknown>): void;
    warn(message: string, error: Error, context?: Record<string, unknown>): void;

    /**
     * Error 로그
     */
    error(message: string, context?: Record<string, unknown>): void;
    error(message: string, error: Error, context?: Record<string, unknown>): void;

    /**
     * Fatal 로그
     */
    fatal(message: string, context?: Record<string, unknown>): void;
    fatal(message: string, error: Error, context?: Record<string, unknown>): void;

    /**
     * 리소스 정리
     */
    close?(): Promise<void>;
}

/**
 * Adapter 설정
 */
export interface AdapterConfig
{
    level: LogLevel;
    module?: string;
}