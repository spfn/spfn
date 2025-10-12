/**
 * Database Migration Script
 *
 * 프로덕션 배포 시 마이그레이션 파일을 실제 DB에 적용
 *
 * 사용법:
 * ```bash
 * npm run db:migrate
 * # 또는
 * tsx src/server/scripts/migrate.ts
 * ```
 *
 * 동작:
 * 1. drizzle/ 폴더의 마이그레이션 파일 읽기
 * 2. 적용되지 않은 마이그레이션만 순차 실행
 * 3. 성공 시 마이그레이션 히스토리 기록
 * 4. 실패 시 롤백 및 에러 로그
 *
 * 환경변수:
 * - DATABASE_URL: PostgreSQL 연결 문자열 (필수)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as postgres from 'postgres';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// .env.local 로드
config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../..');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL)
{
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
}

async function runMigrations()
{
    console.log('🔄 Starting database migration...');
    console.log(`📂 Migrations folder: ${join(projectRoot, 'drizzle')}`);

    // Connection for migration (max 1 connection)
    const migrationConnection = postgres(DATABASE_URL!, { max: 1 });
    const db = drizzle(migrationConnection);

    try
    {
        console.log('⏳ Applying migrations...');

        await migrate(db, {
            migrationsFolder: join(projectRoot, 'drizzle'),
        });

        console.log('✅ Migration completed successfully');
    }
    catch (error)
    {
        console.error('❌ Migration failed:', error);
        throw error;
    }
    finally
    {
        // Close connection
        await migrationConnection.end();
        console.log('🔌 Database connection closed');
    }
}

// Run migrations
runMigrations()
    .then(() =>
    {
        console.log('🎉 All migrations applied');
        process.exit(0);
    })
    .catch((error) =>
    {
        console.error('💥 Migration process failed:', error);
        process.exit(1);
    });