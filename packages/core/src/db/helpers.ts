/**
 * DB 헬퍼 함수
 *
 * 트랜잭션 컨텍스트를 자동으로 감지하여 적절한 DB 인스턴스를 반환합니다.
 *
 * ✅ 구현 완료:
 * - AsyncLocalStorage 기반 트랜잭션 감지
 * - 트랜잭션 없을 시 기본 DB 인스턴스 반환
 * - JPA 스타일 Repository 패턴 지원
 * - Drizzle 기본 기능 유지
 *
 * ⚠️ 개선 필요:
 * - 트랜잭션 중첩 감지 및 경고 로깅
 * - 트랜잭션 타임아웃 체크
 *
 * 💡 향후 고려사항:
 * - 강제로 기본 DB 사용하는 함수 추가 (useDefaultDb)
 * - Read Replica 자동 선택 (읽기 전용 쿼리 감지)
 * - 트랜잭션 통계 수집 (성공/실패/롤백 횟수)
 * - 트랜잭션 ID 반환 함수 (디버깅용)
 *
 * 🔗 관련 파일:
 * - src/server/core/async-context.ts (AsyncLocalStorage 구현)
 * - src/server/core/transaction.ts (Transactional 미들웨어)
 * - src/server/core/db/index.ts (기본 DB 인스턴스)
 * - src/server/core/db/wrapped-db.ts (WrappedDb 구현)
 * - src/server/core/db/repository.ts (Repository 구현)
 */
import { getTransaction } from '../async-context.js';

import { db as defaultDb } from './index.js';
import { WrappedDb } from './wrapped-db.js';

/**
 * DB 인스턴스 가져오기 (WrappedDb)
 *
 * - 트랜잭션 컨텍스트가 있으면: 트랜잭션 DB 반환
 * - 없으면: 기본 DB 반환
 * - WrappedDb로 래핑하여 Repository 패턴 + Drizzle 기능 모두 제공
 *
 * 사용법 1: Drizzle 직접 사용
 * ```typescript
 * export async function GET(c: RouteContext) {
 *   const db = getDb();
 *   const users = await db.select().from(users);
 *   return c.json(users);
 * }
 * ```
 *
 * 사용법 2: Repository 패턴
 * ```typescript
 * export async function GET(c: RouteContext) {
 *   const db = getDb();
 *   const userRepo = db.for(users);
 *   const result = await userRepo.findPage(pageable);
 *   return c.json(result);
 * }
 * ```
 *
 * @returns WrappedDb 인스턴스 (트랜잭션 또는 기본 DB)
 */
export function getDb(): WrappedDb
{
    const tx = getTransaction();
    const rawDb = tx ?? defaultDb;
    return new WrappedDb(rawDb);
}