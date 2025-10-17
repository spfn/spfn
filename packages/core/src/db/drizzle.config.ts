/**
 * Drizzle Kit Configuration
 *
 * 마이그레이션 및 DB 관리 도구 설정
 *
 * 환경변수:
 * - DATABASE_URL: PostgreSQL 연결 문자열 (필수)
 * - DRIZZLE_SCHEMA_PATH: 스키마 파일 경로 (기본: ./src/server/entities/index.ts)
 * - DRIZZLE_OUT_DIR: 마이그레이션 출력 디렉토리 (기본: ./drizzle)
 *
 * ✅ 구현 완료:
 * - 환경변수 기반 설정
 * - PostgreSQL dialect 설정
 * - 스키마 경로 커스터마이징
 * - 마이그레이션 출력 경로 커스터마이징
 *
 * ⚠️ 개선 필요:
 * - 마이그레이션 전략 문서화 (generate vs push)
 * - 프로덕션 마이그레이션 안전 가이드
 *
 * 💡 향후 고려사항:
 * - 마이그레이션 롤백 전략
 * - 마이그레이션 테스트 자동화
 * - 스키마 변경 감지 및 경고
 * - 다중 데이터베이스 지원
 *
 * 🔗 관련 파일:
 * - src/server/entities/index.ts (스키마 정의)
 * - package.json (db:* 스크립트)
 * - drizzle/ (생성된 마이그레이션 파일)
 */
import { defineConfig } from 'drizzle-kit';
import { loadEnvironment } from '../env/index.js';

// Load environment variables
loadEnvironment();

const DATABASE_URL = process.env.DATABASE_URL;
const SCHEMA_PATH = process.env.DRIZZLE_SCHEMA_PATH || './src/server/entities/index.ts';
const OUT_DIR = process.env.DRIZZLE_OUT_DIR || './drizzle';

if (!DATABASE_URL)
{
    throw new Error('DATABASE_URL environment variable is required');
}

export default defineConfig({
    schema: SCHEMA_PATH,
    out: OUT_DIR,
    dialect: 'postgresql',
    dbCredentials: {
        url: DATABASE_URL,
    },
});