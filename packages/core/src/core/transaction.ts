/**
 * Transactional 미들웨어
 *
 * 라우트 핸들러를 트랜잭션으로 래핑합니다.
 * 성공 시 자동 커밋, 에러 시 자동 롤백
 *
 * ✅ 구현 완료:
 * - 자동 트랜잭션 시작/커밋/롤백
 * - AsyncLocalStorage를 통한 트랜잭션 전파
 * - Hono Context 에러 감지
 * - getDb() 헬퍼와 통합
 * - 타입 안전성 개선 (TransactionDB 타입 사용, @ts-ignore 제거)
 * - 트랜잭션 로깅 (시작/커밋/롤백)
 * - 실행 시간 측정 및 슬로우 트랜잭션 경고
 * - 트랜잭션 ID 추적 (디버깅용)
 *
 * ⚠️ 개선 필요:
 * - 트랜잭션 타임아웃 설정 추가
 * - 중첩 트랜잭션 감지 및 경고
 *
 * 💡 향후 고려사항:
 * - 트랜잭션 격리 수준 설정 옵션
 * - 읽기 전용 트랜잭션 모드
 * - 트랜잭션 재시도 로직 (Deadlock 발생 시)
 * - 트랜잭션 이벤트 훅 (beforeCommit, afterCommit, onRollback)
 *
 * 🔗 관련 파일:
 * - src/server/core/async-context.ts (AsyncLocalStorage)
 * - src/server/core/db/helpers.ts (getDb 헬퍼)
 * - src/server/tests/transaction/transaction.test.ts (테스트)
 *
 * 📝 TODO: improvements.md 참고
 * - #13: 트랜잭션 격리 수준 설정 (withTransaction({ isolationLevel: 'SERIALIZABLE' }))
 * - 중첩 트랜잭션 savepoint 지원
 * - 트랜잭션 타임아웃 설정
 */
import { createMiddleware } from 'hono/factory';
import { db } from '@/server/core/db';
import { runWithTransaction, type TransactionDB } from './async-context';
import { logger } from './logger';
import { TransactionError, fromPostgresError } from './errors';

/**
 * 트랜잭션 미들웨어 옵션
 */
export interface TransactionalOptions {
  /**
   * 슬로우 트랜잭션 경고 임계값 (밀리초)
   * @default 1000 (1초)
   */
  slowThreshold?: number;

  /**
   * 트랜잭션 로깅 활성화
   * @default true
   */
  enableLogging?: boolean;
}

/**
 * 트랜잭션 미들웨어
 *
 * 사용법:
 * ```typescript
 * export const middlewares = [Transactional()];
 *
 * export async function POST(c: RouteContext) {
 *   // 모든 DB 작업이 트랜잭션 안에서 실행됨
 *   const [user] = await db.insert(users).values(body).returning();
 *   await db.insert(profiles).values({ userId: user.id });
 *   // 성공 시 자동 커밋
 *   return c.json(user, 201);
 * }
 * ```
 *
 * 🔄 트랜잭션 동작:
 * - 성공 시: 자동 커밋
 * - 에러 발생 시: 자동 롤백
 * - context.error를 감지하여 롤백 트리거
 *
 * 📊 트랜잭션 로깅:
 * - 트랜잭션 시작/커밋/롤백 자동 로깅
 * - 실행 시간 측정 및 기록
 * - 슬로우 트랜잭션 경고 (기본: 1초 이상)
 */
export function Transactional(options: TransactionalOptions = {}) {
  const {
    slowThreshold = 1000,
    enableLogging = true,
  } = options;

  const txLogger = logger.child('transaction');

  return createMiddleware(async (c, next) => {
    // 트랜잭션 ID 생성 (간단한 ID, 디버깅용)
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const route = `${c.req.method} ${c.req.path}`;

    if (enableLogging) {
      txLogger.debug('Transaction started', { txId, route });
    }

    try {
      // 트랜잭션 시작
      await db.transaction(async (tx) => {
        // AsyncLocalStorage에 트랜잭션 저장
        await runWithTransaction(tx as TransactionDB, async () => {
          // 핸들러 실행
          await next();

          // Hono가 에러를 catch하고 context.error에 저장하는 경우 감지
          // Context 타입에 error 속성이 공식적으로 정의되어 있지 않으므로 타입 확장
          type ContextWithError = typeof c & { error?: Error };
          const contextWithError = c as ContextWithError;
          if (contextWithError.error) {
            // 트랜잭션 롤백을 위해 에러 throw
            throw contextWithError.error;
          }

          // 성공 시 자동 커밋 (Drizzle이 자동 처리)
        });
      });

      // 트랜잭션 성공 (커밋)
      const duration = Date.now() - startTime;

      if (enableLogging) {
        if (duration >= slowThreshold) {
          txLogger.warn('Slow transaction committed', {
            txId,
            route,
            duration: `${duration}ms`,
            threshold: `${slowThreshold}ms`,
          });
        } else {
          txLogger.debug('Transaction committed', {
            txId,
            route,
            duration: `${duration}ms`,
          });
        }
      }
    } catch (error) {
      // 트랜잭션 실패 (롤백)
      const duration = Date.now() - startTime;

      // PostgreSQL 에러를 커스텀 에러로 변환
      const customError = fromPostgresError(error);

      if (enableLogging) {
        txLogger.error('Transaction rolled back', {
          txId,
          route,
          duration: `${duration}ms`,
          error: customError.message,
          errorType: customError.name,
        });
      }

      // 에러 재throw (Hono의 에러 핸들러로 전달)
      throw customError;
    }
  });
}