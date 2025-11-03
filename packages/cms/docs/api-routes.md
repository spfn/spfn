# CMS API Routes

이 문서는 `@spfn/cms` 패키지의 모든 API 라우트를 정리합니다.

## 목차

- [Labels (라벨 메타데이터)](#labels-라벨-메타데이터)
- [Values (라벨 값)](#values-라벨-값)
- [Published Cache (발행 캐시)](#published-cache-발행-캐시)

---

## Labels (라벨 메타데이터)

라벨 메타데이터를 관리하는 API입니다. 라벨은 CMS 콘텐츠의 기본 단위로, 각 라벨은 고유한 `key`를 가지며 여러 버전의 값을 가질 수 있습니다.

### GET `/_cms/labels`

라벨 목록을 조회합니다.

**Query Parameters:**
- `section` (optional): 섹션으로 필터링
- `limit` (optional, default: 20): 페이지 크기
- `offset` (optional, default: 0): 오프셋
- `includeDefaultValues` (optional): true이면 JSON 파일에서 기본값 로드

**Response:**
```typescript
{
  labels: Array<{
    id: number;
    key: string;
    section: string;
    type: 'string' | 'image' | 'video' | 'file';
    description: string | null;
    publishedVersion: number | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    defaultValue?: any; // includeDefaultValues=true일 때만
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

**기능:**
- 라벨 목록 페이지네이션 조회
- 섹션별 필터링 지원
- 기본값 로드 옵션 (JSON 파일에서)

---

### POST `/_cms/labels`

새 라벨을 생성합니다.

**Body:**
```typescript
{
  key: string;
  section: string;
  type: 'string' | 'image' | 'video' | 'file';
  createdBy?: string;
}
```

**Response (201):**
```typescript
{
  id: number;
  key: string;
  section: string;
  type: 'string' | 'image' | 'video' | 'file';
  publishedVersion: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Error (409):**
```typescript
{
  error: 'Label with this key already exists';
  key: string;
}
```

**기능:**
- 새 라벨 메타데이터 생성
- Key 중복 검증

---

### GET `/_cms/labels/:id`

ID로 라벨 단건 조회합니다.

**Path Parameters:**
- `id`: 라벨 ID (number)

**Response:**
```typescript
{
  id: number;
  key: string;
  section: string;
  type: 'string' | 'image' | 'video' | 'file';
  description: string | null;
  publishedVersion: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Error (404):**
```typescript
{
  error: 'Label not found';
}
```

---

### GET `/_cms/labels/by-key/:key`

Key로 라벨을 조회합니다.

**Path Parameters:**
- `key`: 라벨 키 (string)

**Response:**
```typescript
{
  id: number;
  key: string;
  section: string;
  type: 'string' | 'image' | 'video' | 'file';
  description: string | null;
  publishedVersion: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Error (404):**
```typescript
{
  error: 'Label not found';
  key: string;
}
```

---

### PATCH `/_cms/labels/:id`

라벨 메타데이터를 수정합니다.

**Path Parameters:**
- `id`: 라벨 ID (number)

**Body:**
```typescript
{
  description?: string;
  // 다른 필드도 수정 가능
}
```

**Response:**
```typescript
{
  id: number;
  key: string;
  section: string;
  type: 'string' | 'image' | 'video' | 'file';
  description: string | null;
  publishedVersion: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**기능:**
- 트랜잭션 내에서 실행
- 라벨 메타데이터만 수정 (값은 values API 사용)

---

### DELETE `/_cms/labels/:id`

라벨을 삭제합니다.

**Path Parameters:**
- `id`: 라벨 ID (number)

**Response:**
```typescript
{
  success: true;
  id: number;
}
```

**Error (404):**
```typescript
{
  error: 'Label not found';
}
```

**기능:**
- 트랜잭션 내에서 실행
- CASCADE 삭제: 관련된 모든 values도 함께 삭제됨

---

### GET `/_cms/labels/:labelId/admin`

관리자용 라벨 상세 정보를 조회합니다. Draft, Published 값과 상태를 모두 반환합니다.

**Path Parameters:**
- `labelId`: 라벨 ID (number)

**Response:**
```typescript
{
  label: {
    id: number;
    key: string;
    section: string;
    type: 'string' | 'image' | 'video' | 'file';
    description: string | null;
    publishedVersion: number | null;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
  };
  draft: Array<{
    id: number;
    labelId: number;
    version: null;
    locale: string;
    breakpoint: string | null;
    value: any;
    createdAt: string;
  }>;
  published: Array<{
    id: number;
    labelId: number;
    version: number;
    locale: string;
    breakpoint: string | null;
    value: any;
    createdAt: string;
  }>;
  status: 'default-only' | 'unpublished' | 'published' | 'modified';
}
```

**Status 설명:**
- `default-only`: Draft도 Published도 없음 (JSON 기본값만 존재)
- `unpublished`: Draft는 있지만 Published가 없음
- `published`: Published는 있지만 Draft가 없음
- `modified`: Published와 Draft가 모두 있음 (수정 중)

**기능:**
- Draft와 Published 값을 모두 조회
- 라벨 상태 자동 계산
- 관리 UI에서 사용

---

### POST `/_cms/labels/:labelId/publish`

Draft 값을 Published로 발행합니다.

**Path Parameters:**
- `labelId`: 라벨 ID (number)

**Body:**
```typescript
{
  notes?: string;      // 발행 노트 (버전 설명)
  publishedBy?: string; // 발행자 ID
}
```

**Response:**
```typescript
{
  success: true;
  labelId: number;
  version: number;  // 생성된 버전 번호
  message: string;  // 성공 메시지
}
```

**Error (400):**
```typescript
{
  error: string; // 오류 메시지
}
```

**기능:**
1. Draft 값들을 조회 (version = null)
2. 다음 버전 번호 계산 (publishedVersion + 1)
3. Draft를 새 버전으로 복사
4. publishedVersion 업데이트
5. Published Cache 자동 업데이트

**발행 과정:**
```
Draft (version=null) → Published (version=1, 2, 3, ...)
```

---

## Values (라벨 값)

라벨의 실제 콘텐츠 값을 관리하는 API입니다. 각 값은 locale, breakpoint, version으로 구분됩니다.

### POST `/_cms/values/:labelId`

라벨 값을 저장합니다 (upsert).

**Path Parameters:**
- `labelId`: 라벨 ID (number)

**Body:**
```typescript
{
  version: number | null; // null이면 Draft, 숫자면 특정 버전
  values: Array<{
    locale: string;
    breakpoint?: string | null;
    value: any;
  }>;
}
```

**Response:**
```typescript
{
  success: true;
  saved: number;  // 저장된 값의 개수
  version: number | null;
}
```

**Error (404):**
```typescript
{
  error: 'Label not found';
}
```

**기능:**
- 트랜잭션 내에서 실행
- Upsert 방식: 같은 (labelId, version, locale, breakpoint) 조합이 있으면 업데이트, 없으면 생성
- Draft 저장: `version: null`
- Published 저장: `version: 1, 2, 3, ...`

**사용 예시:**

Draft 저장:
```typescript
POST /_cms/values/123
{
  version: null,
  values: [
    { locale: 'ko', value: '안녕하세요' },
    { locale: 'en', value: 'Hello' }
  ]
}
```

특정 버전 저장 (일반적으로 publish API가 자동 처리):
```typescript
POST /_cms/values/123
{
  version: 1,
  values: [
    { locale: 'ko', value: '안녕하세요' },
    { locale: 'en', value: 'Hello' }
  ]
}
```

---

### GET `/_cms/values/:labelId/:version`

특정 버전의 값들을 조회합니다.

**Path Parameters:**
- `labelId`: 라벨 ID (number)
- `version`: 버전 번호 (number)

**Query Parameters:**
- `locale` (optional): 로케일로 필터링
- `breakpoint` (optional): 브레이크포인트로 필터링 ('null' 문자열로 null 지정 가능)

**Response:**
```typescript
{
  labelId: number;
  version: number;
  values: Array<{
    id: number;
    locale: string;
    breakpoint: string | null;
    value: any;
    createdAt: string;
  }>;
}
```

**Error (404):**
```typescript
{
  error: 'Label not found';
}
```

**기능:**
- 특정 버전의 모든 값 조회
- locale, breakpoint 필터링 지원

---

## Published Cache (발행 캐시)

발행된 콘텐츠를 섹션별로 캐싱하여 빠른 조회를 제공하는 API입니다.

### GET `/_cms/published-cache`

발행된 섹션 콘텐츠를 조회합니다.

**Query Parameters:**
- `sections`: 섹션 이름 (string 또는 string[])
- `locale` (default: 'ko'): 로케일

**Response:**
```typescript
Array<{
  section: string;
  locale: string;
  content: Record<string, any>;  // 섹션의 모든 라벨 값들
  version: number;
  publishedAt: string | null;
}>
```

**기능:**
- 여러 섹션 동시 조회 가능
- 발행된 콘텐츠만 반환
- 프론트엔드에서 전체 섹션 데이터 조회 시 사용

**사용 예시:**

단일 섹션:
```typescript
GET /_cms/published-cache?sections=home.hero&locale=ko
```

여러 섹션:
```typescript
GET /_cms/published-cache?sections=home.hero&sections=home.cta&locale=ko
```

**Response 예시:**
```json
[
  {
    "section": "home.hero",
    "locale": "ko",
    "content": {
      "title": "환영합니다",
      "subtitle": "세상을 바꾸는 기술"
    },
    "version": 5,
    "publishedAt": "2025-01-03T10:30:00Z"
  }
]
```

---

### POST `/_cms/published-cache`

발행된 콘텐츠 캐시를 업데이트/생성합니다 (upsert).

**Body:**
```typescript
{
  section: string;
  locale: string;
  content: Record<string, any>;
  version: number;
}
```

**Response:**
```typescript
{
  section: string;
  locale: string;
  content: Record<string, any>;
  version: number;
  publishedAt: string | null;
}
```

**Error (500):**
```typescript
{
  error: string;
}
```

**기능:**
- Upsert 방식: 같은 (section, locale) 조합이 있으면 업데이트, 없으면 생성
- publishedAt 자동 설정
- 일반적으로 publish API가 자동으로 호출함

---

## API 사용 플로우

### 1. 새 라벨 생성 및 발행

```typescript
// 1. 라벨 생성
POST /_cms/labels
{
  key: "home.hero.title",
  section: "home.hero",
  type: "string"
}
// Response: { id: 123, ... }

// 2. Draft 값 저장
POST /_cms/values/123
{
  version: null,
  values: [
    { locale: 'ko', value: '환영합니다' },
    { locale: 'en', value: 'Welcome' }
  ]
}

// 3. 발행
POST /_cms/labels/123/publish
{
  notes: "Initial version",
  publishedBy: "admin@example.com"
}
// Response: { success: true, version: 1 }
```

### 2. 라벨 수정 및 재발행

```typescript
// 1. Draft 수정
POST /_cms/values/123
{
  version: null,
  values: [
    { locale: 'ko', value: '환영합니다!' },  // 수정됨
    { locale: 'en', value: 'Welcome!' }      // 수정됨
  ]
}

// 2. 관리자 UI에서 상태 확인
GET /_cms/labels/123/admin
// Response: { status: 'modified', draft: [...], published: [...] }

// 3. 재발행
POST /_cms/labels/123/publish
{
  notes: "Updated greeting text",
  publishedBy: "admin@example.com"
}
// Response: { success: true, version: 2 }
```

### 3. 프론트엔드에서 콘텐츠 조회

```typescript
// 발행된 콘텐츠 조회
GET /_cms/published-cache?sections=home.hero&locale=ko

// Response:
[
  {
    "section": "home.hero",
    "locale": "ko",
    "content": {
      "title": "환영합니다!",
      "subtitle": "세상을 바꾸는 기술"
    },
    "version": 2,
    "publishedAt": "2025-01-03T12:00:00Z"
  }
]
```

---

## 데이터 모델

### CmsLabel (라벨 메타데이터)
```typescript
{
  id: number;
  key: string;              // 고유 키 (예: 'home.hero.title')
  section: string;          // 섹션 (예: 'home.hero')
  type: 'string' | 'image' | 'video' | 'file';
  description: string | null;
  publishedVersion: number | null;  // 현재 발행된 버전
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### CmsLabelValue (라벨 값)
```typescript
{
  id: number;
  labelId: number;
  version: number | null;   // null이면 Draft, 숫자면 Published
  locale: string;           // 'ko', 'en', 등
  breakpoint: string | null; // 'mobile', 'tablet', 'desktop', 등
  value: any;               // 실제 콘텐츠 값
  createdAt: Date;
}
```

### CmsPublishedCache (발행 캐시)
```typescript
{
  id: number;
  section: string;
  locale: string;
  content: Record<string, any>;  // 섹션의 모든 라벨 값들
  version: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 버전 관리

CMS는 Draft-Published 모델을 사용합니다:

- **Draft** (`version = null`): 작업 중인 콘텐츠, 발행 전
- **Published** (`version = 1, 2, 3, ...`): 발행된 콘텐츠, 프론트엔드에서 사용

**버전 흐름:**
```
Draft (v=null) --[publish]--> Published (v=1)
Draft (v=null) --[publish]--> Published (v=2)
Draft (v=null) --[publish]--> Published (v=3)
```

각 라벨의 `publishedVersion` 필드는 현재 발행된 최신 버전을 가리킵니다.

---

## 권한 및 보안

- 모든 `/_cms/*` 경로는 관리자 전용입니다
- 프론트엔드는 `published-cache` API만 사용해야 합니다
- `values`, `labels` API는 관리 UI에서만 사용합니다

---

## 참고

- Contract 정의: `/src/lib/contracts/`
- Repository 구현: `/src/server/repositories/`
- Helper 함수: `/src/server/helpers/`