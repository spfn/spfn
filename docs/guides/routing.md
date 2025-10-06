# File-based Routing

SPFN의 파일 기반 라우팅 시스템은 Next.js App Router에서 영감을 받아, 파일 구조가 곧 API 엔드포인트가 되도록 설계되었습니다.

## 기본 개념

### 라우트 파일 규칙

`src/server/routes/` 디렉토리 내의 파일들이 자동으로 API 엔드포인트로 등록됩니다.

```
src/server/routes/
├── index.ts              → GET /api (루트)
├── health.ts             → GET /api/health
├── users/
│   ├── index.ts          → GET/POST /api/users
│   ├── [id].ts           → GET/PATCH/DELETE /api/users/:id
│   └── [id]/
│       └── posts.ts      → GET /api/users/:id/posts
└── posts/
    ├── index.ts          → GET/POST /api/posts
    ├── [id].ts           → GET/PATCH/DELETE /api/posts/:id
    └── [...slug].ts      → GET /api/posts/* (catch-all)
```

### 라우트 파일 구조

각 라우트 파일은 다음과 같은 구조를 가집니다:

```typescript
import type { RouteContext } from '@/server/core';

// 메타데이터 (선택사항)
export const meta = {
    description: 'Route description',
    tags: ['tag-name'],
    auth: false,
};

// 미들웨어 (선택사항)
export const middlewares = [/* ... */];

// HTTP 메서드 핸들러
export async function GET(c: RouteContext) {
    return c.json({ message: 'Hello' });
}

export async function POST(c: RouteContext) {
    const data = await c.req.json();
    return c.json(data, 201);
}

export async function PATCH(c: RouteContext) {
    // ...
}

export async function DELETE(c: RouteContext) {
    // ...
}
```

## 라우트 타입

### 1. 정적 라우트 (Static Routes)

가장 기본적인 라우트 형태입니다.

```typescript
// src/server/routes/health.ts
export async function GET(c: RouteContext) {
    return c.json({ status: 'ok', timestamp: new Date() });
}
```

**결과**: `GET /api/health`

### 2. 동적 라우트 (Dynamic Routes)

대괄호 `[param]`를 사용하여 동적 세그먼트를 정의합니다.

```typescript
// src/server/routes/users/[id].ts
export async function GET(c: RouteContext) {
    const id = c.req.param('id');
    // id를 사용하여 사용자 조회
    return c.json({ id });
}
```

**결과**: `GET /api/users/:id`

**예시 호출**:
- `/api/users/1` → `id = "1"`
- `/api/users/abc` → `id = "abc"`

### 3. 중첩 동적 라우트

여러 동적 세그먼트를 조합할 수 있습니다.

```typescript
// src/server/routes/users/[userId]/posts/[postId].ts
export async function GET(c: RouteContext) {
    const userId = c.req.param('userId');
    const postId = c.req.param('postId');

    return c.json({ userId, postId });
}
```

**결과**: `GET /api/users/:userId/posts/:postId`

**예시 호출**:
- `/api/users/1/posts/100` → `userId = "1", postId = "100"`

### 4. Catch-all 라우트

`[...param]` 패턴을 사용하여 모든 하위 경로를 캐치합니다.

```typescript
// src/server/routes/docs/[...slug].ts
export async function GET(c: RouteContext) {
    const slug = c.req.param('slug');
    // slug는 "/"로 구분된 경로
    return c.json({ slug });
}
```

**결과**: `GET /api/docs/*`

**예시 호출**:
- `/api/docs/guide` → `slug = "guide"`
- `/api/docs/guide/routing` → `slug = "guide/routing"`
- `/api/docs/a/b/c` → `slug = "a/b/c"`

## 라우트 우선순위

라우트는 다음 우선순위로 매칭됩니다:

1. **정적 라우트** (Static)
2. **동적 라우트** (Dynamic)
3. **Catch-all 라우트**

### 예시

```
routes/
├── users/
│   ├── index.ts          # 1순위: /api/users
│   ├── admin.ts          # 1순위: /api/users/admin (정적)
│   ├── [id].ts           # 2순위: /api/users/:id (동적)
│   └── [...path].ts      # 3순위: /api/users/* (catch-all)
```

**매칭 결과**:
- `/api/users/admin` → `admin.ts` (정적 라우트 우선)
- `/api/users/123` → `[id].ts` (동적 라우트)
- `/api/users/admin/settings` → `[...path].ts` (catch-all)

## RouteContext API

모든 핸들러는 `RouteContext` 객체를 받습니다. 이는 Hono의 `Context`를 래핑한 것입니다.

### 요청 데이터 접근

```typescript
export async function POST(c: RouteContext) {
    // 1. JSON 바디
    const body = await c.req.json();

    // 2. 쿼리 파라미터
    const page = c.req.query('page');       // 단일 값
    const tags = c.req.queries('tags');     // 배열 값

    // 3. URL 파라미터
    const id = c.req.param('id');

    // 4. 헤더
    const auth = c.req.header('Authorization');

    // 5. FormData
    const formData = await c.req.formData();

    return c.json({ body, page, tags, id, auth });
}
```

### 응답 생성

```typescript
export async function GET(c: RouteContext) {
    // 1. JSON 응답
    return c.json({ message: 'Success' });

    // 2. 상태 코드 지정
    return c.json({ created: true }, 201);

    // 3. 텍스트 응답
    return c.text('Hello World');

    // 4. HTML 응답
    return c.html('<h1>Hello</h1>');

    // 5. 리다이렉트
    return c.redirect('/api/users');

    // 6. 커스텀 헤더
    return c.json(
        { data: 'value' },
        200,
        { 'X-Custom-Header': 'value' }
    );
}
```

### 타입 안전한 데이터 접근

`c.data<T>()` 헬퍼를 사용하여 타입 안전하게 데이터를 파싱합니다:

```typescript
import type { CreateUserDto } from '@/types/generated/users';

export async function POST(c: RouteContext) {
    // 타입 안전한 바디 파싱
    const data = await c.data<CreateUserDto>();

    // data는 CreateUserDto 타입으로 추론됨
    const user = await userRepo.save(data);

    return c.json(user, 201);
}
```

## 메타데이터 (Meta)

라우트에 메타데이터를 추가할 수 있습니다:

```typescript
export const meta = {
    // 라우트 설명
    description: 'User management endpoints',

    // 태그 (API 클라이언트 생성 시 그룹화에 사용)
    tags: ['users', 'admin'],

    // 인증 필요 여부
    auth: true,

    // 기타 커스텀 메타데이터
    rateLimit: 100,
    version: 'v1',
};
```

### 태그 활용

태그는 API 클라이언트 생성 시 함수를 그룹화하는 데 사용됩니다:

```typescript
// src/server/routes/users/index.ts
export const meta = { tags: ['users'] };

// src/server/routes/posts/index.ts
export const meta = { tags: ['posts'] };
```

생성된 API 클라이언트:

```typescript
// src/lib/api/users.ts
export async function getUsers() { /* ... */ }
export async function createUser() { /* ... */ }

// src/lib/api/posts.ts
export async function getPosts() { /* ... */ }
export async function createPost() { /* ... */ }
```

## 미들웨어

라우트별로 미들웨어를 적용할 수 있습니다:

```typescript
import { Transactional } from '@/server/core';
import { requireAuth } from '@/server/middleware/auth';

export const middlewares = [
    requireAuth,        // 인증 확인
    Transactional(),    // 트랜잭션 관리
];

export async function POST(c: RouteContext) {
    // 미들웨어가 먼저 실행된 후 이 핸들러가 실행됨
    // 인증된 사용자만 접근 가능
    // 트랜잭션 내에서 실행됨
}
```

### 미들웨어 순서

미들웨어는 배열 순서대로 실행됩니다:

```typescript
export const middlewares = [
    middleware1,  // 1. 먼저 실행
    middleware2,  // 2. 그 다음 실행
    middleware3,  // 3. 마지막으로 실행
];
```

### 글로벌 미들웨어 vs 라우트 미들웨어

```typescript
// src/server/app.ts - 글로벌 미들웨어
app.use('*', RequestLogger());  // 모든 요청에 적용

// src/server/routes/users/index.ts - 라우트 미들웨어
export const middlewares = [Transactional()];  // 이 라우트에만 적용
```

## 실전 예제

### 예제 1: RESTful CRUD API

```typescript
// src/server/routes/products/index.ts
import type { RouteContext } from '@/server/core';
import { Repository } from '@/server/core/db/repository';
import { products } from '@/server/entities/products';
import { Transactional, getDb } from '@/server/core';
import { ValidationError } from '@/server/core/errors';

export const meta = {
    description: 'Product management',
    tags: ['products'],
};

export const middlewares = [Transactional()];

// GET /api/products - 목록 조회
export async function GET(c: RouteContext) {
    const productRepo = new Repository(getDb(), products);

    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 20;
    const category = c.req.query('category');

    const result = await productRepo.findPage({
        filters: category ? { category: { eq: category } } : undefined,
        pagination: { page, limit },
        sort: [{ field: 'createdAt', direction: 'desc' }],
    });

    return c.json(result);
}

// POST /api/products - 생성
export async function POST(c: RouteContext) {
    const data = await c.req.json();

    if (!data.name || !data.price) {
        throw new ValidationError('Name and price are required');
    }

    const productRepo = new Repository(getDb(), products);
    const product = await productRepo.save(data);

    return c.json(product, 201);
}
```

```typescript
// src/server/routes/products/[id].ts
export const meta = {
    description: 'Single product operations',
    tags: ['products'],
};

export const middlewares = [Transactional()];

// GET /api/products/:id - 단일 조회
export async function GET(c: RouteContext) {
    const id = Number(c.req.param('id'));
    const productRepo = new Repository(getDb(), products);

    const product = await productRepo.findById(id);
    if (!product) {
        throw new NotFoundError('Product not found', { productId: id });
    }

    return c.json(product);
}

// PATCH /api/products/:id - 수정
export async function PATCH(c: RouteContext) {
    const id = Number(c.req.param('id'));
    const data = await c.req.json();

    const productRepo = new Repository(getDb(), products);
    const updated = await productRepo.update(id, data);

    if (!updated) {
        throw new NotFoundError('Product not found', { productId: id });
    }

    return c.json(updated);
}

// DELETE /api/products/:id - 삭제
export async function DELETE(c: RouteContext) {
    const id = Number(c.req.param('id'));
    const productRepo = new Repository(getDb(), products);

    const deleted = await productRepo.delete(id);
    if (!deleted) {
        throw new NotFoundError('Product not found', { productId: id });
    }

    return c.json({ success: true });
}
```

### 예제 2: 중첩 리소스

```typescript
// src/server/routes/users/[userId]/posts.ts
import type { RouteContext } from '@/server/core';
import { eq } from 'drizzle-orm';
import { posts } from '@/server/entities/posts';
import { getDb } from '@/server/core';

export const meta = {
    description: "User's posts",
    tags: ['users', 'posts'],
};

// GET /api/users/:userId/posts
export async function GET(c: RouteContext) {
    const userId = Number(c.req.param('userId'));

    const db = getDb();
    const userPosts = await db
        .select()
        .from(posts)
        .where(eq(posts.authorId, userId));

    return c.json(userPosts);
}
```

### 예제 3: 검색 API

```typescript
// src/server/routes/search.ts
import type { RouteContext } from '@/server/core';
import { like } from 'drizzle-orm';
import { products } from '@/server/entities/products';
import { getDb } from '@/server/core';

export const meta = {
    description: 'Search products',
    tags: ['search'],
};

// GET /api/search?q=keyword
export async function GET(c: RouteContext) {
    const query = c.req.query('q');

    if (!query || query.length < 2) {
        return c.json({ results: [] });
    }

    const db = getDb();
    const results = await db
        .select()
        .from(products)
        .where(like(products.name, `%${query}%`))
        .limit(10);

    return c.json({ results });
}
```

## 고급 패턴

### 1. 라우트 그룹화

관련된 라우트를 디렉토리로 그룹화하세요:

```
routes/
├── admin/
│   ├── users.ts
│   ├── products.ts
│   └── analytics.ts
├── public/
│   ├── posts.ts
│   └── comments.ts
```

### 2. 버전 관리

API 버전별로 디렉토리를 분리할 수 있습니다:

```
routes/
├── v1/
│   └── users/
│       └── index.ts      → /api/v1/users
└── v2/
    └── users/
        └── index.ts      → /api/v2/users
```

### 3. 라우트 재사용

공통 로직을 함수로 분리하여 재사용하세요:

```typescript
// src/server/utils/pagination.ts
export function getPaginationParams(c: RouteContext) {
    return {
        page: Number(c.req.query('page')) || 1,
        limit: Number(c.req.query('limit')) || 10,
    };
}

// 라우트에서 사용
export async function GET(c: RouteContext) {
    const pagination = getPaginationParams(c);
    // ...
}
```

## 주의사항

### 1. 파일명 규칙

- `index.ts` → 디렉토리의 기본 라우트
- `[param].ts` → 동적 세그먼트
- `[...slug].ts` → Catch-all
- 테스트 파일(`*.test.ts`, `*.spec.ts`)은 자동으로 제외됨

### 2. HTTP 메서드

지원되는 HTTP 메서드:
- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `OPTIONS`
- `HEAD`

### 3. 에러 처리

라우트 핸들러에서 발생한 에러는 자동으로 캐치되어 일관된 에러 응답으로 변환됩니다:

```typescript
export async function GET(c: RouteContext) {
    throw new NotFoundError('Resource not found');
    // → 자동으로 { error: 'Resource not found', statusCode: 404 } 응답
}
```

## 다음 단계

- **[데이터베이스 & 트랜잭션](./database.md)** - DB 연결 및 트랜잭션 관리
- **[Repository 패턴](./repository.md)** - 데이터 접근 계층
- **[에러 처리](./error-handling.md)** - 에러 클래스 및 에러 응답