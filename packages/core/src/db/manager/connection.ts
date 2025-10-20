import postgres from 'postgres';
import type { Sql } from 'postgres';

import { logger } from '../../logger';
import { ConnectionError } from '../../errors';
import { fromPostgresError } from '../postgres-errors';
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
) {
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
export async function checkConnection(client: Sql): Promise<boolean>
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