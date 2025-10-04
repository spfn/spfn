import type { Context, Hono, MiddlewareHandler } from 'hono';

/**
 * 파일 기반 라우팅 시스템 타입 정의
 *
 * ## 타입 흐름
 * ```
 * RouteFile (스캔)
 *   ↓
 * RouteModule (동적 import)
 *   ↓
 * RouteDefinition (변환)
 *   ↓
 * Hono App (등록)
 * ```
 *
 * ## 핵심 타입
 * 1. **RouteContext**: 라우트 핸들러용 확장 Context (params, query, data)
 * 2. **RouteHandler**: Next.js App Router 스타일 핸들러 함수 타입
 * 3. **RouteFile**: 파일 시스템 스캔 결과 (Scanner 출력)
 * 4. **RouteModule**: 동적 import 결과 (Mapper 입력)
 * 5. **RouteDefinition**: 변환된 라우트 정의 (Mapper 출력, Registry 저장)
 * 6. **RouteMeta**: 라우트 메타데이터 (auth, tags, description 등)
 * 7. **RoutePriority**: 우선순위 enum (STATIC, DYNAMIC, CATCH_ALL)
 * 8. **ScanOptions**: 스캐너 설정 옵션
 *
 * ## 적용된 개선사항
 * ✅ **HTTP 메서드 타입**: HttpMethod 유니온 타입 추가
 * ✅ **라우트 그룹**: RouteGroup, RouteStats 타입 추가
 * ✅ **타입 가드**: isRouteFile, isRouteDefinition, isHttpMethod, hasHttpMethodHandlers
 *
 * ## 추가 개선 방향
 * 1. **제네릭 타입 안전성**: RouteContext에 params, body 타입 파라미터 추가
 * 2. **메타데이터 검증**: Zod/Joi 스키마 기반 메타데이터 검증
 * 3. **OpenAPI 스펙**: OpenAPI 3.0 스펙 타입 연동
 */

/**
 * RouteContext: 라우트 핸들러 전용 Context
 *
 * 편의 메서드 제공:
 * - params: Path 파라미터 (예: /users/:id → { id: string })
 * - query: Query 파라미터 (중복 값 배열 처리)
 * - pageable: QueryParser 미들웨어 결과 (Spring Pageable 스타일)
 * - data<T>(): Request Body 파싱 헬퍼 (제네릭 지원)
 * - json<T>(): JSON 응답 헬퍼
 * - raw: 원본 Hono Context (고급 기능: raw.req, raw.get(), raw.set() 등)
 */
export type RouteContext = {
    /**
     * Path 파라미터 (예: /users/:id → { id: string })
     */
    params: Record<string, string>;

    /**
     * Query 파라미터 (예: /users?page=1 → { page: string })
     */
    query: Record<string, string | string[]>;

    /**
     * Pageable 객체 (QueryParser 미들웨어 결과)
     * Spring Boot Pageable 스타일 (filters, sort, pagination)
     */
    pageable: {
        filters?: Record<string, any>;
        sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
        pagination?: { page: number; limit: number };
    };

    /**
     * Request Body 파싱 헬퍼
     */
    data<T = unknown>(): Promise<T>;

    /**
     * JSON 응답 헬퍼 (Hono Context의 json 메서드와 동일)
     */
    json: Context['json'];

    /**
     * 원본 Hono Context (필요시 고급 기능 접근)
     * - raw.req: Request 객체 (헤더, 쿠키 등)
     * - raw.get(): Context 변수 읽기 (미들웨어 데이터)
     * - raw.set(): Context 변수 설정
     */
    raw: Context;
};

/**
 * HTTP 메서드 타입
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Next.js App Router 스타일 Route Handler
 *
 * RouteContext를 받아 Response를 반환하는 함수
 */
export type RouteHandler = (c: RouteContext) => Response | Promise<Response>;

/**
 * 스캔된 라우트 파일 정보
 */
export type RouteFile = {
    /** 절대 경로 */
    absolutePath: string;
    /** routes/ 기준 상대 경로 */
    relativePath: string;
    /** 경로 세그먼트 배열 */
    segments: string[];
    /** 동적 파라미터 포함 여부 [id] */
    isDynamic: boolean;
    /** Catch-all 라우트 여부 [...slug] */
    isCatchAll: boolean;
    /** index.ts 파일 여부 */
    isIndex: boolean;
};

/**
 * 라우트 메타데이터 (선택적 export)
 */
export type RouteMeta = {
    /** 라우트 설명 */
    description?: string;
    /** OpenAPI 태그 */
    tags?: string[];
    /** 인증 필요 여부 */
    auth?: boolean;
    /** 커스텀 prefix (기본값: 파일 경로 기반) */
    prefix?: string;
    /** 추가 메타데이터 */
    [key: string]: unknown;
};

/**
 * 라우트 모듈 타입 (동적 import 결과)
 *
 * 두 가지 스타일 지원:
 * 1. 기존 방식: default export로 Hono 인스턴스 제공
 * 2. Next.js 스타일: GET, POST 등 HTTP 메서드 함수 export
 */
export type RouteModule = {
    /** Hono 인스턴스 (기존 방식, 선택) */
    default?: Hono;

    /** HTTP 메서드 핸들러 (Next.js 스타일) */
    GET?: RouteHandler;
    POST?: RouteHandler;
    PUT?: RouteHandler;
    PATCH?: RouteHandler;
    DELETE?: RouteHandler;
    HEAD?: RouteHandler;
    OPTIONS?: RouteHandler;

    /** 라우트 메타데이터 (선택) */
    meta?: RouteMeta;
    /** 미들웨어 배열 (선택) */
    middlewares?: MiddlewareHandler[];
    /** 레거시 prefix 지원 (선택) */
    prefix?: string;
};

/**
 * 변환된 라우트 정의
 */
export type RouteDefinition = {
    /** URL 경로 (/users/:id) */
    urlPath: string;
    /** 파일 경로 (routes/users/[id].ts) */
    filePath: string;
    /** 우선순위 (1: 정적, 2: 동적, 3: catch-all) */
    priority: number;
    /** 파라미터 이름 배열 ['id'] */
    params: string[];
    /** Hono 인스턴스 */
    honoInstance: Hono;
    /** 라우트 메타데이터 */
    meta?: RouteMeta;
    /** 미들웨어 배열 */
    middlewares?: MiddlewareHandler[];
};

/**
 * 라우트 우선순위
 */
export enum RoutePriority
{
    STATIC = 1,
    DYNAMIC = 2,
    CATCH_ALL = 3,
}

/**
 * 라우트 스캐너 옵션
 */
export type ScanOptions = {
    /** routes 디렉토리 경로 */
    routesDir: string;
    /** 제외할 패턴 */
    exclude?: RegExp[];
    /** 디버그 로그 출력 */
    debug?: boolean;
};

/**
 * 라우트 그룹 (태그별 라우트 그룹핑용)
 */
export type RouteGroup = {
    /** 그룹 이름 (태그 또는 prefix) */
    name: string;
    /** 그룹에 속한 라우트들 */
    routes: RouteDefinition[];
};

/**
 * 라우트 통계
 */
export type RouteStats = {
    /** 총 라우트 수 */
    total: number;
    /** HTTP 메서드별 개수 */
    byMethod: Record<HttpMethod, number>;
    /** 우선순위별 개수 */
    byPriority: {
        static: number;
        dynamic: number;
        catchAll: number;
    };
    /** 태그별 개수 */
    byTag: Record<string, number>;
};

// ============================================================================
// 타입 가드 함수
// ============================================================================

/**
 * RouteFile 타입 가드
 */
export function isRouteFile(value: unknown): value is RouteFile
{
    return (
        typeof value === 'object' &&
        value !== null &&
        'absolutePath' in value &&
        'relativePath' in value &&
        'segments' in value &&
        'isDynamic' in value &&
        'isCatchAll' in value &&
        'isIndex' in value
    );
}

/**
 * RouteDefinition 타입 가드
 */
export function isRouteDefinition(value: unknown): value is RouteDefinition
{
    return (
        typeof value === 'object' &&
        value !== null &&
        'urlPath' in value &&
        'filePath' in value &&
        'priority' in value &&
        'params' in value &&
        'honoInstance' in value
    );
}

/**
 * HttpMethod 타입 가드
 */
export function isHttpMethod(value: unknown): value is HttpMethod
{
    return (
        typeof value === 'string' &&
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(value)
    );
}

/**
 * RouteModule이 Next.js 스타일인지 확인
 */
export function hasHttpMethodHandlers(module: RouteModule): boolean
{
    const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    return methods.some(method => typeof module[method] === 'function');
}