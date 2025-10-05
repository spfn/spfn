import type { Context } from 'hono';
import { Hono } from 'hono';

import type { RouteDefinition, RouteFile, RouteHandler, RouteModule } from './types';
import { RoutePriority } from './types';

/**
 * RouteMapper: 파일 기반 라우트를 Hono 라우트로 변환
 *
 * ## 주요 역할
 * 1. **파일 → 라우트 변환**: RouteFile을 Hono가 이해하는 RouteDefinition으로 변환
 * 2. **HTTP 메서드 핸들러 처리**: Next.js App Router 스타일(export function GET) → Hono 인스턴스
 * 3. **RouteContext 래핑**: Hono Context에 params, query, data 편의 메서드 주입
 * 4. **URL 경로 생성**: 파일 경로 → URL 경로 ([id] → :id, [...slug] → *)
 * 5. **우선순위 계산**: 정적(1) > 동적(2) > catch-all(3)
 *
 * ## 변환 예시
 * ```
 * 파일: src/server/routes/users/[id].ts
 * export async function GET(c: RouteContext) { ... }
 *
 * 변환 결과:
 * - URL 경로: /users/:id
 * - HTTP 메서드: GET
 * - 우선순위: 2 (DYNAMIC)
 * - 파라미터: ['id']
 * - Hono 인스턴스: new Hono().get('/', wrapHandler(GET))
 * ```
 *
 * ## 적용된 개선사항
 * ✅ **메서드 체이닝 적용** (createHonoFromHandlers):
 *    - let app = new Hono() 패턴 사용
 *    - app = app.get().post().patch() 체이닝으로 타입 체인 유지
 *    - Hono RPC 타입 추론 가능성 확보
 *
 * ✅ **타입 안전성 강화** (wrapHandler):
 *    - any 타입 제거, RouteHandler와 Context 타입 명시
 *    - 제네릭을 활용한 data<T>() 타입 안전성 개선
 *
 * ✅ **쿼리 파라미터 처리 개선**:
 *    - for...of + entries()로 가독성 향상
 *    - 중복 키 배열 처리 로직 최적화
 *
 * ✅ **에러 메시지 개선**:
 *    - 구조화된 형식과 예제 코드 제공
 *    - 개발자 친화적 가이드라인 제시
 *
 * ## 남은 과제
 * ❌ **동적 import로 인한 타입 손실**:
 *    - import(routeFile.absolutePath) → 런타임에만 타입 확인 가능
 *    - 해결책: 정적 타입 파일 생성 (routes-types.generated.ts)
 */
export class RouteMapper
{
    /**
     * RouteFile을 RouteDefinition으로 변환
     */
    async mapRoute(routeFile: RouteFile): Promise<RouteDefinition>
    {
        // 동적 import로 모듈 로드
        const module = await import(routeFile.absolutePath) as RouteModule;

        let honoInstance: Hono;

        // 1. 기존 방식: default export로 Hono 인스턴스 제공
        if (module.default)
        {
            honoInstance = module.default;
        }
        // 2. Next.js App Router 스타일: HTTP 메서드 함수 export
        else if (this.hasHttpMethodHandlers(module))
        {
            honoInstance = this.createHonoFromHandlers(module);
        }
        else
        {
            throw new Error(
                `❌ Invalid route file: ${routeFile.absolutePath}\n\n` +
                `Route files must export one of the following:\n\n` +
                `1. Default Hono instance (Legacy style):\n` +
                `   export default new Hono().get('/', ...).post('/', ...);\n\n` +
                `2. HTTP method handlers (Next.js App Router style):\n` +
                `   export async function GET(c: RouteContext) { ... }\n` +
                `   export async function POST(c: RouteContext) { ... }\n\n` +
                `Supported methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
            );
        }

        // URL 경로 생성
        const urlPath = this.buildUrlPath(routeFile, module);

        // 파라미터 추출
        const params = this.extractParams(routeFile);

        // 우선순위 계산
        const priority = this.calculatePriority(routeFile);

        return {
            urlPath,
            filePath: routeFile.relativePath,
            priority,
            params,
            honoInstance,
            meta: module.meta,
            middlewares: module.middlewares,
        };
    }

    /**
     * HTTP 메서드 핸들러가 있는지 확인
     */
    private hasHttpMethodHandlers(module: RouteModule): boolean
    {
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        return methods.some(method => typeof module[method as keyof RouteModule] === 'function');
    }

    /**
     * HTTP 메서드 핸들러로부터 Hono 인스턴스 생성
     *
     * ✅ 메서드 체이닝 방식으로 타입 추론 가능하도록 구현
     */
    private createHonoFromHandlers(module: RouteModule): Hono
    {
        let app = new Hono();

        // HTTP 메서드 등록 (메서드 체이닝으로 타입 유지)
        if (module.GET) app = app.get('/', this.wrapHandler(module.GET));
        if (module.POST) app = app.post('/', this.wrapHandler(module.POST));
        if (module.PUT) app = app.put('/', this.wrapHandler(module.PUT));
        if (module.PATCH) app = app.patch('/', this.wrapHandler(module.PATCH));
        if (module.DELETE) app = app.delete('/', this.wrapHandler(module.DELETE));
        if (module.OPTIONS) app = app.options('/', this.wrapHandler(module.OPTIONS));
        // HEAD는 Hono에서 기본 지원하지 않음

        return app;
    }

    /**
     * 핸들러 래퍼: Hono Context를 RouteContext로 변환
     *
     * @param handler - RouteHandler (RouteContext를 받는 함수)
     * @returns Hono의 Context를 받아 RouteContext로 변환하는 핸들러
     */
    private wrapHandler(handler: RouteHandler)
    {
        return async (c: Context) =>
        {
            // 1. Path 파라미터 주입
            const params: Record<string, string> = c.req.param();

            // 2. Query 파라미터 주입 (중복 값 배열 처리)
            const query: Record<string, string | string[]> = {};
            const url = new URL(c.req.url);

            for (const [key, value] of url.searchParams.entries())
            {
                const existing = query[key];
                if (existing !== undefined)
                {
                    // 중복 키: 배열로 변환
                    query[key] = Array.isArray(existing)
                        ? [...existing, value]
                        : [existing, value];
                }
                else
                {
                    query[key] = value;
                }
            }

            // 3. Pageable 객체 (QueryParser 미들웨어 결과)
            const pageable = c.get('queryParams') || {};

            // 4. Body 파싱 헬퍼 주입
            const data = async <T = unknown>(): Promise<T> =>
            {
                return await c.req.json() as T;
            };

            // 5. JSON 응답 헬퍼 주입 (원본 c.json을 그대로 바인딩)
            const json = c.json.bind(c);

            // 6. RouteContext 생성
            const routeContext = {
                params,
                query,
                pageable,
                data,
                json,
                raw: c,
            };

            // 7. 실제 핸들러 호출
            return handler(routeContext);
        };
    }

    /**
     * URL 경로 생성
     */
    private buildUrlPath(routeFile: RouteFile, module: RouteModule): string
    {
        // 메타데이터의 prefix가 있으면 우선 사용
        if (module.meta?.prefix)
        {
            return module.meta.prefix;
        }

        // 레거시 prefix 지원
        if (module.prefix)
        {
            return module.prefix;
        }

        // 파일 경로 기반으로 URL 생성
        const segments = [...routeFile.segments];

        // index.ts는 경로에서 제거
        if (routeFile.isIndex)
        {
            segments.pop();
        }
        else
        {
            // .ts 확장자 제거
            const lastSegment = segments[segments.length - 1];
            segments[segments.length - 1] = lastSegment.replace(/\.ts$/, '');
        }

        // 세그먼트 변환
        const transformedSegments = segments.map(segment => this.transformSegment(segment));

        // 경로 조합
        const path = '/' + transformedSegments.join('/');

        // 중복 슬래시 제거
        return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }

    /**
     * 세그먼트 변환 ([id] → :id, [...slug] → *)
     */
    private transformSegment(segment: string): string
    {
        // Catch-all: [...slug] → *
        if (/^\[\.\.\.[\w-]+]$/.test(segment))
        {
            return '*';
        }

        // Dynamic: [id] → :id
        if (/^\[[\w-]+]$/.test(segment))
        {
            const paramName = segment.slice(1, -1); // [ ] 제거
            this.validateParamName(paramName);
            return ':' + paramName;
        }

        // Static: users → users
        return segment;
    }

    /**
     * 파라미터 이름 추출
     */
    private extractParams(routeFile: RouteFile): string[]
    {
        const params: string[] = [];

        for (const segment of routeFile.segments)
        {
            // .ts 확장자 제거
            const cleanSegment = segment.replace(/\.ts$/, '');

            // [id], [slug], [...slug] 등에서 파라미터 이름 추출
            const match = cleanSegment.match(/^\[(\.\.\.)?(\w+)]$/);

            if (match)
            {
                params.push(match[2]);
            }
        }

        return params;
    }

    /**
     * 우선순위 계산
     */
    private calculatePriority(routeFile: RouteFile): RoutePriority
    {
        if (routeFile.isCatchAll)
        {
            return RoutePriority.CATCH_ALL;
        }

        if (routeFile.isDynamic)
        {
            return RoutePriority.DYNAMIC;
        }

        return RoutePriority.STATIC;
    }

    /**
     * 파라미터 이름 유효성 검증
     */
    private validateParamName(paramName: string): void
    {
        // 유효한 JavaScript 식별자인지 검증
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(paramName))
        {
            throw new Error(
                `Invalid parameter name: ${paramName}. ` +
                `Parameter names must be valid JavaScript identifiers.`
            );
        }

        // 예약어 체크
        const reservedWords = [
            'default', 'if', 'else', 'while', 'for', 'switch',
            'case', 'break', 'continue', 'return', 'function',
            'var', 'let', 'const', 'class', 'extends', 'import',
            'export', 'async', 'await', 'try', 'catch', 'finally'
        ];

        if (reservedWords.includes(paramName))
        {
            throw new Error(
                `Invalid parameter name: ${paramName}. ` +
                `Parameter names cannot be JavaScript reserved words.`
            );
        }
    }
}