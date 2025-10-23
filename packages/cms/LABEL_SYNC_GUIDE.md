# Label Auto-Sync 가이드

`@spfn/cms`의 JSON 파일 기반 라벨 자동 동기화 기능을 사용하는 방법을 설명합니다.

## 개요

JSON 파일로 라벨을 정의하면 자동으로 DB와 동기화됩니다:

1. **서버 시작 시 자동 sync**: `initLabelSync()` - 서버가 시작될 때 한 번 실행
2. **개발 시 파일 감시**: `LabelSyncGenerator` - 라벨 파일 변경 시 자동으로 재동기화

---

## 1. 서버 시작 시 자동 Sync

### 설정 방법

`src/server/server.config.ts` 파일에서 `beforeRoutes` 훅을 사용합니다:

```typescript
import type { ServerConfig } from '@spfn/core/server';
import { initLabelSync } from '@spfn/cms';

export default {
  beforeRoutes: async (app) => {
    // 서버 시작 시 라벨 자동 동기화
    await initLabelSync({
      verbose: true,          // 진행 상황 로그 출력
      updateExisting: false,  // 기존 라벨 업데이트 안함 (기본값)
      labelsDir: 'src/cms/labels',  // JSON 파일 디렉토리 (기본값)
    });
  },
} satisfies ServerConfig;
```

### 옵션

```typescript
interface SyncOptions {
  // Dry run - 실제로 적용하지 않고 변경사항만 출력
  dryRun?: boolean;

  // 기존 라벨의 defaultValue 업데이트 여부
  updateExisting?: boolean;

  // 사용되지 않는 라벨 삭제 여부
  removeUnused?: boolean;

  // Verbose 출력 (개발 환경에서 자동 활성화)
  verbose?: boolean;

  // 라벨 디렉토리 경로
  labelsDir?: string;
}
```

### 출력 예시

```
🔄 Initializing label sync...

[layout] Found 5 labels in definition
[layout] Found 5 labels in DB
[home] Found 12 labels in definition
[home] Found 10 labels in DB
  [CREATE] home.hero.title
  [CREATE] home.hero.subtitle
  [CACHE] Updating published cache for section: home

✅ Label sync completed

   Sections: 2
   Created:  2
   Updated:  0
   Unchanged: 13
```

---

## 2. 개발 시 파일 감시 + 자동 Sync

### .spfnrc.json 설정 (자동 구성됨)

프로젝트의 `.spfnrc.json` 파일에 label-sync 제너레이터가 자동으로 추가됩니다:

```json
{
  "codegen": {
    "generators": [
      {
        "name": "@spfn/cms:label-sync",
        "enabled": true
      }
    ]
  }
}
```

이 설정은 `pnpm spfn add @spfn/cms` 실행 시 자동으로 생성됩니다.

### 개발 서버 실행

```bash
# codegen watch 모드와 함께 개발 서버 실행
spfn dev

# 또는
pnpm dev
```

라벨 파일(`src/cms/labels/**/*.json`)을 수정하면 자동으로 DB에 동기화됩니다.

---

## 3. 라벨 정의 예시

### 파일 구조

```
src/cms/labels/
  layout/              # 섹션 이름
    nav.json           # 카테고리
    footer.json
  home/
    hero.json
    features.json
```

### 기본 라벨

`src/cms/labels/layout/nav.json`:

```json
{
  "whyFutureplay": {
    "key": "layout.nav.why-futureplay",
    "defaultValue": "Why FuturePlay",
    "description": "Navigation link for Why FuturePlay page"
  },
  "ourCompanies": {
    "key": "layout.nav.our-companies",
    "defaultValue": "Our Companies"
  },
  "team": {
    "key": "layout.nav.team",
    "defaultValue": "Team"
  }
}
```

### 다국어 라벨

`src/cms/labels/home/hero.json`:

```json
{
  "title": {
    "key": "home.hero.title",
    "defaultValue": {
      "ko": "미래를 만드는 플랫폼",
      "en": "Platform for the Future"
    },
    "description": "Main hero title"
  },
  "subtitle": {
    "key": "home.hero.subtitle",
    "defaultValue": {
      "ko": "혁신적인 게임과 서비스로 세상을 바꿉니다",
      "en": "Changing the world with innovative games and services"
    }
  }
}
```

### 변수 치환

`src/cms/labels/layout/footer.json`:

```json
{
  "copyright": {
    "key": "layout.footer.copyright",
    "defaultValue": "© {year} FuturePlay. All rights reserved.",
    "description": "Copyright text with year variable"
  },
  "greeting": {
    "key": "layout.footer.greeting",
    "defaultValue": "Welcome back, {name}!"
  }
}
```

**동작:**

이 파일을 저장하면:
1. **서버 시작 시**: `initLabelSync()`가 자동으로 DB에 등록
2. **개발 중**: 파일 수정 시 `LabelSyncGenerator`가 자동으로 재동기화

---

## 4. 워크플로우 예시

### 개발 워크플로우

1. **서버 시작**
   ```bash
   pnpm dev
   ```
   → `initLabelSync()` 실행 → 모든 라벨 동기화

2. **라벨 파일 추가/수정**
   ```bash
   # 새 라벨 파일 생성
   cat > src/cms/labels/layout/test.json <<EOF
   {
     "newLabel": {
       "key": "layout.test.new",
       "defaultValue": "New Label"
     }
   }
   EOF
   ```
   → `LabelSyncGenerator` 감지 → 자동 재동기화

3. **결과 확인**
   ```
   [label-sync] Label file change { file: 'src/cms/labels/layout/test.json' }
   [label-sync] Found 1 sections
   [layout] Found 1 labels in definition
   [layout] Found 0 labels in DB
     [CREATE] layout.test.new
     [CACHE] Updating published cache for section: layout
   [label-sync] Label sync completed { sections: 1, created: 1, updated: 0, errors: 0 }
   ```

### 프로덕션 배포

```bash
# 1. 빌드
pnpm build

# 2. 배포
# 서버 시작 시 initLabelSync()가 자동 실행됨
# (개발 모드가 아니므로 updateExisting: false)
```

---

## 5. 트러블슈팅

### Q. 라벨이 동기화되지 않아요

**A.** 다음을 확인하세요:

1. JSON 파일이 `src/cms/labels/` 디렉토리에 있는지 확인
2. 파일 구조가 올바른지 확인 (section/category.json)
3. 서버가 개발 모드(`NODE_ENV=development`)로 실행 중인지 확인
4. `.spfnrc.json`에 label-sync 제너레이터가 활성화되어 있는지 확인

### Q. 파일 변경이 감지되지 않아요

**A.** Codegen watch 모드가 활성화되어 있는지 확인:

```bash
# dev 명령어가 codegen watch를 포함하는지 확인
spfn dev

# 또는 별도로 실행
spfn codegen run --watch
```

### Q. 특정 디렉토리만 감시하고 싶어요

**A.** 커스텀 제너레이터 생성:

```typescript
// src/generators/label-sync.ts
import { createLabelSyncGenerator } from '@spfn/cms';

export default createLabelSyncGenerator({
  labelsDir: 'src/app/labels'  // 커스텀 경로
});
```

그리고 `.spfnrc.json` 수정:

```json
{
  "codegen": {
    "generators": [
      {
        "path": "./src/generators/label-sync.ts"
      }
    ]
  }
}
```

### Q. JSON 구조가 틀렸나요?

**A.** 올바른 JSON 형식:

```json
{
  "labelName": {
    "key": "section.category.name",
    "defaultValue": "Text or object",
    "description": "Optional"
  }
}
```

필수 필드:
- `key`: 고유 식별자
- `defaultValue`: 문자열 또는 다국어 객체

---

## 6. 모범 사례

### ✅ DO

- **서버 시작 시 sync**: 항상 `initLabelSync()`를 `beforeRoutes`에서 호출
- **개발 중 watch**: `.spfnrc.json`에 label-sync 제너레이터 추가
- **라벨 파일 구조화**: 섹션별로 폴더 분리, 카테고리별로 JSON 파일 분리
- **JSON 검증**: JSON 파일 작성 시 구문 오류 주의
- **명확한 key**: 라벨 키는 `section.category.name` 형식 사용

### ❌ DON'T

- `updateExisting: true`를 프로덕션에서 사용 (의도치 않은 덮어쓰기 방지)
- 수동으로 DB를 직접 수정 (항상 JSON 파일을 통해 관리)
- 동일한 `key`를 여러 섹션에서 사용
- JSON 구조 무시 (key, defaultValue 필수)

---

## 7. Import 구조

### Backend + Server Components (`@spfn/cms`)

서버에서만 실행되는 코드:

```typescript
// 서버 컴포넌트
import { getSection, getSections } from '@spfn/cms/server';

// 백엔드: Sync
import { initLabelSync, syncAll, syncSection } from '@spfn/cms';

// 백엔드: JSON 로드
import { loadLabelsFromJson } from '@spfn/cms';

// 백엔드: Repositories
import { cmsLabelsRepository } from '@spfn/cms';

// 백엔드: Codegen
import { createLabelSyncGenerator } from '@spfn/cms';
```

### Client Components (`@spfn/cms/client`)

브라우저에서 실행되는 코드:

```typescript
'use client';

// Hooks
import { useSection, useSections, useCmsStore } from '@spfn/cms/client';

// API Client
import { cmsApi } from '@spfn/cms/client';

// Initializer
import { InitCms } from '@spfn/cms/client';
```

---

## 8. 아키텍처

```
┌────────────────────────────────────────────────────┐
│  JSON Files Layer                                  │
│  ┌───────────────────┐                            │
│  │ src/cms/labels/   │                            │
│  │   layout/         │                            │
│  │     nav.json      │                            │
│  │     footer.json   │                            │
│  │   home/           │                            │
│  │     hero.json     │                            │
│  └──────────┬────────┘                            │
└─────────────┼──────────────────────────────────────┘
              │
              │ reads
              ▼
┌─────────────────────────────────────────────────────┐
│  Sync Layer                                          │
│  ┌──────────────┐      ┌────────────────────────┐  │
│  │ initLabelSync │  ←  │ beforeRoutes Hook      │  │
│  │  (startup)    │      │  (server.config.ts)    │  │
│  └──────┬───────┘      └────────────────────────┘  │
│         │                                           │
│  ┌──────┴───────┐      ┌────────────────────────┐  │
│  │ loadLabelsFrom│  ←  │ LabelSyncGenerator     │  │
│  │ Json()       │      │  (file watcher)        │  │
│  └──────┬───────┘      └────────────────────────┘  │
│         │                                           │
│         │ sections array                            │
│         ▼                                           │
│  ┌──────────────┐                                  │
│  │ syncAll()    │                                  │
│  └──────┬───────┘                                  │
│         │ upserts                                   │
│         ▼                                           │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  Database Layer                                      │
│  ┌──────────────┐      ┌────────────────────────┐  │
│  │  cms_labels  │      │ cms_published_cache    │  │
│  └──────────────┘      └────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 참고

- [CMS 패키지 README](./README.md)
- [Sync API](./src/helpers/sync.ts)
- [Label Sync Generator](./src/generators/label-sync-generator.ts)
- [Codegen 시스템](../core/src/codegen/README.md)