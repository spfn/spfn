# Route Manual Export Implementation

**Status**: Implemented
**Created**: 2025-11-20
**Author**: SPFN Team
**Related**: [Route Codegen Proposal](./route-codegen-proposal.md)

## Overview

tRPC와의 비교 분석 결과, **수동 export + 타입 캡처** 방식을 채택했습니다. 이 방식은:
- **RESTful API 유지**: 모바일 앱, 웹, 다양한 클라이언트 지원
- **Response 스키마 제거**: Handler 반환값에서 타입 자동 추론
- **Smart Input Mapping**: Path params 자동 추출로 간편한 정의
- **tRPC-style DX**: `route.get()`, `defineRouter()` 패턴

---

## Why Not tRPC?

### tRPC의 한계

1. **TypeScript 전용**
   - Swift (iOS): ❌ 공식 지원 없음
   - Kotlin (Android): ❌ 공식 지원 없음
   - Flutter/Dart: ❌ 공식 지원 없음
   - 모바일 앱은 tRPC-OpenAPI로 우회 필요 (타입 안전성 손실)

2. **파일 업로드 미지원**
   - tRPC는 JSON 직렬화만 지원
   - FormData, File, Blob 처리 불가
   - 별도 REST endpoint 필요

3. **복잡한 HTTP 처리**
   - 커스텀 헤더 설정 제한적
   - RPC 패턴에 맞지 않는 HTTP 기능

### SPFN의 선택

**RESTful + Type Safety = 범용 API 서버**

- ✅ 표준 REST API (모든 클라이언트 지원)
- ✅ 파일 업로드 지원
- ✅ TypeScript 클라이언트는 완전한 타입 안전성
- ✅ 모바일 앱은 OpenAPI spec → codegen

---

## New Architecture

### 1. Route Definition with Smart Input Mapping

```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

// GET /users/:id?includeOrg=true
export const getUser = route.get('/users/:id')
  .input(Type.Object({
    id: Type.String(),          // → :id (path param)
    includeOrg: Type.Boolean()  // → query param
  }))
  .handler(async (c) => {
    const user = await db.user.findUnique({
      where: { id: c.params.id },
      include: { organization: c.query.includeOrg }
    });
    return c.success(user); // ← 타입 자동 추론!
  });

// POST /users
export const createUser = route.post('/users')
  .input(Type.Object({
    name: Type.String(),
    email: Type.String()
  }))  // → 전체가 body로 매핑
  .use([AuthMiddleware(), Transactional()])
  .handler(async (c) => {
    const user = await db.user.create({ data: c.body });
    return c.created(user);
  });

// PUT /users/:id
export const updateUser = route.put('/users/:id')
  .input(Type.Object({
    id: Type.String(),     // → :id (path param)
    name: Type.String(),   // → body
    email: Type.String()   // → body
  }))
  .handler(async (c) => {
    const user = await db.user.update({
      where: { id: c.params.id },
      data: { name: c.body.name, email: c.body.email }
    });
    return c.success(user);
  });
```

**Smart Mapping 규칙:**
- Path에서 `:param` 추출 → input에서 해당 필드를 params로 분리
- GET: 나머지 → query
- POST/PUT/PATCH/DELETE: 나머지 → body

### 2. Router Definition (tRPC-style)

```typescript
// src/server/router.ts
import { defineRouter } from '@spfn/core/route';
import * as users from './routes/users';
import * as teams from './routes/teams';

export const appRouter = defineRouter({
  // Users
  getUser: users.getUser,
  createUser: users.createUser,
  updateUser: users.updateUser,
  deleteUser: users.deleteUser,

  // Teams
  getTeam: teams.getTeam,
  getTeamMembers: teams.getTeamMembers,
  createTeam: teams.createTeam,
});

// ✅ 전체 타입 캡처!
export type AppRouter = typeof appRouter;
```

### 3. Type Inference

```typescript
// Router 타입 구조
type AppRouter = {
  routes: {
    getUser: RouteDef<
      { params: { id: string } },
      // Handler 반환 타입이 자동으로 추론됨
      { success: true, data: User }
    >,
    createUser: RouteDef<
      { body: { name: string, email: string } },
      { success: true, data: User }
    >,
    // ...
  }
}
```

### 4. Client Usage (Future)

```typescript
// 클라이언트에서 사용 (codegen으로 생성 예정)
import { api } from '@/lib/api';

const user = await api.getUser({ id: '123' });
// user 타입: { success: true, data: User }
// User 타입은 handler 반환값에서 자동 추론됨!
```

---

## Implementation Details

### Path Parameter Extraction

```typescript
function extractPathParams(path: string): string[]
{
  const matches = path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  if (!matches) return [];
  return matches.map(match => match.slice(1));
}

extractPathParams('/users/:id/posts/:postId')
// → ['id', 'postId']
```

### Smart Input Mapping

```typescript
function splitInputByMethod(
  method: HttpMethod,
  path: string,
  inputSchema: TSchema
): RouteInput
{
  const pathParams = extractPathParams(path);
  const properties = inputSchema.properties || {};

  // 1. Path params 분리
  const paramsProps = pathParams.reduce((acc, paramName) => {
    if (properties[paramName]) {
      acc[paramName] = properties[paramName];
    }
    return acc;
  }, {});

  // 2. 나머지 필드
  const remainingKeys = Object.keys(properties)
    .filter(key => !pathParams.includes(key));

  // 3. GET → query, others → body
  if (method === 'GET') {
    return {
      params: createSchema(paramsProps),
      query: createSchema(remainingProps)
    };
  } else {
    return {
      params: createSchema(paramsProps),
      body: createSchema(remainingProps)
    };
  }
}
```

### Response Type Inference

```typescript
// RouteDef 구조
export type RouteDef<TInput, TResponse> = {
  method?: HttpMethod;
  path?: string;
  input?: TInput;
  middlewares?: MiddlewareHandler[];
  handler: RouteHandlerFn<TInput, TResponse>;

  // 타입 추론 헬퍼
  _input: TInput;
  _response: TResponse; // ← handler 반환 타입
};

// Router에서 전체 타입 캡처
export type Router<TRoutes> = {
  routes: TRoutes;
  _routes: TRoutes;
};

// 타입 추출
type RouteResponse<T extends RouteDef<any, any>> = T['_response'];
type GetUserResponse = RouteResponse<typeof appRouter.routes.getUser>;
```

---

## Advantages

### 1. RESTful + Type Safety

**tRPC:**
- ✅ TypeScript 클라이언트 타입 안전
- ❌ 모바일 앱은 타입 안전성 없음
- ❌ 파일 업로드 불가

**SPFN:**
- ✅ TypeScript 클라이언트 타입 안전
- ✅ 모바일 앱: OpenAPI spec → codegen
- ✅ 파일 업로드, FormData 지원
- ✅ 표준 HTTP 기능 모두 사용 가능

### 2. Response 스키마 불필요

**Before:**
```typescript
export const getUserContract = defineContract({
  method: 'GET',
  path: '/users/:id',
  params: Type.Object({ id: Type.String() }),
  // ❌ 수동으로 정의
  response: ApiSuccessSchema(Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
    // ... 20+ 필드
  }))
});
```

**After:**
```typescript
export const getUser = route.get('/users/:id')
  .input(Type.Object({ id: Type.String() }))
  .handler(async (c) => {
    const user = await db.user.findUnique({ ... });
    return c.success(user); // ✅ 타입 자동 추론!
  });
```

### 3. Smart Input Mapping

**Before (Explicit):**
```typescript
route.get('/users/:id')
  .input({
    params: Type.Object({ id: Type.String() }),
    query: Type.Object({ includeOrg: Type.Boolean() })
  })
```

**After (Smart):**
```typescript
route.get('/users/:id')
  .input(Type.Object({
    id: Type.String(),          // → params
    includeOrg: Type.Boolean()  // → query
  }))
```

### 4. Explicit Response Type (for Complex Types)

Union types, conditional types 등은 제네릭으로 명시:

```typescript
type PostResponse =
  | { status: 'draft'; content: string }
  | { status: 'published'; content: string; publishedAt: Date };

export const getPost = route.get('/posts/:id')
  .input(Type.Object({ id: Type.String() }))
  .handler<PostResponse>(async (c) => {
    // PostResponse 타입으로 강제됨
    if (post.published) {
      return c.success({
        status: 'published',
        content: post.content,
        publishedAt: post.publishedAt
      });
    }
    return c.success({ status: 'draft', content: post.content });
  });
```

---

## Trade-offs

### Advantages

1. **RESTful 유지**
   - 범용 API 서버로 사용 가능
   - 모든 클라이언트 지원 (웹, 모바일, IoT)
   - 파일 업로드, 복잡한 HTTP 기능 모두 사용 가능

2. **Response 스키마 제거**
   - DB 엔티티 직접 사용
   - 보일러플레이트 50% 감소
   - 타입 불일치 위험 제거

3. **Smart Input Mapping**
   - 간편한 input 정의
   - Path params 자동 추출
   - 여전히 explicit 정의 가능 (필요시)

4. **타입 안전성**
   - Handler 반환값 → 클라이언트 타입 자동 동기화
   - tRPC 수준의 타입 안전성
   - 컴파일 타임 검증

### Disadvantages

1. **수동 Export 필요**
   - 라우트 추가 시 router에 수동 등록
   - 파일 기반 자동 발견 불가
   - 하지만 명시적이고 명확함

2. **파일 기반 라우팅 상실**
   - 기존 convention (routes/users/[id]/index.ts) 사용 불가
   - 하지만 여전히 파일 구조로 조직화 가능

3. **대규모 앱에서 Router 타입 크기**
   - 500+ routes면 TS 컴파일 느려질 수 있음
   - 해결: Router 분할 (리소스별, 기능별)

---

## Migration Path

### From Current (Contract-based)

**Step 1: 단일 파일로 재구성**
```typescript
// Before: routes/users/[id]/index.ts
const app = createApp();
app.bind(getUserContract, handler);
export default app;

// After: routes/users.ts
export const getUser = route.get('/users/:id')...;
export const createUser = route.post('/users')...;
```

**Step 2: Router 정의**
```typescript
// src/server/router.ts
import * as users from './routes/users';

export const appRouter = defineRouter({
  getUser: users.getUser,
  createUser: users.createUser,
});
```

**Step 3: Response 스키마 제거**
```typescript
// Before
response: ApiSuccessSchema(Type.Object({ ... }))

// After
// 제거! handler 반환값에서 자동 추론
```

### Coexistence Strategy

기존 방식과 신규 방식 공존 가능:

```typescript
// 기존 방식 (계속 지원)
export default createApp().bind(contract, handler);

// 신규 방식
export const getUser = route.get(...).handler(...);
```

Router는 신규 방식만 지원.

---

## Next Steps

### Phase 1: Core Implementation (✅ Completed)

- [x] `route.get/post/put/patch/delete` 메서드
- [x] Path parameter 추출 로직
- [x] Smart input mapping
- [x] `defineRouter` 함수
- [x] Type inference helpers

### Phase 2: Integration

1. **기존 bind와 통합**
   - RouteDef → Hono handler 변환
   - Middleware 적용
   - Validation 통합

2. **Client Codegen 수정**
   - Router 타입 기반 클라이언트 생성
   - Response 타입 자동 추출
   - API 함수 생성

3. **Documentation**
   - Migration guide
   - Best practices
   - Examples

### Phase 3: Optimization

1. **Router Splitting**
   - 대규모 앱 대응
   - 리소스별 분할
   - Lazy loading

2. **Performance**
   - Type inference 최적화
   - Build time 측정
   - Bundle size 분석

3. **DX Improvements**
   - VS Code extension 업데이트
   - Type hints
   - Error messages

---

## Conclusion

이 구현은 **tRPC의 DX + RESTful의 범용성**을 결합합니다:

- ✅ **tRPC처럼 간편**: `route.get()`, `defineRouter()`, 자동 타입 추론
- ✅ **RESTful 유지**: 모든 클라이언트 지원, 파일 업로드, 표준 HTTP
- ✅ **Response 스키마 불필요**: Handler 반환값 자동 캡처
- ✅ **Smart Input**: Path params 자동 추출로 간편한 정의

**트레이드오프:**
- 파일 기반 자동 발견 → 수동 export
- 하지만 명시적이고, 타입 안전성 향상

이 방식은 SPFN을 **범용 API 프레임워크**로 유지하면서도 **TypeScript 풀스택 앱**에서 tRPC 수준의 개발 경험을 제공합니다.
