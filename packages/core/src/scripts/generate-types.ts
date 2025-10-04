/**
 * 타입 자동 생성 스크립트
 *
 * 엔티티로부터 API 타입 자동 생성
 * - Entity 타입 (Date → string)
 * - CreateDto
 * - UpdateDto
 *
 * ✅ 구현 완료:
 * - 엔티티 파일 자동 수집
 * - Date → string 변환 (JSON 직렬화 대응)
 * - CreateDto 생성 (id, createdAt, updatedAt 제외)
 * - UpdateDto 생성 (Partial<CreateDto>)
 * - 템플릿 기반 코드 생성
 * - index.ts 자동 생성
 *
 * ⚠️ 개선 필요:
 * - bigint 타입 처리 (number vs string 선택)
 * - enum 타입 자동 생성
 * - 복수형→단수형 변환 개선 (posts→post는 되지만 categories→category 등)
 *
 * 💡 향후 고려사항:
 * - nullable 필드 정확한 타입 추론
 * - 선택적 필드(optional) 구분
 * - JSON 필드 타입 추론
 * - array 필드 타입 추론
 * - 관계(relation) 타입 생성
 * - Zod 스키마 자동 생성
 * - 커스텀 타입 변환 규칙 설정
 *
 * 🔗 관련 파일:
 * - src/server/entities/ (소스 엔티티)
 * - src/types/generated/ (생성된 타입)
 * - src/server/scripts/templates/entity-type.template.txt (템플릿)
 * - package.json (generate:types 스크립트)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entitiesDir = join(__dirname, '..', 'entities');
const outputDir = join(__dirname, '..', '..', 'types', 'generated');
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
    // 복수형 → 단수형 (간단한 변환)
    const singular = entityName.endsWith('s') ? entityName.slice(0, -1) : entityName;
    return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/**
 * 타입 파일 생성
 */
function generateTypeFile(entityName: string): string
{
    const typeName = toTypeName(entityName);
    const now = new Date().toISOString();

    // 템플릿 파일 읽기
    const templatePath = join(templatesDir, 'entity-type.template.txt');
    const template = readFileSync(templatePath, 'utf-8');

    // 템플릿 변수 치환
    return template
        .replace(/\{\{ENTITY_NAME}}/g, entityName)
        .replace(/\{\{TYPE_NAME}}/g, typeName)
        .replace(/\{\{TIMESTAMP}}/g, now);
}

/**
 * index.ts 생성
 */
function generateIndexFile(entityNames: string[]): string
{
    const exports = entityNames.map(name => `export * from './${name}';`).join('\n');
    const now = new Date().toISOString();

    // 템플릿 파일 읽기
    const templatePath = join(templatesDir, 'index.template.txt');
    const template = readFileSync(templatePath, 'utf-8');

    // 템플릿 변수 치환
    return template
        .replace(/\{\{EXPORTS}}/g, exports)
        .replace(/\{\{TIMESTAMP}}/g, now);
}

/**
 * 메인 실행
 */
async function main()
{
    console.log('🔍 Collecting entity files...');

    const entityNames = collectEntityFiles();

    console.log(`📊 Found ${entityNames.length} entities: ${entityNames.join(', ')}`);

    console.log('✨ Generating types...');

    // 출력 디렉토리 생성
    if (!existsSync(outputDir))
    {
        mkdirSync(outputDir, { recursive: true });
    }

    // 각 엔티티별로 타입 파일 생성
    for (const entityName of entityNames)
    {
        const typeCode = generateTypeFile(entityName);
        const filePath = join(outputDir, `${entityName}.ts`);

        writeFileSync(filePath, typeCode, 'utf-8');

        console.log(`   ✓ ${entityName}.ts`);
    }

    // index.ts 생성
    const indexCode = generateIndexFile(entityNames);
    const indexPath = join(outputDir, 'index.ts');

    writeFileSync(indexPath, indexCode, 'utf-8');

    console.log(`\n✅ Types generated in: ${outputDir}`);
    console.log(`   Total: ${entityNames.length} entity files + index.ts`);
}

main().catch(error =>
{
    console.error('❌ Failed to generate types:', error);
    process.exit(1);
});