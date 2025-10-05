/**
 * API 클라이언트 자동 생성 스크립트
 *
 * 라우트 정보를 바탕으로 타입 안전한 클라이언트 API 생성
 * 태그별로 파일을 분리하여 생성
 *
 * ✅ 구현 완료:
 * - 라우트 자동 스캔 및 분석
 * - HTTP 메서드별 함수 생성
 * - 태그별 파일 분리 (모듈화)
 * - REST 네이밍 (POST→create, PATCH→patch, DELETE→delete)
 * - 타입 import 자동 수집
 * - 동적 파라미터 처리
 * - index.ts 통합 export
 *
 * ⚠️ 개선 필요:
 * - 응답 타입 자동 추론 (현재 제네릭)
 * - 함수명 중복 방지 (경로 기반 유니크 네이밍)
 * - Request DTO 타입 자동 연결
 *
 * 💡 향후 고려사항:
 * - React Query/SWR 훅 자동 생성
 * - Tanstack Query 훅 생성
 * - 에러 타입 정의 및 처리
 * - 요청/응답 인터셉터 지원
 * - 재시도 로직 자동 추가
 * - 캐싱 전략 설정
 * - WebSocket/SSE 클라이언트 생성
 * - OpenAPI 스펙 기반 생성
 * - Mock 데이터 생성
 *
 * 🔗 관련 파일:
 * - src/server/routes/ (소스 라우트)
 * - src/lib/api/ (생성된 API 클라이언트)
 * - src/server/core/fetch/wrapper.ts (HTTP 클라이언트)
 * - src/server/scripts/templates/api-*.template.txt (템플릿)
 * - package.json (generate:api 스크립트)
 */
import { config } from 'dotenv';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { RouteLoader } from '../route/route-loader.js';
import type { RouteDefinition } from '../route/types.js';

// Load environment variables
config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwd = process.cwd();
const routesDir = join(cwd, 'src', 'server', 'routes');
const outputDir = join(cwd, 'src', 'lib', 'api');
const templatesDir = join(__dirname, 'templates');

/**
 * 라우트 정보 수집
 */
async function collectRoutes(): Promise<RouteDefinition[]> {
  const loader = new RouteLoader(routesDir, false);

  // 임시 Hono 앱 생성 (라우트 정보만 필요)
  const { Hono } = await import('hono');
  const tempApp = new Hono();

  await loader.loadRoutes(tempApp);

  return loader.getRoutes();
}

/**
 * 경로를 함수명으로 변환
 * /users → getUsers
 * /users/:id → getUserById
 */
function pathToFunctionName(path: string, method: string): string {
  // POST는 create, PUT은 update로 매핑
  let methodPrefix = method.toLowerCase();
  if (method === 'POST') {
    methodPrefix = 'create';
  } else if (method === 'PUT') {
    methodPrefix = 'update';
  }

  // 파라미터 제거하고 세그먼트로 분리
  const segments = path
    .split('/')
    .filter(Boolean)
    .map(segment => {
      if (segment.startsWith(':')) {
        // :id → ById, :postId → ByPostId
        const paramName = segment.slice(1);
        return 'By' + paramName.charAt(0).toUpperCase() + paramName.slice(1);
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    });

  return methodPrefix + segments.join('');
}

/**
 * 파라미터 타입 생성
 */
function generateParamsType(params: string[]): string {
  if (params.length === 0) return '';

  const fields = params.map(p => `${p}: string`).join('; ');
  return `{ ${fields} }`;
}

/**
 * 경로에서 엔티티명 추출
 * /posts → posts
 * /users/:id → users
 */
function extractEntityFromPath(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // 첫 번째 세그먼트가 엔티티 (파라미터가 아닌 경우)
  const first = segments[0];
  return first.startsWith(':') ? null : first;
}

/**
 * 엔티티명을 타입명으로 변환
 * posts → Post
 * users → User
 */
function entityToTypeName(entity: string): string {
  const singular = entity.endsWith('s') ? entity.slice(0, -1) : entity;
  return singular.charAt(0).toUpperCase() + singular.slice(1);
}

/**
 * 메서드와 경로에 따른 타입 정보 생성
 */
function getTypeInfo(method: string, urlPath: string, hasParams: boolean) {
  const entity = extractEntityFromPath(urlPath);

  if (!entity) {
    return {
      requestType: 'unknown',
      responseType: 'unknown',
      imports: new Set<string>(),
    };
  }

  const typeName = entityToTypeName(entity);
  const imports = new Set<string>();
  let requestType = 'unknown';
  let responseType = 'unknown';

  // GET 메서드
  if (method === 'GET') {
    if (hasParams) {
      // GET /posts/:id → Post
      responseType = typeName;
      imports.add(typeName);
    } else {
      // GET /posts → Post[]
      responseType = `${typeName}[]`;
      imports.add(typeName);
    }
  }

  // POST 메서드
  else if (method === 'POST') {
    // POST /posts → Create{Type}Dto, {Type}
    requestType = `Create${typeName}Dto`;
    responseType = typeName;
    imports.add(`Create${typeName}Dto`);
    imports.add(typeName);
  }

  // PUT 메서드
  else if (method === 'PUT') {
    // PUT /posts/:id → Update{Type}Dto, {Type}
    requestType = `Update${typeName}Dto`;
    responseType = typeName;
    imports.add(`Update${typeName}Dto`);
    imports.add(typeName);
  }

  // PATCH 메서드
  else if (method === 'PATCH') {
    // PATCH /posts/:id → Update{Type}Dto, {Type}
    requestType = `Update${typeName}Dto`;
    responseType = typeName;
    imports.add(`Update${typeName}Dto`);
    imports.add(typeName);
  }

  // DELETE 메서드
  else if (method === 'DELETE') {
    // DELETE /posts/:id → { success: boolean }
    responseType = '{ success: boolean }';
  }

  return { requestType, responseType, imports };
}

/**
 * 태그별로 라우트 그룹핑
 */
function groupRoutesByTag(routes: RouteDefinition[]): Map<string, RouteDefinition[]>
{
    const tagGroups = new Map<string, RouteDefinition[]>();

    for (const route of routes)
    {
        const tags = route.meta?.tags || ['default'];
        const primaryTag = tags[0]; // 첫 번째 태그를 대표 태그로 사용

        if (!tagGroups.has(primaryTag))
        {
            tagGroups.set(primaryTag, []);
        }

        tagGroups.get(primaryTag)!.push(route);
    }

    return tagGroups;
}

/**
 * 단일 함수 코드 생성
 */
function generateFunction(urlPath: string, method: string, route: RouteDefinition): {
    code: string;
    imports: Set<string>;
}
{
    const functionName = pathToFunctionName(urlPath, method);
    const hasParams = route.params.length > 0;
    const paramsType = hasParams ? generateParamsType(route.params) : '';

    // 타입 정보 추출
    const typeInfo = getTypeInfo(method, urlPath, hasParams);

    let signature: string;
    let fetchCall: string;
    let returnType: string;

    if (method === 'GET' || method === 'DELETE')
    {
        const methodName = method === 'DELETE' ? 'del' : method.toLowerCase();
        returnType = typeInfo.responseType;

        if (hasParams)
        {
            signature = `(params: ${paramsType})`;
            fetchCall = `${methodName}<${returnType}>('${urlPath}', { params })`;
        }
        else
        {
            signature = `()`;
            fetchCall = `${methodName}<${returnType}>('${urlPath}')`;
        }
    }
    else
    {
        const methodName = method.toLowerCase();
        returnType = typeInfo.responseType;
        const requestType = typeInfo.requestType;

        if (hasParams)
        {
            signature = `(params: ${paramsType}, body: ${requestType})`;
            fetchCall = `${methodName}<${requestType}, ${returnType}>('${urlPath}', { params, body })`;
        }
        else
        {
            signature = `(body: ${requestType})`;
            fetchCall = `${methodName}<${requestType}, ${returnType}>('${urlPath}', { body })`;
        }
    }

    const code = `
/**
 * ${method} ${urlPath}
 * ${route.meta?.description || ''}
 */
export async function ${functionName}${signature}: Promise<${returnType}>
{
    return ${fetchCall};
}`;

    return { code, imports: typeInfo.imports };
}

/**
 * 태그별 API 파일 생성
 */
function generateTagFile(tag: string, routes: RouteDefinition[]): string
{
    const functions: string[] = [];
    const allImports = new Set<string>();

    // HTTP 메서드별로 라우트 그룹핑
    const methodsMap = new Map<string, Map<string, RouteDefinition>>();

    for (const route of routes)
    {
        const honoRoutes = (route.honoInstance as any).routes || [];

        for (const honoRoute of honoRoutes)
        {
            const method = honoRoute.method as string;

            if (!methodsMap.has(route.urlPath))
            {
                methodsMap.set(route.urlPath, new Map());
            }

            methodsMap.get(route.urlPath)!.set(method, route);
        }
    }

    // 각 라우트에 대해 함수 생성 및 import 수집
    for (const [urlPath, methodMap] of methodsMap)
    {
        for (const [method, route] of methodMap)
        {
            const result = generateFunction(urlPath, method, route);
            functions.push(result.code);

            // import 수집
            result.imports.forEach(imp => allImports.add(imp));
        }
    }

    // import 문 생성
    const importStatement = allImports.size > 0
        ? `import type { ${Array.from(allImports).join(', ')} } from '@/types/generated';\n`
        : '';

    // 템플릿 파일 읽기
    const templatePath = join(templatesDir, 'api-tag.template.txt');
    const template = readFileSync(templatePath, 'utf-8');
    const now = new Date().toISOString();

    // 템플릿 변수 치환
    return template
        .replace(/\{\{TAG_NAME}}/g, tag)
        .replace(/\{\{IMPORTS}}/g, importStatement)
        .replace(/\{\{FUNCTIONS}}/g, functions.join('\n'))
        .replace(/\{\{TIMESTAMP}}/g, now);
}

/**
 * index.ts 생성 (re-export)
 */
function generateIndexFile(tags: string[]): string
{
    const exports = tags.map(tag => `export * from './${tag}';`).join('\n');

    // 템플릿 파일 읽기
    const templatePath = join(templatesDir, 'api-index.template.txt');
    const template = readFileSync(templatePath, 'utf-8');
    const now = new Date().toISOString();

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
    console.log('🔍 Collecting route information...');

    const routes = await collectRoutes();

    console.log(`📊 Found ${routes.length} routes`);

    console.log('✨ Generating API client by tags...');

    // 출력 디렉토리 생성
    if (!existsSync(outputDir))
    {
        mkdirSync(outputDir, { recursive: true });
    }

    // 태그별로 라우트 그룹핑
    const tagGroups = groupRoutesByTag(routes);

    const tags: string[] = [];

    // 각 태그별로 파일 생성
    for (const [tag, tagRoutes] of tagGroups)
    {
        const code = generateTagFile(tag, tagRoutes);
        const filePath = join(outputDir, `${tag}.ts`);

        writeFileSync(filePath, code, 'utf-8');
        tags.push(tag);

        console.log(`   ✓ ${tag}.ts (${tagRoutes.length} routes)`);
    }

    // index.ts 생성 (re-export)
    const indexCode = generateIndexFile(tags);
    const indexPath = join(outputDir, 'index.ts');

    writeFileSync(indexPath, indexCode, 'utf-8');

    console.log(`\n✅ API client generated in: ${outputDir}`);
    console.log(`   Total: ${tags.length} tag files + index.ts`);
}

main().catch(error =>
{
    console.error('❌ Failed to generate API client:', error);
    process.exit(1);
});