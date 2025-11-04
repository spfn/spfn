# @spfn/cms 아키텍처 문서

## 개요

@spfn/cms는 Next.js 기반 애플리케이션을 위한 타입 안전한 콘텐츠 관리 시스템입니다. JSON 파일 기반의 라벨 정의를 데이터베이스와 자동 동기화하고, 버전 관리 및 다국어 지원을 제공합니다.

## 핵심 특징

- **JSON 파일 기반**: 라벨을 JSON 파일로 정의하고 Git으로 관리
- **자동 동기화**: 서버 시작 시 JSON 파일을 DB와 자동 동기화
- **다국어 지원**: 50개 이상의 언어 지원
- **버전 관리**: Draft → Published 워크플로우
- **고성능 캐싱**: Published Cache로 17배 빠른 읽기 성능
- **타입 안전성**: TypeScript 기반 타입 추론
- **반응형 지원**: 브레이크포인트별 값 관리

## 아키텍처 구조

```
@spfn/cms
├── src/
│   ├── index.ts              # 공통 모듈 (설정, 상수, 타입)
│   ├── server.ts             # 서버 전용 (Server Components + 백엔드)
│   ├── client.ts             # 클라이언트 전용 (Client Components)
│   ├── actions.ts            # Server Actions
│   ├── api/                  # 생성된 API 클라이언트
│   │   ├── cms-labels-by-key.ts
│   │   ├── cms-labels.ts
│   │   └── cms-published-cache.ts
│   ├── server/
│   │   ├── config/           # CMS 설정
│   │   ├── entities/         # 데이터베이스 스키마
│   │   │   ├── cms-labels.ts           # 라벨 메타데이터
│   │   │   ├── cms-label-values.ts     # 라벨 실제 값
│   │   │   ├── cms-published-cache.ts  # 발행 캐시
│   │   │   ├── cms-draft-cache.ts      # 드래프트 캐시
│   │   │   └── cms-audit-logs.ts       # 감사 로그
│   │   ├── repositories/     # DB 접근 계층
│   │   │   ├── cms-labels.repository.ts
│   │   │   ├── cms-label-values.repository.ts
│   │   │   ├── cms-published-cache.repository.ts
│   │   │   └── cms-draft-cache.repository.ts
│   │   ├── routes/           # API 엔드포인트
│   │   │   ├── labels/       # 라벨 CRUD API
│   │   │   ├── values/       # 라벨 값 API
│   │   │   └── published-cache/ # 발행 캐시 API
│   │   ├── helpers/          # 헬퍼 함수
│   │   │   ├── sync.ts       # JSON → DB 동기화
│   │   │   ├── publish.ts    # Draft → Published 로직
│   │   │   └── locale.ts     # 로케일 관리
│   │   ├── labels/           # 라벨 처리 유틸
│   │   └── generators/       # 코드 생성기
│   ├── client/
│   │   ├── store/            # Zustand 상태 관리
│   │   │   └── cms.store.ts
│   │   ├── hooks/            # React 훅
│   │   │   ├── useSection.ts
│   │   │   └── useSections.ts
│   │   └── components/       # 클라이언트 컴포넌트
│   │       └── InitCms.tsx
│   └── lib/
│       ├── types/            # 공통 타입 정의
│       ├── constants/        # 상수 (로케일 정보 등)
│       └── contracts/        # API 계약 정의
│           ├── labels.ts
│           ├── values.ts
│           └── published-cache.ts
└── migrations/               # DB 마이그레이션 파일
```

## 데이터 모델

### 1. cms_labels (라벨 메타데이터)

라벨의 기본 정보와 발행 상태를 관리합니다.

```typescript
{
  id: number;              // Primary Key
  key: string;             // 라벨 키 (예: "home.hero.title")
  section: string;         // 섹션 (예: "home", "why-futureplay")
  type: string;            // 값 타입 ("text" | "image" | "video" | "file" | "object")
  defaultValue: string;    // 기본값 (JSON 문자열)
  description?: string;    // 설명
  publishedVersion?: number; // 현재 발행된 버전 (null = 미발행)
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**인덱스:**
- `key` (unique)
- `section`

### 2. cms_label_values (라벨 값)

라벨의 실제 값을 다국어 및 반응형 지원과 함께 저장합니다.

```typescript
{
  id: number;              // Primary Key
  labelId: number;         // Foreign Key → cms_labels.id
  version?: number;        // 버전 번호 (null = draft)
  locale: string;          // 언어 코드 ("ko" | "en" | "ja" ...)
  breakpoint?: string;     // 반응형 ("sm" | "md" | "lg" | "xl" | "2xl")
  value: JSONB;            // 실제 값 (JSONB 타입)
  createdAt: Date;
}
```

**UNIQUE 제약:** `(labelId, version, locale, breakpoint)`

**인덱스:**
- `(labelId, version)`
- `locale`

**Value 타입 예시:**
```typescript
// Text
{ type: "text", content: "Hello World" }

// Image
{ type: "image", url: "/uploads/hero.jpg", alt: "Hero", width: 1920, height: 1080 }

// Video
{ type: "video", url: "/uploads/demo.mp4", thumbnail: "/uploads/thumb.jpg", duration: 120 }

// File
{ type: "file", url: "/uploads/doc.pdf", filename: "document.pdf", size: 2048 }

// Object (재귀 구조)
{
  type: "object",
  fields: {
    title: { type: "text", content: "Feature 1" },
    icon: { type: "image", url: "/icons/feature1.svg" }
  }
}
```

### 3. cms_published_cache (발행 캐시)

발행된 콘텐츠를 섹션+언어 단위로 캐싱하여 초고속 읽기를 제공합니다.

```typescript
{
  id: number;
  section: string;         // 섹션 (예: "home")
  locale: string;          // 언어 (예: "ko")
  content: JSONB;          // 캐시된 콘텐츠 (Record<string, LabelValue>)
  version: number;         // 캐시 버전
  publishedAt: Date;
  publishedBy?: string;
}
```

**UNIQUE 제약:** `(section, locale)`

**인덱스:** `section`

**성능 비교:**
- 정규화 테이블 JOIN: 87ms
- 캐시 테이블: 5ms (17배 빠름)

**Content 구조 예시:**
```json
{
  "home.hero.title": { "type": "text", "content": "미래를 만드는 기업" },
  "home.hero.image": { "type": "image", "url": "/uploads/hero.jpg", "alt": "Hero" },
  "home.hero.subtitle": { "type": "text", "content": "혁신과 도전의 여정" }
}
```

### 4. cms_draft_cache (드래프트 캐시)

Draft 모드에서 빠른 프리뷰를 위한 캐시입니다.

### 5. cms_audit_logs (감사 로그)

모든 변경 이력을 추적합니다.

## 주요 프로세스

### 1. 라벨 동기화 프로세스 (JSON → DB)

서버 시작 시 실행되는 자동 동기화 프로세스입니다.

```
[Server Startup]
       ↓
[initLabelSync()]
       ↓
[loadLabelsFromJson()]  ← JSON 파일 스캔
       ↓
   {section}/
   ├── hero.json
   ├── features.json
   └── footer.json
       ↓
[extractLabels()]       ← 중첩 구조 → 플랫 구조 변환
       ↓
   home.hero.title
   home.hero.subtitle
   home.features.title
       ↓
[syncSection()]         ← 각 섹션 동기화
       ↓
   ├─ [CREATE] 신규 라벨
   ├─ [UPDATE] 기존 라벨 (updateExisting=true)
   └─ [DELETE] 미사용 라벨 (removeUnused=true)
       ↓
[updatePublishedCache()] ← 캐시 갱신
       ↓
   ✅ Sync Complete
```

**주요 함수:**

1. `initLabelSync()` - src/server/helpers/sync.ts:391
   - 서버 시작 시 호출
   - 환경에 따라 verbose 설정
   - `server.config.ts`의 `beforeRoutes` 훅에서 실행

2. `loadLabelsFromJson()` - src/server/helpers/sync.ts:36
   - 라벨 디렉토리 스캔
   - 섹션별 JSON 파일 로드
   - 중첩된 JSON 구조 파싱

3. `extractLabels()` - src/server/labels/index.ts
   - 중첩 구조를 플랫 구조로 변환
   - 예: `{ hero: { title: { key: "...", defaultValue: "..." } } }`
     → `[{ key: "home.hero.title", defaultValue: "..." }]`

4. `syncSection()` - src/server/helpers/sync.ts:146
   - 정의된 라벨과 DB의 라벨 비교
   - CREATE / UPDATE / DELETE 작업 수행
   - 트랜잭션 처리

5. `updatePublishedCache()` - src/server/helpers/sync.ts:320
   - 섹션의 모든 라벨 조회
   - 로케일별로 캐시 생성
   - UPSERT로 캐시 저장

### 2. 발행 프로세스 (Draft → Published)

관리자가 Draft를 발행하는 프로세스입니다.

```
[Admin Action]
       ↓
[publishLabel(labelId)]
       ↓
1. 라벨 조회
   ├─ cms_labels.findById(labelId)
   └─ publishedVersion 확인
       ↓
2. Draft 값 조회
   └─ cms_label_values (version=null)
       ↓
3. 버전 증가
   └─ nextVersion = (publishedVersion ?? 0) + 1
       ↓
4. Published로 복사
   ├─ INSERT INTO cms_label_values
   ├─   labelId, version=nextVersion, locale, value
   └─ 모든 locale/breakpoint 조합 복사
       ↓
5. publishedVersion 업데이트
   └─ UPDATE cms_labels SET publishedVersion = nextVersion
       ↓
6. Published Cache 갱신
   └─ updatePublishedCache(section)
       ↓
   ✅ Published v{nextVersion}
```

**주요 함수:**

1. `publishLabel()` - src/server/helpers/publish.ts:23
   - 단일 라벨 발행
   - 버전 관리
   - 감사 로그 생성

2. `updatePublishedCache()` - src/server/helpers/publish.ts:82
   - 섹션의 모든 라벨 재캐싱
   - 로케일별 캐시 생성
   - Fallback 처리 (defaultValue)

### 3. 클라이언트 데이터 로딩

클라이언트 컴포넌트에서 CMS 데이터를 사용하는 프로세스입니다.

```
[Client Component]
       ↓
[useSection('home', { autoLoad: true })]
       ↓
[useCmsStore]
   ├─ sections: {}       ← Zustand 상태
   └─ loading: {}
       ↓
   섹션이 없으면?
       ↓
[loadSection('home', 'ko')]
       ↓
[API Call: GET /_cms/published-cache?sections=home&locale=ko]
       ↓
[cmsPublishedCacheRepository.findBySection()]
       ↓
   ┌─────────────────┐
   │  DB Query       │
   │  SELECT content │
   │  FROM published │
   │  WHERE section  │
   │    AND locale   │
   └─────────────────┘
       ↓
   { section: 'home', locale: 'ko', content: {...}, version: 1 }
       ↓
[Store 업데이트]
   sections['home'] = sectionData
       ↓
[t('hero.title')] ← 라벨 접근
       ↓
   sectionData.content['home.hero.title']
       ↓
   ✅ "미래를 만드는 기업"
```

### 4. 서버 컴포넌트 데이터 로딩

서버 컴포넌트에서 CMS 데이터를 사용하는 프로세스입니다.

```
[Server Component]
       ↓
[await getSection('home')]
       ↓
[React cache] ← 동일 요청 내 중복 호출 방지
       ↓
   캐시 히트? → 반환
   캐시 미스? ↓
       ↓
[client.call(getPublishedCacheContract)]
   ← @spfn/core/client (singleton)
       ↓
[Internal API Call: GET /_cms/published-cache]
       ↓
[cmsPublishedCacheRepository.findBySection()]
       ↓
   DB에서 캐시 조회 (5ms)
       ↓
   { section, locale, content, version, publishedAt }
       ↓
[createTranslationFn()] ← t() 함수 생성
       ↓
   { t, data }
       ↓
[t('hero.title')]
   ↓ content['home.hero.title']
   ↓ 변수 치환 (replace)
   ↓ 타입 변환 (text.content 추출)
   ↓
   ✅ "미래를 만드는 기업"
```

## 모듈 설명

### 엔트리 포인트

#### 1. index.ts (공통 모듈)
- 설정 API: `getCmsConfig()`, `configureCms()`
- 상수: `DEFAULT_LABELS_DIR`, 로케일 정보
- 타입: `SectionData`, `SectionAPI`, `CmsConfig`

#### 2. server.ts (서버 전용)
**Server Components:**
- `getSection(section, locale?)`: 단일 섹션 로드
- `getSections(sections[], locale?)`: 여러 섹션 로드
- React `cache()` 적용으로 중복 요청 방지

**백엔드 유틸:**
- `initLabelSync()`: 라벨 동기화 초기화
- `syncSection()`, `syncAll()`: 동기화 함수
- Repository 및 Entity 내보내기

**특징:**
- 변수 치환 지원: `t('greeting', 'Hello {name}', { name: 'World' })`
- 타입 안전성: `t()` 함수는 any 타입이지만 실제 값에 따라 동적 처리
- 에러 핸들링: 실패 시 빈 섹션 반환 (graceful degradation)

#### 3. client.ts (클라이언트 전용)
**Hooks:**
- `useSection(section, options)`: 단일 섹션 훅
- `useSections(sections, options)`: 여러 섹션 훅
- `useCmsStore`: Zustand 스토어 직접 접근

**Components:**
- `InitCms`: 클라이언트 초기화 컴포넌트

**Server Actions:**
- `getLocale()`, `setLocale()`: 로케일 관리
- `getLocales()`, `getLocalesWithInfo()`: 로케일 조회

#### 4. actions.ts (Server Actions)
- `use server` 디렉티브
- 로케일 관리 액션들

#### 5. api/ (생성된 API 클라이언트)
- `@spfn/core:contract` 코드 생성기로 생성
- TypeScript 타입 안전 API 클라이언트
- `cmsApi.getPublishedCache()`, `cmsApi.getLabels()` 등

### Server 모듈

#### entities/ (데이터베이스 스키마)
Drizzle ORM 스키마 정의:
- `cms-labels.ts`: 라벨 메타데이터
- `cms-label-values.ts`: 라벨 값 (다국어, 반응형)
- `cms-published-cache.ts`: 발행 캐시
- `cms-draft-cache.ts`: 드래프트 캐시
- `cms-audit-logs.ts`: 감사 로그

각 엔티티는 `@spfn/core/db`의 `createFunctionSchema()`를 사용하여 격리된 스키마 생성.

#### repositories/ (DB 접근 계층)
`@spfn/core/db`의 헬퍼 함수 활용:
- `findOne()`, `findMany()`: 조회
- `create()`: 생성
- `updateOne()`: 수정
- `deleteOne()`: 삭제
- `count()`: 카운트

**주요 Repository:**
- `cms-labels.repository.ts`: 라벨 CRUD
- `cms-label-values.repository.ts`: 값 CRUD, Draft/Published 조회
- `cms-published-cache.repository.ts`: 캐시 CRUD, UPSERT
- `cms-draft-cache.repository.ts`: Draft 캐시

#### routes/ (API 엔드포인트)
SPFN 파일 기반 라우팅:

```
routes/
├── labels/
│   ├── index.ts                    # GET /labels, POST /labels
│   ├── [id]/
│   │   └── index.ts                # GET /labels/:id, PUT, DELETE
│   ├── [labelId]/
│   │   ├── versions/index.ts       # GET /labels/:labelId/versions
│   │   ├── admin/index.ts          # PUT /labels/:labelId/admin
│   │   └── publish/index.ts        # POST /labels/:labelId/publish
│   └── by-key/
│       └── [key]/index.ts          # GET /labels/by-key/:key
├── values/
│   └── [labelId]/
│       ├── index.ts                # GET /values/:labelId
│       └── [version]/index.ts      # GET /values/:labelId/:version
└── published-cache/
    └── index.ts                    # GET /published-cache?sections=...&locale=...
```

**계약 정의 (Contracts):**
- `src/lib/contracts/labels.ts`: 라벨 API 계약
- `src/lib/contracts/values.ts`: 값 API 계약
- `src/lib/contracts/published-cache.ts`: 캐시 API 계약

계약 → 코드 생성 → `src/api/` 자동 생성

#### helpers/ (헬퍼 함수)
- `sync.ts`: JSON → DB 동기화 로직
- `publish.ts`: Draft → Published 로직
- `locale.ts`: 로케일 유틸리티
- `locale.actions.ts`: Server Actions

#### labels/ (라벨 처리)
- `helpers.ts`: 중첩 구조 → 플랫 구조 변환
- `extractLabels()`: 라벨 추출 및 변환

#### generators/ (코드 생성기)
- `label-sync-generator.ts`: SPFN 코드 생성기 통합

### Client 모듈

#### store/ (상태 관리)
`cms.store.ts`:
- Zustand 기반 상태 관리
- `sections`: 섹션별 데이터
- `loading`: 로딩 상태
- `loadSection()`: 비동기 로드
- `updateLabel()`: Draft 모드용 라벨 업데이트

#### hooks/ (React 훅)
`useSection.ts`:
- 단일 섹션 사용 훅
- `autoLoad` 옵션으로 자동 로드
- `t()` 함수 제공 (서버와 동일한 API)

`useSections.ts`:
- 여러 섹션 사용 훅
- 병렬 로드

#### components/
`InitCms.tsx`:
- 클라이언트 초기화
- 서버에서 전달받은 데이터를 스토어에 주입

### Lib 모듈

#### types/ (타입 정의)
- `LabelType`: 라벨 타입 enum
- `LabelDefinition`: 라벨 정의
- `NestedLabels`: 중첩 구조
- `SectionDefinition`: 섹션 정의
- `SyncOptions`, `SyncResult`: 동기화 관련

#### constants/ (상수)
`locale.constants.ts`:
- 50개 이상 언어 정보
- `LOCALE_INFO_MAP`: 국기, 이름, 다이얼 코드, RTL 여부
- `getLocaleInfo()`, `getFlag()` 등 헬퍼

#### contracts/ (API 계약)
TypeBox 기반 스키마 정의:
- 요청/응답 타입 정의
- `@spfn/core:contract` 코드 생성기 입력

## 데이터 흐름

### 1. 개발 환경 (Development)

```
[JSON Files]
src/lib/labels/
├── home/
│   ├── hero.json
│   └── features.json
└── about/
    └── team.json
       ↓
[Server Start: initLabelSync()]
       ↓
[Sync to DB]
├─ cms_labels (메타데이터)
└─ cms_label_values (기본값 from JSON)
       ↓
[Auto Publish]
└─ cms_published_cache (캐시 생성)
       ↓
[Server Component]
└─ getSection('home')
    └─ GET /_cms/published-cache
        └─ 5ms 응답
       ↓
[Client Component]
└─ useSection('home', { autoLoad: true })
    └─ GET /_cms/published-cache
        └─ Store 업데이트
       ↓
[Hot Reload]
└─ JSON 파일 변경 감지
    └─ 자동 재동기화 (개발 모드)
```

### 2. 프로덕션 환경 (Production)

```
[Build Time]
└─ JSON Files → Git 커밋
       ↓
[Deploy]
└─ Docker Image
    ├─ 소스 코드
    └─ JSON 파일
       ↓
[Server Start]
└─ initLabelSync()
    ├─ JSON → DB 동기화
    └─ Published Cache 생성
       ↓
[Runtime]
├─ Server Components
│   └─ getSection() → Cache (5ms)
└─ Client Components
    └─ useSection() → API → Cache (5ms)
```

### 3. Admin 워크플로우

```
[Admin UI]
       ↓
1. Draft 생성/수정
   └─ POST /_cms/values
       └─ INSERT cms_label_values (version=null)
       ↓
2. Preview (Draft Mode)
   └─ GET /_cms/published-cache?draft=true
       └─ cms_draft_cache 조회
       ↓
3. Publish
   └─ POST /_cms/labels/:labelId/publish
       ├─ Draft → Published 복사
       ├─ publishedVersion 증가
       └─ Published Cache 갱신
       ↓
4. Audit Log
   └─ INSERT cms_audit_logs
       ├─ action: "publish"
       ├─ user: "admin@example.com"
       └─ changes: { version: 2, ... }
```

## API 엔드포인트

### Published Cache API
```
GET /_cms/published-cache?sections=home,about&locale=ko

Response:
[
  {
    section: "home",
    locale: "ko",
    content: {
      "home.hero.title": { type: "text", content: "..." },
      "home.hero.image": { type: "image", url: "...", ... }
    },
    version: 1,
    publishedAt: "2024-11-04T00:00:00Z"
  }
]
```

### Labels API
```
GET /_cms/labels?section=home
POST /_cms/labels
GET /_cms/labels/:id
PUT /_cms/labels/:id
DELETE /_cms/labels/:id
GET /_cms/labels/by-key/:key
```

### Values API
```
GET /_cms/values/:labelId
GET /_cms/values/:labelId/:version
POST /_cms/values
PUT /_cms/values/:id
DELETE /_cms/values/:id
```

### Publish API
```
POST /_cms/labels/:labelId/publish
Body: { notes?: string, publishedBy?: string }
```

## 성능 최적화

### 1. Published Cache
- 섹션+언어별 캐싱
- JSONB 타입으로 즉시 사용 가능
- 단일 쿼리로 섹션 전체 로드
- 87ms → 5ms (17배 향상)

### 2. React Cache
- 서버 컴포넌트에서 `cache()` 적용
- 동일 요청 내 중복 API 호출 방지

### 3. Zustand Store
- 클라이언트 사이드 상태 관리
- 한 번 로드한 섹션은 재사용
- 로딩 상태 중복 방지

### 4. Database Indexes
- `cms_labels.key` (unique)
- `cms_labels.section`
- `cms_label_values.(labelId, version)`
- `cms_published_cache.section`

## 환경 변수

```bash
# 기본 언어
SPFN_CMS_DEFAULT_LOCALE=ko

# 지원 언어 (쉼표 구분)
SPFN_CMS_SUPPORTED_LOCALES=ko,en,ja

# 브라우저 언어 자동 감지
SPFN_CMS_DETECT_BROWSER_LANGUAGE=true
```

## 사용 예시

### Server Component
```typescript
import { getSection } from '@spfn/cms/server';

export default async function HomePage() {
  const { t } = await getSection('home');

  return (
    <div>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.subtitle', 'Default subtitle')}</p>
      <p>{t('hero.greeting', 'Hello {name}!', { name: 'World' })}</p>
    </div>
  );
}
```

### Client Component
```typescript
'use client';
import { useSection } from '@spfn/cms/client';

export default function Nav() {
  const { t, loading } = useSection('layout', { autoLoad: true });

  if (loading) return <div>Loading...</div>;

  return (
    <nav>
      <a>{t('nav.home')}</a>
      <a>{t('nav.about')}</a>
    </nav>
  );
}
```

### Server Startup
```typescript
// src/server/server.config.ts
import { initLabelSync } from '@spfn/cms/server';

export default {
  beforeRoutes: async (app) => {
    await initLabelSync({ verbose: true });
  },
} satisfies ServerConfig;
```

## 향후 개선 사항

### 1. 반응형 지원 강화
- 현재: 브레이크포인트별 값 저장 가능
- 개선: 클라이언트에서 화면 크기에 따라 자동 선택

### 2. Draft Mode 개선
- 현재: Admin API로만 Draft 관리
- 개선: Next.js Draft Mode 통합

### 3. 버전 비교 UI
- 버전 간 차이점 시각화
- Rollback 기능

### 4. 이미지 최적화
- Next.js Image 컴포넌트 통합
- 자동 리사이징 및 최적화

### 5. 검색 기능
- 라벨 전체 검색
- 섹션별 필터링
- 정규식 지원

## 참고 자료

- [Getting Started](../../docs/ecosystem/cms/getting-started.md)
- [Label Sync Guide](../../docs/ecosystem/cms/label-sync.md)
- [Advanced Features](../../docs/ecosystem/cms/advanced-features.md)
- [Locale Management](../../docs/ecosystem/cms/locale-management.md)
- [API Reference](../../docs/ecosystem/cms/api-reference.md)
- [Draft & Versioning](../../docs/ecosystem/cms/draft-versioning.md)