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

## Phase 2: Core Concepts (진행중)

| 문서 | 상태 | 비고 |
|------|------|------|
| how-it-works.md | ✅ 완료 | 전면 재작성 |
| contracts.md | ✅ 완료 | 제목을 "Route Definition"으로 변경 |
| route-binding.md | ✅ 완료 | 제목을 "Route Context & Middleware"로 변경 |
| type-safety.md | ✅ 완료 | 전면 재작성 |
| client-generation.md | ❌ 미완료 | contract 패턴 사용 중, 재작성 필요 |
| middleware.md | ❌ 미완료 | `createApp`, `app.bind` 사용 중, 재작성 필요 |
| build-process.md | ❌ 미완료 | `src/lib/contracts/` 참조, 재작성 필요 |

## Phase 3: API Reference (미착수)

| 문서 | 상태 | 비고 |
|------|------|------|
| app.md | ❓ 점검필요 | |
| logger.md | ❓ 점검필요 | |
| events.md | ❓ 점검필요 | |
| context.md | ❓ 점검필요 | |
| cli.md | ❓ 점검필요 | |
| middleware.md | ❓ 점검필요 | |
| route-contract.md | ❓ 점검필요 | 삭제 또는 재작성 필요 가능성 |

## Phase 4: Guides (미착수)

| 문서 | 상태 | 비고 |
|------|------|------|
| error-handling.md | ❓ 점검필요 | |
| deployment.md | ❓ 점검필요 | |
| testing.md | ❓ 점검필요 | |
| custom-generators.md | ❓ 점검필요 | |
| database.md | ❓ 점검필요 | |
| environment.md | ❓ 점검필요 | |

## Phase 5: Other Sections (미착수)

| 섹션 | 상태 | 비고 |
|------|------|------|
| philosophy/ | ❓ 점검필요 | 패턴과 무관할 수 있음 |
| ecosystem/ | ❓ 점검필요 | CMS, Rayst 등 |
| discussions/ | ❓ 점검필요 | 제안서, 구현 문서 |

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

1. **Phase 2 완료**: client-generation.md, middleware.md, build-process.md 재작성
2. **Phase 3**: api-reference 섹션 점검 및 수정
3. **Phase 4**: guides 섹션 점검 및 수정
4. **Phase 5**: 기타 섹션 점검

## Notes

- 문서 점검 시 실제 코드(`packages/core/src/`)와 일치 여부 확인 필수
- CLI 템플릿(`packages/cli/templates/`)과 예제 코드 일관성 유지
- 문서 내 링크가 올바른지 확인 (제목 변경된 문서 링크 수정)