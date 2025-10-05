# 동적 라우트 등록 프로세스

파일 기반 라우팅 시스템의 전체 동작 원리와 구현을 설명합니다.

## 📋 개요

이 시스템은 **5개의 핵심 모듈**이 순차적으로 동작하여 파일 기반 라우트를 Hono 앱에 자동 등록합니다.

- **RouteScanner**: 파일 시스템 탐색 및 스캔
- **RouteMapper**: 파일을 Hono 라우트로 변환
- **RouteRegistry**: 라우트 등록 및 우선순위 관리
- **RouteLoader**: 전체 프로세스 통합 관리
- **Types**: 공통 타입 정의

## 📁 전체 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│  1. app.ts (엔트리포인트)                                        │
│  └─ loadRoutesFromDirectory(app, debug)                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. RouteLoader - 전체 프로세스 관리                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  loadRoutes(app: Hono)                                  │   │
│  │  ├─ scanner.scanRoutes()          → RouteFile[]        │   │
│  │  ├─ mapper.mapRoute()             → RouteDefinition    │   │
│  │  ├─ registry.register()           → 등록 & 충돌 검사   │   │
│  │  └─ registry.applyToHono(app)     → Hono에 적용        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
           ↓                    ↓                    ↓
    ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
    │ RouteScanner│      │ RouteMapper │      │RouteRegistry│
    │   (스캔)    │      │   (변환)    │      │   (등록)    │
    └─────────────┘      └─────────────┘      └─────────────┘
```

## 🔍 1단계: RouteScanner (파일 스캔)

**파일**: `route-scanner.ts`

### 주요 역할
- `routes/` 폴더를 재귀적으로 탐색
- 유효한 라우트 파일만 필터링
- RouteFile 객체 생성

### 핵심 메서드

#### `scanRoutes(): Promise<RouteFile[]>`
```typescript
// 모든 라우트 파일 스캔
const files: RouteFile[] = [];
this.scanDirectory(this.routesDir, files);
return files;
```

#### `scanDirectory(dir: string, files: RouteFile[]): void`
- 디렉토리 재귀 탐색
- 제외 패턴 체크 (`.test.ts`, `.spec.ts`, `.d.ts`)
- 유효한 파일만 RouteFile로 변환

#### `createRouteFile(absolutePath: string): RouteFile`
```typescript
{
  absolutePath: "/absolute/path/to/routes/users/[id].ts",
  relativePath: "users/[id].ts",
  segments: ["users", "[id].ts"],
  isDynamic: true,      // [id] 패턴 포함
  isCatchAll: false,    // [...slug] 패턴 아님
  isIndex: false        // index.ts 아님
}
```

### 출력 예시

```typescript
// 파일: src/server/routes/users/[id]/posts/index.ts
{
  absolutePath: "/Users/.../src/server/routes/users/[id]/posts/index.ts",
  relativePath: "users/[id]/posts/index.ts",
  segments: ["users", "[id]", "posts", "index.ts"],
  isDynamic: true,
  isCatchAll: false,
  isIndex: true
}
```

## 🔄 2단계: RouteMapper (라우트 변환)

**파일**: `route-mapper.ts`

### 주요 역할
1. 파일 → Hono 라우트 변환
2. HTTP 메서드 핸들러 처리 (Next.js App Router 스타일)
3. RouteContext 래핑 (params, query, data 주입)
4. URL 경로 생성 (`[id]` → `:id`)
5. 우선순위 계산

### 핵심 메서드

#### `mapRoute(routeFile: RouteFile): Promise<RouteDefinition>`

전체 변환 프로세스를 관리합니다.

```typescript
// 1. 동적 import로 모듈 로드
const module = await import(routeFile.absolutePath) as RouteModule;

// 2. Hono 인스턴스 생성
let honoInstance: Hono;
if (module.default) {
    honoInstance = module.default;  // 레거시 방식
} else if (this.hasHttpMethodHandlers(module)) {
    honoInstance = this.createHonoFromHandlers(module);  // Next.js 스타일
}

// 3. URL 경로, 파라미터, 우선순위 계산
const urlPath = this.buildUrlPath(routeFile, module);
const params = this.extractParams(routeFile);
const priority = this.calculatePriority(routeFile);

return { urlPath, filePath, priority, params, honoInstance, ... };
```

#### `createHonoFromHandlers(module: RouteModule): Hono`

Next.js App Router 스타일 핸들러를 Hono 인스턴스로 변환합니다.

```typescript
let app = new Hono();

// ✅ 메서드 체이닝 패턴 (타입 추론을 위해 중요!)
if (module.GET) app = app.get('/', this.wrapHandler(module.GET));
if (module.POST) app = app.post('/', this.wrapHandler(module.POST));
if (module.PUT) app = app.put('/', this.wrapHandler(module.PUT));
if (module.PATCH) app = app.patch('/', this.wrapHandler(module.PATCH));
if (module.DELETE) app = app.delete('/', this.wrapHandler(module.DELETE));
if (module.OPTIONS) app = app.options('/', this.wrapHandler(module.OPTIONS));

return app;
```

**왜 메서드 체이닝?**
- `let app = new Hono()` + `app = app.get()` 패턴
- 타입 체인 유지 → Hono RPC 타입 추론 가능

#### `wrapHandler(handler: RouteHandler)`

Hono Context를 RouteContext로 확장합니다.

```typescript
return async (c: Context) => {
    // 1. Path 파라미터 주입
    const params: Record<string, string> = c.req.param();

    // 2. Query 파라미터 주입 (중복 값 배열 처리)
    const query: Record<string, string | string[]> = {};
    const url = new URL(c.req.url);

    for (const [key, value] of url.searchParams.entries()) {
        const existing = query[key];
        if (existing !== undefined) {
            query[key] = Array.isArray(existing)
                ? [...existing, value]
                : [existing, value];
        } else {
            query[key] = value;
        }
    }

    // 3. Body 파싱 헬퍼 주입
    const data = async <T = unknown>(): Promise<T> => {
        return await c.req.json() as T;
    };

    // 4. RouteContext 생성 (Hono Context + 확장 속성)
    const routeContext = Object.assign(c, { params, query, data });

    return await handler(routeContext);
};
```

#### `buildUrlPath(routeFile: RouteFile, module: RouteModule): string`

파일 경로를 URL 경로로 변환합니다.

**변환 규칙**:
- `[id]` → `:id` (동적 파라미터)
- `[...slug]` → `*` (catch-all)
- `index.ts` → 경로에서 제거
- `.ts` 확장자 제거

```typescript
// 예시
"users/[id].ts"           → "/users/:id"
"posts/[...slug].ts"      → "/posts/*"
"api/v1/index.ts"         → "/api/v1"
```

#### `calculatePriority(routeFile: RouteFile): RoutePriority`

라우트 우선순위를 계산합니다.

```typescript
if (routeFile.isCatchAll) return 3;   // CATCH_ALL
if (routeFile.isDynamic) return 2;    // DYNAMIC
return 1;                             // STATIC
```

### 변환 예시

**입력 (RouteFile)**:
```typescript
{
  relativePath: "users/[id].ts",
  segments: ["users", "[id].ts"],
  isDynamic: true
}
```

**출력 (RouteDefinition)**:
```typescript
{
  urlPath: "/users/:id",
  filePath: "users/[id].ts",
  priority: 2,  // DYNAMIC
  params: ["id"],
  honoInstance: /* Hono instance with GET/POST/... */
}
```

## 📋 3단계: RouteRegistry (라우트 등록)

**파일**: `route-registry.ts`

### 주요 역할
- 라우트 정의 저장 및 관리
- 중복/충돌 검사
- 우선순위 정렬
- Hono 앱에 최종 적용

### 핵심 메서드

#### `register(definition: RouteDefinition): void`

라우트를 등록하고 검증합니다.

```typescript
// 1. 중복 검사
if (this.routeMap.has(definition.urlPath)) {
    throw new Error(`Duplicate route detected: ${definition.urlPath}`);
}

// 2. 충돌 검사 (동일 패턴의 다른 파라미터명)
this.checkConflicts(definition);

// 3. 등록
this.routes.push(definition);
this.routeMap.set(definition.urlPath, definition);
```

#### `getSortedRoutes(): RouteDefinition[]`

우선순위에 따라 라우트를 정렬합니다.

**정렬 기준**:
1. **우선순위** (낮을수록 먼저)
   - 정적(1) > 동적(2) > catch-all(3)
2. **세그먼트 수** (많을수록 먼저)
   - `/users/profile` > `/users`
3. **알파벳 순**

```typescript
return [...this.routes].sort((a, b) => {
    // 1. 우선순위 비교
    if (a.priority !== b.priority) {
        return a.priority - b.priority;
    }

    // 2. 세그먼트 수 비교
    const aSegments = a.urlPath.split('/').filter(Boolean);
    const bSegments = b.urlPath.split('/').filter(Boolean);

    if (aSegments.length !== bSegments.length) {
        return bSegments.length - aSegments.length;
    }

    // 3. 알파벳 순
    return a.urlPath.localeCompare(b.urlPath);
});
```

#### `applyToHono(app: Hono): void`

정렬된 라우트를 Hono 앱에 등록합니다.

```typescript
const sortedRoutes = this.getSortedRoutes();

for (const route of sortedRoutes) {
    // 1. 미들웨어 적용
    if (route.middlewares) {
        for (const middleware of route.middlewares) {
            route.honoInstance.use(middleware);
        }
    }

    // 2. Hono 앱에 라우트 등록
    app.route(route.urlPath, route.honoInstance);

    // 3. 로그 출력
    this.logRoute(route);
}
```

### 등록 순서 예시

```
📍 Registering routes:
   Total: 5 routes

   🔹 /users                              → users/index.ts
   🔹 /users/profile                      → users/profile.ts
   🔸 /users/:id                          → users/[id].ts (params: [id])
   🔸 /users/:id/posts                    → users/[id]/posts/index.ts (params: [id])
   ⭐ /posts/*                            → posts/[...slug].ts
```

**아이콘 의미**:
- 🔹 정적 라우트 (우선순위 1)
- 🔸 동적 라우트 (우선순위 2)
- ⭐ Catch-all 라우트 (우선순위 3)

## 🔗 4단계: RouteLoader (전체 프로세스 통합)

**파일**: `route-loader.ts`

### 주요 역할
- Scanner, Mapper, Registry 통합
- 전체 로딩 프로세스 관리
- 에러 처리 및 로깅

### 핵심 메서드

#### `loadRoutes(app: Hono): Promise<void>`

전체 라우트 로딩 프로세스를 실행합니다.

```typescript
async loadRoutes(app: Hono): Promise<void> {
    const startTime = Date.now();

    // 1️⃣ 파일 스캔
    const routeFiles = await this.scanner.scanRoutes();

    if (routeFiles.length === 0) {
        console.warn('⚠️  No route files found');
        return;
    }

    // 2️⃣ 각 파일을 RouteDefinition으로 변환 및 등록
    for (const routeFile of routeFiles) {
        try {
            const definition = await this.mapper.mapRoute(routeFile);
            this.registry.register(definition);
        } catch (error) {
            console.error(`❌ Failed to load route: ${routeFile.relativePath}`);
            throw error;
        }
    }

    // 3️⃣ Hono 앱에 적용
    this.registry.applyToHono(app);

    const elapsed = Date.now() - startTime;
    console.log(`✅ Routes loaded in ${elapsed}ms\n`);
}
```

#### `loadRoutesFromDirectory(app: Hono, debug: boolean): Promise<void>`

편의 함수로, 기본 설정으로 라우트를 로드합니다.

```typescript
export async function loadRoutesFromDirectory(app: Hono, debug = false) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const routesDir = join(__dirname, '..', 'routes');

    const loader = new RouteLoader(routesDir, debug);
    await loader.loadRoutes(app);
}
```

## 📊 데이터 흐름

```
RouteFile (스캔 결과)
  ↓ mapper.mapRoute()
RouteDefinition (변환 결과)
  ↓ registry.register()
Registry 내부 저장 (중복/충돌 검사)
  ↓ getSortedRoutes()
정렬된 RouteDefinition[]
  ↓ applyToHono()
Hono app.route() 등록
```

## 🎯 핵심 타입 관계

**파일**: `types.ts`

### RouteFile (스캔 결과)
```typescript
type RouteFile = {
    absolutePath: string;      // 절대 경로
    relativePath: string;      // routes/ 기준 상대 경로
    segments: string[];        // 경로 세그먼트 배열
    isDynamic: boolean;        // [id] 패턴 포함 여부
    isCatchAll: boolean;       // [...slug] 패턴 여부
    isIndex: boolean;          // index.ts 파일 여부
};
```

### RouteModule (동적 import 결과)
```typescript
type RouteModule = {
    // 방식 1: 레거시 (Hono 인스턴스 직접 export)
    default?: Hono;

    // 방식 2: Next.js App Router 스타일
    GET?: RouteHandler;
    POST?: RouteHandler;
    PUT?: RouteHandler;
    PATCH?: RouteHandler;
    DELETE?: RouteHandler;
    OPTIONS?: RouteHandler;

    // 선택 사항
    meta?: RouteMeta;              // 라우트 메타데이터
    middlewares?: MiddlewareHandler[];
    prefix?: string;               // 레거시 prefix
};
```

### RouteDefinition (변환 결과)
```typescript
type RouteDefinition = {
    urlPath: string;           // URL 경로 (/users/:id)
    filePath: string;          // 파일 경로 (users/[id].ts)
    priority: number;          // 우선순위 (1: 정적, 2: 동적, 3: catch-all)
    params: string[];          // 파라미터 이름 배열 ['id']
    honoInstance: Hono;        // Hono 인스턴스
    meta?: RouteMeta;          // 메타데이터
    middlewares?: MiddlewareHandler[];
};
```

### RouteContext (핸들러용 Context)
```typescript
interface RouteContext extends Context {
    params: Record<string, string>;           // Path 파라미터
    query: Record<string, string | string[]>; // Query 파라미터
    data<T = unknown>(): Promise<T>;          // Body 파싱 헬퍼
}
```

## 🚀 사용 예시

### 라우트 파일 작성

**`src/server/routes/users/[id].ts`**:
```typescript
import type { RouteContext } from '@/server/core';

// Next.js App Router 스타일
export async function GET(c: RouteContext) {
    const { id } = c.params;
    return c.json({ userId: id });
}

export async function PATCH(c: RouteContext) {
    const { id } = c.params;
    const body = await c.data<{ name: string }>();
    return c.json({ userId: id, updated: body });
}

// 메타데이터 (선택)
export const meta = {
    description: 'User detail API',
    tags: ['users'],
    auth: true
};
```

### 앱 초기화

**`src/server/app.ts`**:
```typescript
import { Hono } from 'hono';
import { loadRoutesFromDirectory } from '@/server/core';

const app = new Hono();

// 라우트 자동 로드
const debug = process.env.NODE_ENV === 'development';
await loadRoutesFromDirectory(app, debug);

export { app };
```

### 실행 결과

```
🔍 Scanning routes directory: /Users/.../src/server/routes
  ✓ users/[id].ts
  ✓ users/index.ts
  ✓ posts/index.ts
📁 Found 3 route files

📍 Registering routes:
   Total: 3 routes

   🔹 /users                              → users/index.ts
   🔹 /posts                              → posts/index.ts
   🔸 /users/:id                          → users/[id].ts (params: [id], 🔒 auth)

✅ Routes loaded in 45ms
```

## 💡 핵심 개선사항

### ✅ 메서드 체이닝 적용
- **문제**: 개별 메서드 호출 방식 → Hono RPC 타입 추론 불가
- **해결**: `let app = new Hono()` + `app = app.get().post()` 패턴
- **위치**: `route-mapper.ts:114-128`

### ✅ 타입 안전성 강화
- **개선**: `any` 제거, `RouteHandler`와 `Context` 타입 명시
- **효과**: 제네릭 `data<T>()` 타입 안전성 확보
- **위치**: `route-mapper.ts:136-176`

### ✅ 쿼리 파라미터 처리 개선
- **개선**: `for...of + entries()` 사용, 가독성 향상
- **효과**: 중복 키 배열 처리 로직 최적화
- **위치**: `route-mapper.ts:144-167`

### ✅ 에러 메시지 개선
- **개선**: 구조화된 형식과 예제 코드 제공
- **효과**: 개발자 친화적 가이드라인
- **위치**: `route-mapper.ts:68-77`

## 🔧 남은 과제

### ❌ 동적 import로 인한 타입 손실
- **문제**: `import(routeFile.absolutePath)` → 런타임에만 타입 확인
- **영향**: Hono RPC 클라이언트 타입 추론 불가
- **해결책**: 정적 타입 파일 생성 (`routes-types.generated.ts`)

## 📚 참고 자료

- [Hono 공식 문서](https://hono.dev)
- [Hono RPC](https://hono.dev/guides/rpc)
- [Next.js App Router](https://nextjs.org/docs/app/building-your-application/routing)