/**
 * Database Configuration
 *
 * DB 연결 및 Connection Pool 설정
 *
 * ✅ 구현 완료:
 * - 환경별 Connection Pool 설정
 * - 재시도 설정 (Exponential Backoff)
 * - 환경변수 기반 설정
 *
 * 🔗 관련 파일:
 * - src/server/core/db/connection.ts (연결 로직)
 * - src/server/core/db/index.ts (메인 export)
 */

/**
 * Connection Pool 설정
 */
export interface PoolConfig
{
    max: number;              // 최대 연결 수
    idleTimeout: number;      // 유휴 연결 타임아웃 (초)
}

/**
 * 재시도 설정
 */
export interface RetryConfig
{
    maxRetries: number;       // 최대 재시도 횟수
    initialDelay: number;     // 초기 대기 시간 (ms)
    maxDelay: number;         // 최대 대기 시간 (ms)
    factor: number;           // 지수 증가 배수
}

/**
 * 환경별 Connection Pool 설정
 *
 * 우선순위:
 * 1. options 파라미터 (ServerConfig에서 전달)
 * 2. 환경변수 (DB_POOL_MAX, DB_POOL_IDLE_TIMEOUT)
 * 3. 기본값 (NODE_ENV에 따라)
 *
 * @param options - Optional pool configuration from ServerConfig
 * @returns Pool configuration
 *
 * @example
 * ```typescript
 * // 1. ServerConfig priority (highest)
 * const config = getPoolConfig({ max: 50, idleTimeout: 60 });
 *
 * // 2. Environment variable priority
 * // DB_POOL_MAX=30 DB_POOL_IDLE_TIMEOUT=45
 * const config = getPoolConfig();
 *
 * // 3. Default (lowest)
 * // Production: max=20, idleTimeout=30
 * // Development: max=10, idleTimeout=20
 * ```
 */
export function getPoolConfig(options?: Partial<PoolConfig>): PoolConfig
{
    const isProduction = process.env.NODE_ENV === 'production';

    // Priority: options > env > default
    const max = options?.max
        ?? (parseInt(process.env.DB_POOL_MAX || '', 10) || (isProduction ? 20 : 10));

    const idleTimeout = options?.idleTimeout
        ?? (parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '', 10) || (isProduction ? 30 : 20));

    return { max, idleTimeout };
}

/**
 * 환경별 재시도 설정
 */
export function getRetryConfig(): RetryConfig
{
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        maxRetries: isProduction ? 5 : 3,      // 프로덕션: 5회, 개발: 3회
        initialDelay: 1000,                     // 1초
        maxDelay: 16000,                        // 16초
        factor: 2,                              // 2배씩 증가 (1s → 2s → 4s → 8s → 16s)
    };
}