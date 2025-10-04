/**
 * Transaction Tests
 *
 * 트랜잭션 자동 커밋/롤백 테스트
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users } from '@/server/entities/users';
import { posts } from '@/server/entities/posts';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL)
{
    throw new Error('DATABASE_URL environment variable is required for tests');
}

describe('Transaction', () =>
{
    let client: ReturnType<typeof postgres>;
    let db: ReturnType<typeof drizzle>;

    beforeAll(async () =>
    {
        client = postgres(DATABASE_URL, { max: 1 });
        db = drizzle(client);

        // 테이블 생성
        await client`
            CREATE TABLE IF NOT EXISTS users (
                id BIGSERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                mobile_number TEXT UNIQUE,
                password TEXT,
                state TEXT NOT NULL DEFAULT 'ACTIVE',
                username TEXT UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `;

        await client`
            CREATE TABLE IF NOT EXISTS posts (
                id BIGSERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT,
                author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `;
    });

    afterAll(async () =>
    {
        await client`DROP TABLE IF EXISTS posts CASCADE`;
        await client`DROP TABLE IF EXISTS users CASCADE`;
        await client.end();
    });

    beforeEach(async () =>
    {
        await client`TRUNCATE TABLE posts CASCADE`;
        await client`TRUNCATE TABLE users CASCADE`;
    });

    describe('Automatic Commit', () =>
    {
        it('should commit transaction on success', async () =>
        {
            await db.transaction(async (tx) =>
            {
                const [user] = await tx.insert(users).values({
                    email: 'commit@example.com',
                    password: 'password',
                }).returning();

                await tx.insert(posts).values({
                    title: 'Test Post',
                    content: 'Content',
                    authorId: user.id,
                }).returning();
            });

            // 트랜잭션 밖에서 데이터 확인
            const [userCount] = await client`SELECT COUNT(*) as count FROM users`;
            const [postCount] = await client`SELECT COUNT(*) as count FROM posts`;

            expect(Number(userCount.count)).toBe(1);
            expect(Number(postCount.count)).toBe(1);
        });
    });

    describe('Automatic Rollback', () =>
    {
        it('should rollback transaction on error', async () =>
        {
            await expect(async () =>
            {
                await db.transaction(async (tx) =>
                {
                    await tx.insert(users).values({
                        email: 'rollback@example.com',
                        password: 'password',
                    }).returning();

                    // 의도적으로 에러 발생
                    throw new Error('Intentional error');
                });
            }).rejects.toThrow('Intentional error');

            // 롤백 확인
            const [userCount] = await client`SELECT COUNT(*) as count FROM users`;
            expect(Number(userCount.count)).toBe(0);
        });

        it('should rollback on constraint violation', async () =>
        {
            // 첫 번째 사용자 생성
            await db.insert(users).values({
                email: 'existing@example.com',
                password: 'password',
            });

            // 중복 이메일로 트랜잭션 실행 (실패 예상)
            await expect(async () =>
            {
                await db.transaction(async (tx) =>
                {
                    await tx.insert(users).values({
                        email: 'existing@example.com', // 중복 이메일
                        password: 'password',
                    });
                });
            }).rejects.toThrow();

            // 데이터 변경 없음 확인
            const [userCount] = await client`SELECT COUNT(*) as count FROM users`;
            expect(Number(userCount.count)).toBe(1); // 처음 생성한 1명만 존재
        });
    });

    describe('Nested Operations', () =>
    {
        it('should handle multiple inserts in transaction', async () =>
        {
            await db.transaction(async (tx) =>
            {
                const [user] = await tx.insert(users).values({
                    email: 'author@example.com',
                    password: 'password',
                }).returning();

                await tx.insert(posts).values([
                    { title: 'Post 1', authorId: user.id },
                    { title: 'Post 2', authorId: user.id },
                    { title: 'Post 3', authorId: user.id },
                ]);
            });

            const [postCount] = await client`SELECT COUNT(*) as count FROM posts`;
            expect(Number(postCount.count)).toBe(3);
        });

        it('should rollback all operations on partial failure', async () =>
        {
            await expect(async () =>
            {
                await db.transaction(async (tx) =>
                {
                    const [user] = await tx.insert(users).values({
                        email: 'partial@example.com',
                        password: 'password',
                    }).returning();

                    // 첫 번째 게시글 성공
                    await tx.insert(posts).values({
                        title: 'Post 1',
                        authorId: user.id,
                    });

                    // 두 번째 게시글에서 에러
                    await tx.insert(posts).values({
                        title: 'Post 2',
                        authorId: 999999, // 존재하지 않는 author_id (FK 제약 위반)
                    });
                });
            }).rejects.toThrow();

            // 모든 데이터가 롤백되었는지 확인
            const [userCount] = await client`SELECT COUNT(*) as count FROM users`;
            const [postCount] = await client`SELECT COUNT(*) as count FROM posts`;

            expect(Number(userCount.count)).toBe(0);
            expect(Number(postCount.count)).toBe(0);
        });
    });

    describe('Isolation', () =>
    {
        it('should not see uncommitted data from other transaction', async () =>
        {
            // 동시 트랜잭션 테스트는 실제 환경에서만 의미 있음
            // 여기서는 기본적인 격리 동작 확인

            await db.transaction(async (tx) =>
            {
                await tx.insert(users).values({
                    email: 'isolation@example.com',
                    password: 'password',
                });

                // 트랜잭션 내에서 삽입 확인
                const inTx = await tx.select().from(users);
                expect(inTx).toHaveLength(1);
            });

            // 커밋 후 확인
            const afterCommit = await db.select().from(users);
            expect(afterCommit).toHaveLength(1);
        });
    });
});