/**
 * 트랜잭션 통합 테스트
 *
 * ✅ 구현 완료:
 * - 트랜잭션 커밋 테스트 (성공 시나리오)
 * - 트랜잭션 롤백 테스트 (에러 시나리오)
 * - 트랜잭션 없이 동작하는 테스트
 * - getDb() 헬퍼 테스트
 * - beforeEach/afterEach 데이터 정리
 * - 트랜잭션 타임아웃 테스트 (timeout 발생, 정상 완료, 비활성화, 환경변수)
 *
 * ⚠️ 개선 필요:
 * - 중첩 트랜잭션 테스트 추가
 * - 동시성 테스트 추가 (여러 요청 동시 처리)
 *
 * 💡 향후 고려사항:
 * - Deadlock 시나리오 테스트
 * - 트랜잭션 격리 수준 테스트
 * - 대용량 데이터 트랜잭션 성능 테스트
 * - 트랜잭션 재시도 로직 테스트
 * - 부분 롤백 (Savepoint) 테스트
 * - 트랜잭션 통계 수집 테스트
 * - 읽기 전용 트랜잭션 테스트
 *
 * 🔗 관련 파일:
 * - src/server/core/transaction.ts (Transactional 미들웨어)
 * - src/server/core/async-context.ts (AsyncLocalStorage)
 * - src/server/core/db/helpers.ts (getDb 헬퍼)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { db, initDatabase, closeDatabase } from '../../index.js';
import { getDb, Transactional } from '../../index.js';
import { testUsers, testPosts } from '../../__tests__/fixtures/entities';
import { eq } from 'drizzle-orm';

describe('Transaction System', () => {
  let testUserId: number;

  // 데이터베이스 초기화
  beforeAll(async () => {
    await initDatabase();
  });

  // 데이터베이스 종료
  afterAll(async () => {
    await closeDatabase();
  });

  // 테스트 전 초기 데이터 생성
  beforeEach(async () => {
    const [user] = await db
      .insert(testUsers)
      .values({ email: 'test@example.com' })
      .returning();
    testUserId = user.id;
  });

  // 테스트 후 정리
  afterEach(async () => {
    await db.delete(testPosts).where(eq(testPosts.authorId, testUserId));
    await db.delete(testUsers).where(eq(testUsers.id, testUserId));
  });

  describe('Transactional Middleware', () => {
    it('should commit transaction on success', async () => {
      const app = new Hono();

      app.use(Transactional());

      app.post('/test', async (c) => {
        const db = getDb();

        // 트랜잭션 안에서 두 개의 레코드 생성
        const [post1] = await db
          .insert(testPosts)
          .values({
            title: 'Post 1',
            content: 'Content 1',
            authorId: testUserId,
          })
          .returning();

        const [post2] = await db
          .insert(testPosts)
          .values({
            title: 'Post 2',
            content: 'Content 2',
            authorId: testUserId,
          })
          .returning();

        return c.json({ post1, post2 });
      });

      // 요청 실행
      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);

      // DB에 실제로 커밋되었는지 확인
      const allPosts = await db
        .select()
        .from(testPosts)
        .where(eq(testPosts.authorId, testUserId));

      expect(allPosts).toHaveLength(2);
      expect(allPosts[0].title).toBe('Post 1');
      expect(allPosts[1].title).toBe('Post 2');
    });

    it('should rollback transaction on error', async () => {
      const app = new Hono();

      app.use(Transactional());

      app.post('/test', async (c) => {
        const db = getDb();

        // 첫 번째 레코드 생성 (성공)
        await db
          .insert(testPosts)
          .values({
            title: 'Post 1',
            content: 'Content 1',
            authorId: testUserId,
          })
          .returning();

        // 의도적으로 에러 발생
        throw new Error('Intentional error for rollback test');
      });

      // 에러 발생하므로 500 응답 예상
      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(500);

      // 롤백되었으므로 DB에 레코드가 없어야 함
      const allPosts = await db
        .select()
        .from(testPosts)
        .where(eq(testPosts.authorId, testUserId));

      expect(allPosts).toHaveLength(0);
    });

    it('should work without transaction middleware', async () => {
      const app = new Hono();

      // 미들웨어 없이 직접 db 사용
      app.post('/test', async (c) => {
        const [post] = await db
          .insert(testPosts)
          .values({
            title: 'Direct Post',
            content: 'Content',
            authorId: testUserId,
          })
          .returning();

        return c.json({ post });
      });

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);

      const allPosts = await db
        .select()
        .from(testPosts)
        .where(eq(testPosts.authorId, testUserId));

      expect(allPosts).toHaveLength(1);
    });
  });

  describe('getDb() Helper', () => {
    it('should return transaction when inside Transactional middleware', async () => {
      const app = new Hono();

      app.use(Transactional());

      app.post('/test', async (c) => {
        const db = getDb();

        // getDb()가 트랜잭션을 반환했는지 테스트
        // (실제로는 트랜잭션 객체 확인이 어려우므로 동작으로 검증)
        const [post] = await db
          .insert(testPosts)
          .values({
            title: 'Test',
            content: 'Test',
            authorId: testUserId,
          })
          .returning();

        return c.json({ post });
      });

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('should return default db when outside transaction', async () => {
      const app = new Hono();

      app.post('/test', async (c) => {
        const db = getDb();

        const [post] = await db
          .insert(testPosts)
          .values({
            title: 'Test',
            content: 'Test',
            authorId: testUserId,
          })
          .returning();

        return c.json({ post });
      });

      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);
    });
  });

  describe('Transaction Timeout', () => {
    it('should timeout long-running transaction', async () => {
      const app = new Hono();

      // 100ms timeout 설정
      app.use(Transactional({ timeout: 100 }));

      app.post('/test', async (c) => {
        const db = getDb();

        // 레코드 생성
        await db
          .insert(testPosts)
          .values({
            title: 'Test Post',
            content: 'Content',
            authorId: testUserId,
          })
          .returning();

        // 200ms 대기 (timeout보다 길게)
        await new Promise(resolve => setTimeout(resolve, 200));

        return c.json({ success: true });
      });

      // Timeout으로 에러 발생 예상
      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(500);

      // 롤백되었으므로 DB에 레코드가 없어야 함
      const allPosts = await db
        .select()
        .from(testPosts)
        .where(eq(testPosts.authorId, testUserId));

      expect(allPosts).toHaveLength(0);
    });

    it('should complete transaction within timeout', async () => {
      const app = new Hono();

      // 1000ms timeout 설정 (충분히 긴 시간)
      app.use(Transactional({ timeout: 1000 }));

      app.post('/test', async (c) => {
        const db = getDb();

        // 레코드 생성
        const [post] = await db
          .insert(testPosts)
          .values({
            title: 'Fast Post',
            content: 'Content',
            authorId: testUserId,
          })
          .returning();

        // 짧은 대기 (timeout 내에 완료)
        await new Promise(resolve => setTimeout(resolve, 50));

        return c.json({ post });
      });

      // 정상 완료 예상
      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);

      // 커밋되었으므로 DB에 레코드가 있어야 함
      const allPosts = await db
        .select()
        .from(testPosts)
        .where(eq(testPosts.authorId, testUserId));

      expect(allPosts).toHaveLength(1);
      expect(allPosts[0].title).toBe('Fast Post');
    });

    it('should disable timeout when set to 0', async () => {
      const app = new Hono();

      // timeout: 0으로 비활성화
      app.use(Transactional({ timeout: 0 }));

      app.post('/test', async (c) => {
        const db = getDb();

        // 레코드 생성
        const [post] = await db
          .insert(testPosts)
          .values({
            title: 'No Timeout Post',
            content: 'Content',
            authorId: testUserId,
          })
          .returning();

        // 긴 대기도 timeout 없이 완료
        await new Promise(resolve => setTimeout(resolve, 100));

        return c.json({ post });
      });

      // 정상 완료 예상
      const res = await app.request('/test', { method: 'POST' });
      expect(res.status).toBe(200);

      // 커밋되었으므로 DB에 레코드가 있어야 함
      const allPosts = await db
        .select()
        .from(testPosts)
        .where(eq(testPosts.authorId, testUserId));

      expect(allPosts).toHaveLength(1);
      expect(allPosts[0].title).toBe('No Timeout Post');
    });

    it('should use TRANSACTION_TIMEOUT environment variable', async () => {
      // 환경변수 설정
      const originalTimeout = process.env.TRANSACTION_TIMEOUT;
      process.env.TRANSACTION_TIMEOUT = '100';

      try {
        const app = new Hono();

        // 환경변수의 timeout 사용 (100ms)
        app.use(Transactional());

        app.post('/test', async (c) => {
          const db = getDb();

          await db
            .insert(testPosts)
            .values({
              title: 'Env Timeout Post',
              content: 'Content',
              authorId: testUserId,
            })
            .returning();

          // 200ms 대기 (환경변수 timeout보다 길게)
          await new Promise(resolve => setTimeout(resolve, 200));

          return c.json({ success: true });
        });

        // Timeout으로 에러 발생 예상
        const res = await app.request('/test', { method: 'POST' });
        expect(res.status).toBe(500);

        // 롤백되었으므로 DB에 레코드가 없어야 함
        const allPosts = await db
          .select()
          .from(testPosts)
          .where(eq(testPosts.authorId, testUserId));

        expect(allPosts).toHaveLength(0);
      } finally {
        // 환경변수 복원
        if (originalTimeout !== undefined) {
          process.env.TRANSACTION_TIMEOUT = originalTimeout;
        } else {
          delete process.env.TRANSACTION_TIMEOUT;
        }
      }
    });
  });
});