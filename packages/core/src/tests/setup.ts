/**
 * Vitest Global Setup
 *
 * 모든 테스트 실행 전 초기화
 *
 * ⚠️ 주의: 개발용 엔티티(users, posts)가 아닌
 * 테스트 전용 Fixture 엔티티(test_users, test_posts)를 사용합니다.
 *
 * 이유: 개발자가 엔티티를 변경해도 프레임워크 테스트가 영향받지 않도록
 */

import { config } from 'dotenv';
import { beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

// 테스트용 환경변수 로드
config({ path: '.env.test' });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL)
{
    throw new Error('DATABASE_URL environment variable is required for tests');
}

// 전역 setup
beforeAll(async () =>
{
    console.log('🧪 Test setup started');

    // 테스트 DB에 Fixture 테이블 생성 (멱등성 보장)
    const client = postgres(DATABASE_URL, { max: 1 });

    try
    {
        // test_users 테이블 생성
        await client`
            CREATE TABLE IF NOT EXISTS test_users (
                id BIGSERIAL PRIMARY KEY,
                email TEXT UNIQUE,
                name TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `;

        // test_posts 테이블 생성
        await client`
            CREATE TABLE IF NOT EXISTS test_posts (
                id BIGSERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT,
                author_id BIGINT NOT NULL REFERENCES test_users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `;

        console.log('✅ Test fixture tables ready (test_users, test_posts)');
    }
    finally
    {
        await client.end();
    }
});

// 전역 cleanup
afterAll(async () =>
{
    console.log('🧹 Test cleanup completed');
});