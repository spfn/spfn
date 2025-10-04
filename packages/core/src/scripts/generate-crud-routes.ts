/**
 * CRUD 라우트 자동 생성 스크립트
 *
 * 엔티티로부터 기본 CRUD 라우트 자동 생성
 * - GET /entity - 목록 조회
 * - POST /entity - 생성
 * - GET /entity/:id - 단건 조회
 * - PATCH /entity/:id - 수정
 * - DELETE /entity/:id - 삭제
 *
 * ✅ 구현 완료:
 * - 엔티티 기반 CRUD 라우트 생성
 * - index.ts (GET, POST)
 * - [id].ts (GET, PATCH, DELETE)
 * - 404 에러 처리
 * - 타입 안전한 DTO 사용
 * - 기존 파일 스킵 (덮어쓰기 방지)
 * - 템플릿 기반 생성
 *
 * ⚠️ 개선 필요:
 * - 복수형→단수형 변환 개선
 * - 생성된 라우트에 트랜잭션 미들웨어 자동 추가 옵션
 *
 * 💡 향후 고려사항:
 * - 페이지네이션 자동 생성 (limit, offset, cursor)
 * - 필터링 자동 생성 (where 조건)
 * - 정렬 자동 생성 (orderBy)
 * - 검색 기능 자동 생성 (full-text search)
 * - Relation 기반 Join 라우트 (GET /users/:id/posts)
 * - Bulk 작업 라우트 (POST /users/bulk, DELETE /users/bulk)
 * - Soft delete 지원
 * - 권한 체크 미들웨어 자동 추가
 * - Rate limiting 미들웨어 자동 추가
 * - 입력 검증 (Zod) 자동 추가
 *
 * 🔗 관련 파일:
 * - src/server/entities/ (소스 엔티티)
 * - src/server/routes/ (생성된 라우트)
 * - src/server/scripts/templates/crud-*.template.txt (템플릿)
 * - package.json (generate:crud 스크립트)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entitiesDir = join(__dirname, '..', 'entities');
const routesDir = join(__dirname, '..', 'routes');
const templatesDir = join(__dirname, 'templates');

/**
 * 엔티티 파일 목록 수집
 */
function collectEntityFiles(): string[]
{
    return readdirSync(entitiesDir)
        .filter(file => file.endsWith('.ts') && file !== 'index.ts')
        .map(file => file.replace('.ts', ''));
}

/**
 * 엔티티명을 타입명으로 변환
 * users → User
 * posts → Post
 */
function toTypeName(entityName: string): string
{
    const singular = entityName.endsWith('s') ? entityName.slice(0, -1) : entityName;
    return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/**
 * 엔티티명을 단수형으로 변환
 * users → user
 */
function toSingular(entityName: string): string
{
    return entityName.endsWith('s') ? entityName.slice(0, -1) : entityName;
}

/**
 * index.ts 파일 생성 (GET, POST)
 */
function generateIndexFile(entityName: string): string
{
    const typeName = toTypeName(entityName);
    const singular = toSingular(entityName);
    const now = new Date().toISOString();

    const templatePath = join(templatesDir, 'crud-index.template.txt');
    const template = readFileSync(templatePath, 'utf-8');

    return template
        .replace(/\{\{ENTITY_NAME\}\}/g, entityName)
        .replace(/\{\{TYPE_NAME\}\}/g, typeName)
        .replace(/\{\{ENTITY_NAME_SINGULAR\}\}/g, singular)
        .replace(/\{\{TIMESTAMP\}\}/g, now);
}

/**
 * [id].ts 파일 생성 (GET, PATCH, DELETE)
 */
function generateIdFile(entityName: string): string
{
    const typeName = toTypeName(entityName);
    const singular = toSingular(entityName);
    const now = new Date().toISOString();

    const templatePath = join(templatesDir, 'crud-id.template.txt');
    const template = readFileSync(templatePath, 'utf-8');

    return template
        .replace(/\{\{ENTITY_NAME\}\}/g, entityName)
        .replace(/\{\{TYPE_NAME\}\}/g, typeName)
        .replace(/\{\{ENTITY_NAME_SINGULAR\}\}/g, singular)
        .replace(/\{\{TIMESTAMP\}\}/g, now);
}

/**
 * 메인 실행
 */
async function main()
{
    console.log('🔍 Collecting entity files...');

    const entityNames = collectEntityFiles();

    console.log(`📊 Found ${entityNames.length} entities: ${entityNames.join(', ')}`);

    console.log('✨ Generating CRUD routes...');

    let createdCount = 0;
    let skippedCount = 0;

    for (const entityName of entityNames)
    {
        const entityRouteDir = join(routesDir, entityName);

        // 엔티티별 라우트 디렉토리 생성
        if (!existsSync(entityRouteDir))
        {
            mkdirSync(entityRouteDir, { recursive: true });
        }

        // index.ts 생성 (기존 파일 있으면 스킵)
        const indexPath = join(entityRouteDir, 'index.ts');
        if (!existsSync(indexPath))
        {
            const indexCode = generateIndexFile(entityName);
            writeFileSync(indexPath, indexCode, 'utf-8');
            console.log(`   ✓ ${entityName}/index.ts (created)`);
            createdCount++;
        }
        else
        {
            console.log(`   ⊘ ${entityName}/index.ts (skipped - already exists)`);
            skippedCount++;
        }

        // [id].ts 생성 (기존 파일 있으면 스킵)
        const idPath = join(entityRouteDir, '[id].ts');
        if (!existsSync(idPath))
        {
            const idCode = generateIdFile(entityName);
            writeFileSync(idPath, idCode, 'utf-8');
            console.log(`   ✓ ${entityName}/[id].ts (created)`);
            createdCount++;
        }
        else
        {
            console.log(`   ⊘ ${entityName}/[id].ts (skipped - already exists)`);
            skippedCount++;
        }
    }

    console.log(`\n✅ CRUD routes generation complete!`);
    console.log(`   Created: ${createdCount} files`);
    console.log(`   Skipped: ${skippedCount} files (already exist)`);
    console.log(`   Total entities: ${entityNames.length}`);
}

main().catch(error =>
{
    console.error('❌ Failed to generate CRUD routes:', error);
    process.exit(1);
});