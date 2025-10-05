/**
 * Database Instance
 *
 * PostgreSQL + Drizzle ORM 연결 초기화 및 인스턴스 생성
 *
 * ✅ 구현 완료:
 * - PostgreSQL Connection Pool 설정
 * - 환경변수 자동 로드 (.env.local)
 * - DATABASE_URL 검증
 * - Drizzle ORM 인스턴스 생성
 * - 연결 실패 시 재시도 로직 (Exponential Backoff)
 * - 환경별 Connection Pool 설정 분리
 * - Read Replica 지원 (읽기/쓰기 분리) - #11
 *
 * ⚠️ 개선 필요:
 * - DB 연결 상태 헬스체크 엔드포인트
 * - 연결 풀 모니터링 (활성/유휴 연결 수)
 * - Graceful Shutdown 로직
 *
 * 💡 향후 고려사항:
 * - Connection Pool 이벤트 로깅
 * - 트랜잭션 격리 수준 설정 옵션
 * - 쿼리 로깅 및 성능 모니터링
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { createDatabaseConnection } from './connection.js';
import { getPoolConfig, getRetryConfig } from './config.js';

// Load environment variables (if not already loaded)
if (!process.env.DATABASE_URL)
{
    config({ path: '.env.local' });
}

// 환경변수에서 DATABASE_URL 읽기
const primaryUrl = process.env.DATABASE_URL;
const replicaUrl = process.env.DATABASE_REPLICA_URL; // Optional

if (!primaryUrl)
{
    throw new Error('DATABASE_URL environment variable is not set');
}

// Connection Pool 및 재시도 설정
const poolConfig = getPoolConfig();
const retryConfig = getRetryConfig();

// Primary 연결 (쓰기용)
let primaryClientPromise: ReturnType<typeof createDatabaseConnection> | null = null;

function getPrimaryClient()
{
    if (!primaryClientPromise)
    {
        primaryClientPromise = createDatabaseConnection(
            primaryUrl!,
            poolConfig,
            retryConfig
        );
    }
    return primaryClientPromise;
}

// Replica 연결 (읽기용, Optional)
let replicaClientPromise: ReturnType<typeof createDatabaseConnection> | null = null;

function getReplicaClient()
{
    if (!replicaUrl)
    {
        // Replica URL이 없으면 Primary 사용
        return getPrimaryClient();
    }

    if (!replicaClientPromise)
    {
        replicaClientPromise = createDatabaseConnection(
            replicaUrl,
            poolConfig,
            retryConfig
        );
    }
    return replicaClientPromise;
}

// 클라이언트 초기화
const primaryClient = await getPrimaryClient();
const replicaClient = await getReplicaClient();

// Drizzle 인스턴스 생성
const primaryDb = drizzle(primaryClient);
const replicaDb = drizzle(replicaClient);

/**
 * 기본 DB 인스턴스 (Primary - 쓰기용)
 */
export const db = primaryDb;

/**
 * DB 연결 타입
 */
export type DbConnectionType = 'read' | 'write';

/**
 * Raw Drizzle DB 인스턴스 가져오기 (트랜잭션 없이 직접 사용)
 *
 * ⚠️ 주의: 이 함수는 AsyncLocalStorage 트랜잭션 컨텍스트를 무시합니다.
 * 일반적인 경우 `getDb()` from './db-context.js'를 사용하세요.
 *
 * @param type - 'read' (Replica) 또는 'write' (Primary)
 * @returns Raw Drizzle DB 인스턴스
 *
 * @example
 * // 읽기 전용 쿼리 (Replica 사용)
 * const users = await getRawDb('read').select().from(users);
 *
 * // 쓰기 쿼리 (Primary 사용)
 * await getRawDb('write').insert(users).values({ email: 'test@example.com' });
 */
export function getRawDb(type: DbConnectionType = 'write'): PostgresJsDatabase
{
    return type === 'read' ? replicaDb : primaryDb;
}