/**
 * Database Connection Logic
 *
 * DB 연결 생성 및 재시도 로직
 *
 * ✅ 구현 완료:
 * - Exponential Backoff 재시도 로직
 * - 연결 테스트 쿼리
 * - 상세한 에러 로깅
 * - 연결 성공/실패 로깅
 * - Logger 적용 (console.log 대체)
 *
 * ⚠️ 개선 필요:
 * - 에러 타입별 처리 (네트워크 vs 인증)
 * - Graceful Shutdown 로직
 *
 * 💡 향후 고려사항:
 * - 연결 풀 이벤트 리스너
 * - 연결 상태 메트릭 수집
 * - 연결 풀 동적 조정
 *
 * 🔗 관련 파일:
 * - src/server/core/db/config.ts (설정)
 * - src/server/core/db/index.ts (메인 export)
 * - src/server/core/logger/ (Logger)
 *
 * 📝 TODO: improvements.md 참고
 * - #7: Connection Pool 모니터링 (Pool 이벤트 리스너, 활성/유휴 연결 추적)
 * - #9: Slow Query 로깅 (쿼리 실행 시간 측정 및 임계값 로깅)
 * - #10: Graceful Shutdown (SIGTERM 처리, 진행 중인 쿼리 완료 대기)
 * - #11: Read Replica 지원 (읽기/쓰기 분리)
 */
import postgres from 'postgres';

import { logger } from '../logger';
import { ConnectionError, fromPostgresError } from '../errors';
import type { PoolConfig, RetryConfig } from './config';

const dbLogger = logger.child('database');

/**
 * 지연 함수
 */
function delay(ms: number): Promise<void>
{
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Exponential Backoff로 DB 연결 생성
 *
 * @param connectionString - PostgreSQL 연결 문자열
 * @param poolConfig - Connection Pool 설정
 * @param retryConfig - 재시도 설정
 * @returns PostgreSQL 클라이언트
 */
export async function createDatabaseConnection(
    connectionString: string,
    poolConfig: PoolConfig,
    retryConfig: RetryConfig
)
{
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++)
    {
        try
        {
            // PostgreSQL 클라이언트 생성
            const client = postgres(connectionString, {
                max: poolConfig.max,
                idle_timeout: poolConfig.idleTimeout,
            });

            // 연결 테스트 쿼리
            await client`SELECT 1 as test`;

            // 연결 성공
            if (attempt > 0)
            {
                dbLogger.info(`Database connected successfully after ${attempt} retries`);
            }
            else
            {
                dbLogger.info('Database connected successfully');
            }

            return client;
        }
        catch (error)
        {
            lastError = fromPostgresError(error);

            // 마지막 시도가 아니면 재시도
            if (attempt < retryConfig.maxRetries)
            {
                // Exponential Backoff 계산
                const delayMs = Math.min(
                    retryConfig.initialDelay * Math.pow(retryConfig.factor, attempt),
                    retryConfig.maxDelay
                );

                dbLogger.warn(
                    `Connection failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), retrying in ${delayMs}ms...`,
                    lastError,
                    {
                        attempt: attempt + 1,
                        maxRetries: retryConfig.maxRetries + 1,
                        delayMs,
                    }
                );

                await delay(delayMs);
            }
        }
    }

    // 모든 재시도 실패
    const errorMessage =
        `Failed to connect to database after ${retryConfig.maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`;

    throw new ConnectionError(errorMessage);
}

/**
 * DB 연결 상태 확인
 *
 * @param client - PostgreSQL 클라이언트
 * @returns 연결 가능 여부
 */
export async function checkConnection(client: ReturnType<typeof postgres>): Promise<boolean>
{
    try
    {
        await client`SELECT 1 as health_check`;
        return true;
    }
    catch (error)
    {
        dbLogger.error('Database health check failed', error as Error);
        return false;
    }
}