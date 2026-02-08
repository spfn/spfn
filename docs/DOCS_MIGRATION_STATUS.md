# Documentation Migration Status

> Contract 패턴에서 Define-Route 패턴으로 문서 마이그레이션 진행 현황

## Migration Goal

모든 문서를 **define-route 패턴**으로 통일:
- `route.get('/path').input({...}).handler(...)` 형식
- `defineRouter({ routeName, ... })` 형식
- `NotFoundError({ resource: 'Name' })` 형식
- `src/lib/contracts/` 디렉토리 제거 (→ `src/server/routes/` 사용)

---

## Phase 1: Getting Started (완료)

| 문서 | 상태 | 비고 |
|------|------|------|
| introduction.md | ✅ 완료 | NotFoundError 사용법 수정 |
| installation.md | ✅ 점검완료 | 변경 불필요 |
| quick-start.md | ✅ 완료 | 전면 재작성 |
| first-api.md | ✅ 완료 | 전면 재작성 |
| project-structure.md | ✅ 완료 | contracts 디렉토리 제거 |

## Phase 2: Core Concepts (완료)

| 문서 | 상태 | 비고 |
|------|------|------|
| how-it-works.md | ✅ 완료 | 전면 재작성 |
| contracts.md | ✅ 완료 | 제목을 "Route Definition"으로 변경 |
| route-binding.md | ✅ 완료 | 제목을 "Route Context & Middleware"로 변경 |
| type-safety.md | ✅ 완료 | 전면 재작성 |
| client-generation.md | ✅ 완료 | RPC 스타일 클라이언트로 재작성 |
| middleware.md | ✅ 완료 | defineMiddleware 패턴으로 재작성 |
| build-process.md | ✅ 완료 | defineRouter 기반으로 재작성 |

## Phase 3: API Reference (완료)

| 문서 | 상태 | 비고 |
|------|------|------|
| app.md | ✅ 완료 | defineServerConfig, defineMiddleware 패턴 적용 |
| logger.md | ✅ 점검완료 | 변경 불필요 |
| events.md | ✅ 점검완료 | 변경 불필요 |
| context.md | ✅ 완료 | define-route 패턴으로 재작성 |
| cli.md | ✅ 완료 | codegen 섹션 업데이트 (RPC 클라이언트) |
| middleware.md | ✅ 완료 | defineMiddleware 패턴으로 재작성 |
| route-contract.md | ✅ 삭제됨 | 구식 Contract 패턴 문서 제거 |

## Phase 4: Guides (완료)

| 문서 | 상태 | 비고 |
|------|------|------|
| error-handling.md | ✅ 완료 | define-route 패턴으로 재작성 |
| deployment.md | ✅ 점검완료 | 변경 불필요 |
| testing.md | ✅ 완료 | define-route 패턴으로 재작성 |
| custom-generators.md | ✅ 완료 | Contract 참조 제거 |
| database.md | ✅ 완료 | define-route 패턴으로 재작성 |
| environment.md | ✅ 점검완료 | 변경 불필요 |

## Phase 5: Other Sections (완료)

| 문서 | 상태 | 비고 |
|------|------|------|
| philosophy/our-philosophy.md | ✅ 완료 | 전면 재작성 (Contract → define-route) |
| philosophy/why-typebox.md | ✅ 점검완료 | 변경 불필요 (TypeBox 설명 문서) |
| philosophy/why-postgresql.md | ✅ 점검완료 | 변경 불필요 |
| philosophy/why-hono.md | ✅ 점검완료 | 변경 불필요 |
| philosophy/why-nextjs.md | ✅ 점검완료 | 변경 불필요 |
| ecosystem/creating-modules.md | ✅ 완료 | define-route 패턴으로 재작성 |
| ecosystem/cms/*.md | ✅ 점검완료 | CMS 고유 문서, 변경 불필요 |
| discussions/*.md | ✅ 점검완료 | 아키텍처 RFC 문서 (역사적 참고용) |

---

## Key Changes Summary

### Before (Contract Pattern)
```typescript
// src/lib/contracts/users.ts
export const getUserContract = {
    method: 'GET',
    path: '/users/:id',
    params: Type.Object({ id: Type.String() }),
    response: UserSchema
} satisfies RouteContract;

// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
const app = createApp();
app.bind(getUserContract, async (c) => { ... });
```

### After (Define-Route Pattern)
```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        // ...
    });

// src/server/router.ts
import { defineRouter } from '@spfn/core/route';
export const appRouter = defineRouter({ getUser });
```

### Error Classes
```typescript
// Before
throw new NotFoundError('User', params.id);

// After
throw new NotFoundError({ resource: 'User' });
```

---

## Next Steps

1. ~~**Phase 2 완료**: client-generation.md, middleware.md, build-process.md 재작성~~ ✅
2. ~~**Phase 3 완료**: api-reference 섹션 점검 및 수정~~ ✅
3. ~~**Phase 4 완료**: guides 섹션 점검 및 수정~~ ✅
4. ~~**Phase 5 완료**: 기타 섹션 점검 (philosophy, ecosystem, discussions)~~ ✅

**🎉 마이그레이션 완료!** 모든 문서가 define-route 패턴으로 통일되었습니다.

---

## Phase 6: Public Docs ↔ Core Docs 동기화

`packages/core/docs/` 내부 문서와 `docs/` 공개 문서 간 불일치를 해소하는 작업.

### Phase 6.1: Event 문서 전면 교체

| 문서 | 상태 | 비고 |
|------|------|------|
| api-reference/events.md | ✅ 완료 | defineEvent/defineEventRouter/SSE 기반으로 전면 재작성 |

### Phase 6.2: 누락 모듈 문서 추가

| 문서 | 상태 | 비고 |
|------|------|------|
| api-reference/cache.md | ✅ 완료 | 신규 작성 - Redis 캐시 기본 ops, hash/list, TTL |
| guides/jobs.md | ✅ 완료 | 신규 작성 - job() 빌더 API, 4가지 타입, JobRouter |
| api-reference/codegen.md | ✅ 완료 | 신규 작성 - defineConfig, CLI, 생성된 클라이언트 |
| guides/nextjs.md | ✅ 완료 | 신규 작성 - RPC proxy, createApi, 인터셉터 |
| guides/file-upload.md | ✅ 완료 | 신규 작성 - FileSchema, 스토리지 패턴, 보안 |

### Phase 6.3: 기존 문서 보강

| 문서 | 상태 | 비고 |
|------|------|------|
| core-concepts/contracts.md | ✅ 완료 | cookies/formData input, response helpers, .skip(), router composition, Nullable 추가 |
| guides/entity.md | ✅ 완료 | 신규 작성 - 11종 column helpers, indexes, relations, schema namespacing |
| guides/repository.md | ✅ 완료 | 신규 작성 - BaseRepository, where/query options, 비즈니스 로직 패턴 |

### Phase 6.4: 상호 참조

| From | To | 상태 |
|------|----|------|
| events.md | jobs.md, cache.md | ✅ |
| jobs.md | events.md, app.md | ✅ |
| codegen.md | nextjs.md, custom-generators.md | ✅ |
| nextjs.md | codegen.md, file-upload.md | ✅ |
| file-upload.md | contracts.md, error-handling.md | ✅ |
| contracts.md | file-upload.md, entity.md | ✅ |
| entity.md | database.md, repository.md | ✅ |
| repository.md | entity.md, database.md, testing.md | ✅ |

## Notes

- 문서 점검 시 실제 코드(`packages/core/src/`)와 일치 여부 확인 필수
- CLI 템플릿(`packages/cli/templates/`)과 예제 코드 일관성 유지
- 문서 내 링크가 올바른지 확인 (제목 변경된 문서 링크 수정)
- **core/docs/job.md는 오래된 API(defineJob/enqueue/schedule)를 기술** - 실제 API는 job() 빌더 패턴
- **core/docs/codegen.md는 defineCodegenConfig 사용** - 실제 export는 defineConfig