# Route Codegen Architecture Proposal

**Status**: Draft
**Created**: 2025-11-20
**Author**: SPFN Team

## Overview

현재 SPFN은 **동적 라우트 로딩 + Contract 기반 검증 + 클라이언트 Codegen** 구조를 사용합니다. 이 문서는 **Response 타입 명시 제거**와 **타입 안전성 개선**을 위한 아키텍처 변경을 제안합니다.

### 목표

1. **Response 스키마 자동 추론**: Handler 반환값에서 타입 자동 캡처
2. **DB 엔티티 직접 사용**: TypeBox 스키마 수동 변환 제거
3. **타입 불일치 방지**: Contract vs 실제 반환값 컴파일 타임 검증
4. **개발자 경험 개선**: 보일러플레이트 감소

---

## Current Architecture

### 1. 동적 라우트 로딩

```typescript
// packages/core/src/route/auto-loader.ts
class AutoRouteLoader
{
    async load(app: Hono): Promise<RouteStats>
    {
        const files = await this.scanFiles(this.routesDir);

        for (const file of files)
        {
            const module = await import(file); // 런타임 동적 로딩
            app.route('/', module.default);
        }
    }
}
```

**특징:**
- 파일 시스템 스캔 → 자동 라우트 발견
- `index.ts` 파일만 라우트로 인식
- Convention over configuration

### 2. Contract 기반 검증

```typescript
// src/server/routes/users/[id]/index.ts
import { Type } from '@sinclair/typebox';
import { defineContract } from '@spfn/core/route';

export const getUserContract = defineContract({
    method: 'GET',
    path: '/users/:id',
    params: Type.Object({
        id: Type.String()
    }),
    // ❌ Response를 수동으로 정의해야 함
    response: ApiSuccessSchema(Type.Object({
        id: Type.String(),
        name: Type.String(),
        email: Type.String(),
        createdAt: Type.String()
    }))
});

const app = createApp();

app.bind(getUserContract, async (c) =>
{
    const user = await db.user.findUnique({
        where: { id: c.params.id }
    });

    return c.success(user); // 실제 타입과 Contract 타입이 다를 수 있음
});

export default app;
```

### 3. 클라이언트 Codegen

```typescript
// Contract → Client 함수 생성
// packages/core/src/codegen/built-in/contract/emitter.ts

// 생성된 코드:
export const getUser = (options: { params: GetUserParams }) =>
    client.call(getUserContract, options);
```

**흐름:**
```
Contract 정의 → AutoLoader가 런타임 발견 →
Codegen이 Contract 스캔 → 클라이언트 API 생성
```

---

## Problem Analysis

### 1. Response 스키마 수동 정의의 문제

#### 문제점

```typescript
// ❌ DB 엔티티 타입을 TypeBox로 수동 변환
type User = {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
    updatedAt: Date;
    organizationId: string;
    // ... 20+ 필드
};

// 모든 필드를 다시 정의해야 함
response: Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
    createdAt: Type.String(), // Date → String 변환 필요
    // ... 모든 필드 반복
})
```

**비용:**
- 초기 작성: 필드당 1줄씩 수동 변환
- 유지보수: 엔티티 변경 시 스키마도 업데이트
- 오류 위험: 필드 누락, 타입 불일치

#### 실제 사례

```typescript
// DB에서 반환하는 실제 타입
{
    id: "user-123",
    name: "John",
    email: "john@example.com",
    role: "admin",        // ✅ 실제 반환됨
    profileImage: "...",  // ✅ 실제 반환됨
}

// Contract의 response 스키마
response: Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String()
    // ❌ role, profileImage 누락!
})

// 클라이언트는 role, profileImage를 타입으로 인식 못함
// → 런타임에는 데이터 있지만 타입 시스템이 모름
```

### 2. 타입 불일치 감지 불가

```typescript
export const contract = defineContract({
    response: Type.Object({
        id: Type.String(),
        name: Type.String()
    })
});

app.bind(contract, async (c) =>
{
    // ❌ 실제로는 다른 구조 반환
    return c.success({
        userId: "123",  // id가 아닌 userId
        fullName: "John"  // name이 아닌 fullName
    });

    // 컴파일 타임에 에러 없음!
});
```

### 3. DB 엔티티 브라우저 번들 문제

```typescript
// ❌ 불가능: DB 엔티티를 클라이언트에서 import하면 번들 오염
import { User } from '@/server/db/entities';

// prisma client, drizzle-orm 등이 브라우저 번들에 포함됨
// → 번들 사이즈 증가, 서버 전용 코드 노출
```

### 4. 복잡한 타입 표현의 한계

```typescript
// Conditional Types
type Response<T extends 'admin' | 'user'> =
    T extends 'admin'
        ? { role: 'admin'; permissions: string[] }
        : { role: 'user' };

// TypeBox로 표현 불가능 또는 매우 복잡

// Union Types
type Post =
    | { status: 'draft'; content: string }
    | { status: 'published'; content: string; publishedAt: Date };

// TypeBox Type.Union으로 표현 가능하지만 복잡
```

---

## Proposed Architecture: Route Codegen

### 핵심 아이디어

**런타임 동적 로딩 → 빌드타임 코드 생성**

```
파일 변경 감지 → 라우트 코드 생성 → 전체 타입 그래프 캡처
```

### 1. 파일 구조 (변경 없음)

```
src/server/routes/
  users/
    index.ts              # GET /users
    [id]/
      index.ts            # GET /users/:id
  teams/
    [id]/
      members/
        index.ts          # GET /teams/:id/members
```

### 2. Route Handler 정의 (Response 스키마 제거)

```typescript
// src/server/routes/users/[id]/index.ts
import { Type } from '@sinclair/typebox';
import { createApp } from '@spfn/core/route';

// ✅ Request validation만 정의
export const contract = {
    params: Type.Object({
        id: Type.String()
    }),
    query: Type.Object({
        includeOrg: Type.Optional(Type.Boolean())
    })
    // response 제거!
};

// ✅ Handler 반환값에서 타입 자동 추론
export const GET = async (c: RouteContext) =>
{
    const user = await db.user.findUnique({
        where: { id: c.params.id },
        include: c.query.includeOrg ? { organization: true } : undefined
    });

    if (!user)
    {
        return c.error('User not found', 404);
    }

    return c.success(user);
    // user의 타입이 자동으로 캡처됨!
};

// bind 호출 제거, export만 함
const app = createApp();
export default app;
```

### 3. Route Registry Codegen

```typescript
// src/server/routes.generated.ts (자동 생성)
/**
 * Auto-generated Route Registry
 *
 * @generated 2025-11-20T10:30:00.000Z
 * DO NOT EDIT MANUALLY
 */

import * as route_users from './routes/users/index';
import * as route_users_id from './routes/users/[id]/index';
import * as route_teams_id_members from './routes/teams/[id]/members/index';

// Flat structure for fast lookup
export const routeRegistry = {
    'GET /users': {
        handler: route_users.GET,
        contract: route_users.contract,
        path: '/users',
        method: 'GET'
    },
    'GET /users/:id': {
        handler: route_users_id.GET,
        contract: route_users_id.contract,
        path: '/users/:id',
        method: 'GET'
    },
    'GET /teams/:id/members': {
        handler: route_teams_id_members.GET,
        contract: route_teams_id_members.contract,
        path: '/teams/:id/members',
        method: 'GET'
    }
} as const;

// 전체 라우트의 타입 추론
export type RouteRegistry = typeof routeRegistry;

// Response 타입 자동 추출
export type RouteResponses = {
    [K in keyof RouteRegistry]:
        Awaited<ReturnType<RouteRegistry[K]['handler']>>
};
```

### 4. Server에서 Registry 사용

```typescript
// src/server/index.ts
import { Hono } from 'hono';
import { routeRegistry } from './routes.generated';
import { bind } from '@spfn/core/route';

const app = new Hono();

// Registry에서 라우트 자동 등록
for (const [key, route] of Object.entries(routeRegistry))
{
    const method = route.method.toLowerCase();
    const handler = bind(route.contract, route.handler);

    app[method](route.path, handler);
}

export default app;
```

### 5. 클라이언트 타입 자동 생성

```typescript
// src/lib/api/index.generated.ts (자동 생성)
import type { RouteRegistry, RouteResponses } from '@/server/routes.generated';

type ExtractData<T> = T extends { success: true; data: infer D } ? D : T;

export type GetUserResponse = ExtractData<RouteResponses['GET /users/:id']>;
export type GetUsersResponse = ExtractData<RouteResponses['GET /users']>;

// Client 함수 생성
export const getUser = (params: { id: string }) =>
    client.get('/users/:id', { params });

export const api = {
    getUser,
    getUsers,
    // ...
} as const;
```

### 6. 사용 예시

```typescript
// Frontend에서 사용
const user = await api.getUser({ id: '123' });
// user의 타입이 자동 추론됨!
// type: { id: string; name: string; email: string; ... }

// DB 엔티티 변경 시
// 1. Handler 코드 수정 없음
// 2. Codegen 자동 실행
// 3. 클라이언트 타입 자동 업데이트
// 4. 타입 에러로 즉시 감지
```

---

## Trade-offs Analysis

### vs tRPC

| 측면 | tRPC | SPFN (Proposed) |
|------|------|-----------------|
| **라우트 정의** | 수동 export | 파일 기반 자동 |
| **타입 캡처** | 전체 router object | Registry codegen |
| **성능 (대규모)** | TS 컴파일 느려짐 | Flat structure로 완화 |
| **스키마 validation** | Zod (느림) | TypeBox (빠름) |
| **번들 크기** | Router 전체 | 필요한 것만 tree-shake |

### 성능 고려사항

#### 1. TypeScript 컴파일 성능

**tRPC 방식의 문제:**
```typescript
// 500개 procedure → 깊은 중첩 타입
type AppRouter = {
    user: {
        get: Proc1,
        getById: Proc2,
        // ... 100+ procedures
    },
    post: { ... },
    // ... 10+ 리소스
}

// 클라이언트에서 추론 시 전체 그래프 순회
type Output = inferRouterOutputs<AppRouter>['user']['getById']
// → TS compiler 부하
```

**SPFN Flat Structure:**
```typescript
// Flat object로 lookup 빠름
export const routeRegistry = {
    'GET /users': { ... },
    'GET /users/:id': { ... },
    // ... 500+ routes
} as const;

// Direct access, 깊은 순회 불필요
type Response = RouteResponses['GET /users/:id'];
```

**예상 성능:**
- ~100 routes: 차이 미미
- 100-500 routes: SPFN 우위 (flat structure)
- 500+ routes: 둘 다 느려질 수 있음
  - 해결: Module splitting (리소스별 분리)

#### 2. Codegen 성능

```typescript
// Watch mode: 파일 변경 시 즉시 재생성
// - 변경된 파일만 scan
// - Incremental generation
// - 평균 < 100ms

// Build mode: 전체 재생성
// - 500 routes: ~1초
// - Cold start acceptable
```

### 장점

1. **개발자 경험**
   - Response 스키마 작성 불필요
   - DB 엔티티 직접 사용
   - 타입 불일치 컴파일 타임 검증

2. **유지보수성**
   - DB 스키마 변경 → 타입 자동 동기화
   - 보일러플레이트 50% 감소

3. **타입 안전성**
   - Handler 반환값과 클라이언트 타입 일치 보장
   - 런타임 에러 → 컴파일 에러

4. **성능**
   - TypeBox validation 유지 (빠름)
   - Flat registry → TS 컴파일 빠름

### 단점

1. **복잡도 증가**
   - Codegen 레이어 추가
   - Watch mode 필요

2. **빌드 프로세스 의존**
   - Codegen 실패 시 서버 시작 불가
   - CI/CD에 codegen 단계 추가

3. **동적 라우트의 이점 상실**
   - 플러그인 시스템에서 런타임 라우트 추가 어려움
   - Function package 동적 로딩 제한

4. **타입 추론 한계**
   - 매우 복잡한 conditional types는 여전히 어려움
   - Recursive types 처리 필요

---

## Implementation Plan

### Phase 1: PoC (1-2주)

**목표:** 기본 동작 검증

1. **Route Scanner 구현**
   ```typescript
   // packages/core/src/codegen/route-scanner.ts
   - 파일 시스템 스캔
   - Handler export 감지 (GET, POST, etc.)
   - Contract export 추출
   ```

2. **Registry Generator 구현**
   ```typescript
   // packages/core/src/codegen/registry-generator.ts
   - routes.generated.ts 생성
   - Flat structure 생성
   - Type exports
   ```

3. **Client Generator 수정**
   ```typescript
   // packages/core/src/codegen/built-in/contract/emitter.ts
   - Registry 기반으로 타입 추론
   - Response 타입 자동 추출
   ```

4. **테스트**
   - 단순 CRUD 라우트 3개
   - 타입 추론 검증
   - End-to-end 테스트

### Phase 2: Core Features (2-3주)

1. **Watch Mode**
   ```typescript
   - chokidar로 파일 변경 감지
   - Incremental generation
   - HMR 통합
   ```

2. **Error Handling**
   ```typescript
   - Handler export 누락 감지
   - Contract 타입 검증
   - 명확한 에러 메시지
   ```

3. **Complex Types 지원**
   ```typescript
   - Union types
   - Optional fields
   - Nested objects
   - Arrays
   ```

4. **Migration Guide**
   - 기존 프로젝트 마이그레이션 문서
   - Codemod 스크립트

### Phase 3: Advanced Features (2-3주)

1. **Function Package 지원**
   ```typescript
   - External routes codegen
   - Prefix 처리
   - Module splitting
   ```

2. **Performance Optimization**
   ```typescript
   - Parallel generation
   - Cache layer
   - Smart invalidation
   ```

3. **DX Improvements**
   ```typescript
   - CLI 명령어: spfn codegen
   - VS Code extension 업데이트
   - Better error messages
   ```

### Phase 4: Production Ready (1-2주)

1. **Testing**
   - Unit tests
   - Integration tests
   - Performance benchmarks

2. **Documentation**
   - API reference
   - Migration guide
   - Best practices

3. **Release**
   - Beta release
   - Community feedback
   - v1.0 release

---

## Open Questions

### 1. Function Package 동적 로딩

**문제:**
현재는 Function packages를 런타임에 동적 로딩:
```typescript
const functionRoutes = discoverFunctionRoutes();
for (const func of functionRoutes)
{
    await loader.loadExternalRoutes(app, func.routesDir, func.prefix);
}
```

**질문:**
- Codegen 방식에서 어떻게 처리?
- Build time에 모든 function packages scan?
- 아니면 hybrid 방식? (core는 codegen, functions는 동적)

### 2. Registry 분할 전략

**문제:**
500+ routes → 거대한 registry

**옵션:**

A. **단일 Registry**
```typescript
export const routeRegistry = { ... 500 routes };
```
- 장점: 단순
- 단점: TS 느려질 수 있음

B. **리소스별 분할**
```typescript
export const userRoutes = { ... };
export const teamRoutes = { ... };
export const registry = {
    ...userRoutes,
    ...teamRoutes
};
```
- 장점: TS 빠름
- 단점: 복잡도

C. **자동 분할 (threshold 기반)**
```typescript
// 100개 이상이면 자동 split
```

**권장:** C (설정 가능)

### 3. Middleware 처리

**현재:**
```typescript
// Contract meta에 skipMiddlewares
meta: {
    skipMiddlewares: ['auth']
}
```

**Codegen 방식에서:**
```typescript
// Registry에 meta 포함?
export const routeRegistry = {
    'GET /users/:id': {
        handler: ...,
        contract: ...,
        meta: {
            skipMiddlewares: ['auth']
        }
    }
};

// 아니면 별도 파일?
export const middlewareConfig = {
    'GET /users/:id': {
        skip: ['auth']
    }
};
```

### 4. Response 타입 커스터마이징

**시나리오:**
DB에서 가져온 엔티티를 변환하여 반환:
```typescript
export const GET = async (c) =>
{
    const user = await db.user.findUnique({ ... });

    // ✅ 자동 추론 가능
    return c.success(user);

    // ❓ 변환하는 경우는?
    return c.success({
        ...user,
        fullName: `${user.firstName} ${user.lastName}`,
        createdAt: user.createdAt.toISOString() // Date → string
    });

    // Handler 반환값에서 추론은 되지만,
    // 명시적으로 타입을 선언하고 싶다면?
};
```

**옵션:**

A. **완전 자동 추론**
- Handler 반환값이 곧 Response 타입

B. **선택적 명시**
```typescript
export const GET: RouteHandler<ResponseType> = async (c) =>
{
    // ResponseType과 실제 반환값 일치 검증
};
```

C. **Hybrid**
```typescript
// 대부분 자동 추론
// 필요한 경우만 명시
export const responseType = Type.Object({ ... }); // Optional
```

### 5. Backward Compatibility

**문제:**
기존 사용자는 현재 구조 사용 중

**옵션:**

A. **Breaking Change**
- v2.0으로 릴리즈
- Migration guide 제공

B. **Opt-in**
```typescript
// spfn.config.ts
export default {
    routing: {
        mode: 'codegen' // or 'dynamic'
    }
}
```

C. **단계적 전환**
- v1.x: 두 방식 공존
- v2.0: Codegen만 지원

**권장:** B (Opt-in) → 충분한 피드백 후 A

---

## Next Steps

1. **팀 논의**
   - 제안 검토
   - Open Questions 답변
   - Go/No-go 결정

2. **PoC 구현** (Go 결정 시)
   - Phase 1 구현
   - 실제 프로젝트 테스트
   - 성능 측정

3. **피드백 수집**
   - 개발자 경험 평가
   - 성능 벤치마크
   - 개선 사항 도출

4. **최종 결정**
   - PoC 결과 기반
   - 구현 계획 확정
   - 릴리즈 로드맵

---

## References

- [tRPC Router Architecture](https://trpc.io/docs/server/routers)
- [TypeScript Performance](https://github.com/microsoft/TypeScript/wiki/Performance)
- [AutoRouteLoader Implementation](packages/core/src/route/auto-loader.ts)
- [Current Codegen](packages/core/src/codegen/built-in/contract/emitter.ts)