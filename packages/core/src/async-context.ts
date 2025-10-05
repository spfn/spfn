/**
 * AsyncLocalStorage 기반 트랜잭션 컨텍스트
 *
 * Node.js AsyncLocalStorage를 사용하여 트랜잭션을 비동기 체인 전체에 전파합니다.
 *
 * ✅ 구현 완료:
 * - AsyncLocalStorage 기반 컨텍스트 관리
 * - 트랜잭션 저장/조회 함수
 * - 타입 안전한 트랜잭션 전파
 * - 비동기 체인 전체에 트랜잭션 전달
 *
 * ⚠️ 개선 필요:
 * - 중첩 트랜잭션 처리 (현재 외부 트랜잭션 무시됨)
 * - 트랜잭션 타임아웃 감지
 *
 * 💡 향후 고려사항:
 * - 트랜잭션 ID 추가 (디버깅/추적용)
 * - 트랜잭션 시작 시간 추적 (성능 모니터링)
 * - 트랜잭션 메타데이터 저장 (라우트 정보, 사용자 정보 등)
 * - Savepoint 지원 (중첩 트랜잭션)
 * - 트랜잭션 격리 수준 설정
 *
 * 🔗 관련 파일:
 * - src/server/core/transaction.ts (Transactional 미들웨어)
 * - src/server/core/db/helpers.ts (getDb 헬퍼)
 */
import { AsyncLocalStorage } from 'async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * 트랜잭션 DB 타입
 * Record<string, never>는 빈 스키마를 의미하며, 실제 스키마는 런타임에 결정됩니다.
 */
export type TransactionDB = PostgresJsDatabase<Record<string, never>>;

export type TransactionContext = {
  tx: TransactionDB;
};

export const asyncContext = new AsyncLocalStorage<TransactionContext>();

/**
 * 현재 트랜잭션 가져오기
 *
 * @returns 트랜잭션이 있으면 트랜잭션, 없으면 null
 */
export function getTransaction(): TransactionDB | null {
  const context = asyncContext.getStore();
  return context?.tx ?? null;
}

/**
 * 트랜잭션 컨텍스트에서 함수 실행
 *
 * @param tx - Drizzle 트랜잭션 객체
 * @param callback - 트랜잭션 컨텍스트에서 실행할 함수
 * @returns callback의 반환값
 */
export function runWithTransaction<T>(
  tx: TransactionDB,
  callback: () => Promise<T>
): Promise<T> {
  return asyncContext.run({ tx }, callback);
}