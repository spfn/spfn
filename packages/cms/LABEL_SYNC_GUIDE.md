# Label Auto-Sync 가이드

`@spfn/cms`의 라벨 자동 동기화 기능을 사용하는 방법을 설명합니다.

## 개요

라벨을 `defineLabelSection`으로 정의하면 자동으로 DB와 동기화할 수 있습니다:

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
      verbose: true,        // 진행 상황 로그 출력
      updateExisting: false, // 기존 라벨 업데이트 안함 (기본값)
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

### 방법 A: .spfnrc.json 설정 (권장)

프로젝트 루트에 `.spfnrc.json` 파일을 생성하고 label-sync 제너레이터를 추가합니다:

```json
{
  "codegen": {
    "generators": [
      {
        "name": "contract",
        "enabled": true
      },
      {
        "path": "./src/generators/label-sync.ts"
      }
    ]
  }
}
```

`src/generators/label-sync.ts` 파일 생성:

```typescript
import { createLabelSyncGenerator } from '@spfn/cms';

export default createLabelSyncGenerator();
```

### 방법 B: 커스텀 제너레이터

더 세밀한 제어가 필요한 경우:

```typescript
import { LabelSyncGenerator } from '@spfn/cms';

export default new LabelSyncGenerator();
```

또는 커스터마이징:

```typescript
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { syncAll } from '@spfn/cms';

export default {
  name: 'my-label-sync',

  // 감시할 파일 패턴 (커스터마이징 가능)
  watchPatterns: [
    'src/labels/**/*.ts',
    'src/app/**/labels.ts',
  ],

  async generate(options: GeneratorOptions) {
    await syncAll({
      verbose: options.debug,
      updateExisting: true, // 커스터마이징
    });
  },

  async onFileChange(filePath: string, event: string) {
    console.log(`Label file ${event}: ${filePath}`);
    await this.generate({ cwd: process.cwd(), debug: true });
  },
} satisfies Generator;
```

### 개발 서버 실행

```bash
# codegen watch 모드와 함께 개발 서버 실행
spfn dev

# 또는 수동으로
pnpm dev
```

라벨 파일(`src/labels/**/*.ts`)을 수정하면 자동으로 DB에 동기화됩니다.

---

## 3. 라벨 정의 예시

```typescript
// src/labels/layout.ts
import { defineLabelSection } from '@spfn/cms';

export const layoutLabels = defineLabelSection('layout', {
  nav: {
    home: {
      key: 'layout.nav.home',
      defaultValue: { ko: '홈', en: 'Home' },
    },
    about: {
      key: 'layout.nav.about',
      defaultValue: { ko: '소개', en: 'About' },
    },
  },
  footer: {
    copyright: {
      key: 'layout.footer.copyright',
      defaultValue: { ko: '© 2025 회사명', en: '© 2025 Company' },
      description: 'Footer copyright text',
    },
  },
});
```

이 파일을 저장하면:
1. **서버 시작 시**: `initLabelSync()`가 자동으로 DB에 등록
2. **개발 중**: 파일 수정 시 `LabelSyncGenerator`가 자동으로 재동기화

---

## 4. CLI 명령어

### 수동으로 라벨 동기화

```typescript
// scripts/sync-labels.ts
import { syncAll } from '@spfn/cms';

await syncAll({
  verbose: true,
  updateExisting: false,
  removeUnused: false,
});
```

실행:

```bash
tsx scripts/sync-labels.ts
```

### Codegen 명령어

```bash
# 제너레이터 목록 확인
spfn codegen list

# 한 번만 실행 (watch 안함)
spfn codegen run

# 초기화
spfn codegen init
```

---

## 5. 워크플로우 예시

### 개발 워크플로우

1. **서버 시작**
   ```bash
   pnpm dev
   ```
   → `initLabelSync()` 실행 → 모든 라벨 동기화

2. **라벨 파일 수정**
   ```typescript
   // src/labels/home.ts에서 라벨 추가/수정
   ```
   → `LabelSyncGenerator` 감지 → 자동 재동기화

3. **결과 확인**
   - 콘솔에 sync 결과 출력
   - DB에 자동 반영
   - Published cache 자동 업데이트

### 프로덕션 배포

```bash
# 1. 빌드 전 라벨 동기화
tsx scripts/sync-labels.ts

# 2. 빌드
pnpm build

# 3. 배포
# 서버 시작 시 initLabelSync()가 자동 실행됨
```

---

## 6. 트러블슈팅

### Q. 라벨이 동기화되지 않아요

**A.** 다음을 확인하세요:

1. `defineLabelSection`을 사용했는지 확인
2. 라벨 파일이 `watchPatterns`에 매칭되는지 확인 (기본값: `src/**/labels/**/*.ts`)
3. 서버가 개발 모드(`NODE_ENV=development`)로 실행 중인지 확인

### Q. 파일 변경이 감지되지 않아요

**A.** Codegen watch 모드가 활성화되어 있는지 확인:

```bash
# dev 명령어가 codegen watch를 포함하는지 확인
spfn dev

# 또는 별도로 실행
spfn codegen run --watch
```

### Q. 특정 디렉토리만 감시하고 싶어요

**A.** 커스텀 제너레이터의 `watchPatterns`를 수정:

```typescript
export default {
  name: 'label-sync',
  watchPatterns: [
    'src/app/**/labels.ts',  // app 디렉토리만
  ],
  // ...
} satisfies Generator;
```

---

## 7. 모범 사례

### ✅ DO

- **서버 시작 시 sync**: 항상 `initLabelSync()`를 `beforeRoutes`에서 호출
- **개발 중 watch**: `.spfnrc.json`에 label-sync 제너레이터 추가
- **라벨 파일 구조화**: 섹션별로 파일 분리 (`src/labels/home.ts`, `src/labels/layout.ts`)
- **타입 안전성**: TypeScript와 함께 사용

### ❌ DON'T

- `updateExisting: true`를 프로덕션에서 사용 (의도치 않은 덮어쓰기 방지)
- 수동으로 DB를 직접 수정 (항상 라벨 정의 파일을 통해 관리)
- 동일한 `key`를 여러 섹션에서 사용

---

## 8. Import 구조

### Backend + Server Components (`@spfn/cms`)

서버에서만 실행되는 코드:

```typescript
// 서버 컴포넌트
import { getSection, getSections } from '@spfn/cms';

// 백엔드: Sync
import { initLabelSync, syncAll, syncSection } from '@spfn/cms';

// 백엔드: Repositories
import { cmsLabelsRepository } from '@spfn/cms';

// 백엔드: Label 정의
import { defineLabelSection } from '@spfn/cms';

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

## 9. 아키텍처

```
┌─────────────────────────────────────────────────────┐
│  Application Layer                                   │
│  ┌────────────────┐      ┌────────────────────┐    │
│  │ defineLabelSection │  │  Label Files      │    │
│  │   (runtime)     │      │  src/labels/*.ts  │    │
│  └────────┬───────┘      └────────┬───────────┘    │
│           │                       │                 │
│           └───────────┬───────────┘                 │
│                       │                             │
│                       │ registers                   │
│                       ▼                             │
│            ┌─────────────────────┐                 │
│            │ registeredSections  │                 │
│            │       (Map)         │                 │
│            └──────────┬──────────┘                 │
└───────────────────────┼──────────────────────────────┘
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
│  │ syncAll()    │  ←  │ LabelSyncGenerator     │  │
│  │              │      │  (file watcher)        │  │
│  └──────┬───────┘      └────────────────────────┘  │
│         │                                           │
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
- [defineLabelSection API](./src/labels/helpers.ts)
- [Sync API](./src/sync.ts)
- [Codegen 시스템](../core/src/codegen/README.md)