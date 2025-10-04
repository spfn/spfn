# SPFN Framework Documentation

**The Missing Backend for Next.js**

SPFN은 TypeScript로 복잡한 비즈니스 웹 애플리케이션을 빠르고 안전하게 개발할 수 있도록 돕는 백엔드 프레임워크입니다.

## 왜 SPFN인가?

### 문제점
- Next.js는 훌륭한 프론트엔드 프레임워크이지만, 복잡한 백엔드 로직에는 한계가 있습니다
- Express/Fastify는 보일러플레이트가 많고, 타입 안전성이 부족합니다
- Rails/Spring Boot의 생산성을 TypeScript 생태계에서 누리기 어렵습니다

### 해결책
SPFN은 다음을 제공합니다:

- ✨ **Rails 수준의 생산성** - Convention over Configuration
- 🔒 **Spring Boot 수준의 견고함** - 트랜잭션, Repository 패턴, 에러 처리
- 🎯 **완벽한 타입 안전성** - Entity → Types → API Client 자동 생성
- 🚀 **Next.js와 완벽한 통합** - 하지만 독립적으로 사용 가능

## 핵심 기능

### 1. 파일 기반 라우팅
Next.js처럼 파일 구조가 곧 API 라우트입니다.

```
src/server/routes/
├── users/
│   ├── index.ts          → GET/POST /api/users
│   ├── [id].ts           → GET/PATCH/DELETE /api/users/:id
│   └── [id]/
│       └── posts.ts      → GET /api/users/:id/posts
```

### 2. 자동 트랜잭션 관리
AsyncLocalStorage 기반으로 명시적인 전달 없이 자동으로 트랜잭션이 관리됩니다.

```typescript
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
    // 모든 DB 작업이 자동으로 트랜잭션 내에서 실행
    const user = await db.insert(users).values(data).returning();
    const profile = await db.insert(profiles).values({ userId: user.id }).returning();

    // 성공 → 자동 커밋
    // 에러 → 자동 롤백
    return c.json(user, 201);
}
```

### 3. Repository 패턴
Spring Data JPA 스타일의 Repository로 CRUD를 간단하게 처리합니다.

```typescript
const userRepo = new Repository(db, users);

// 기본 CRUD
await userRepo.save({ email: 'test@example.com' });
await userRepo.findById(1);
await userRepo.update(1, { name: 'Updated' });
await userRepo.delete(1);

// 페이지네이션 & 필터링
await userRepo.findPage({
    filters: { email: { like: '@example.com' } },
    sort: [{ field: 'createdAt', direction: 'desc' }],
    pagination: { page: 1, limit: 10 },
});
```

### 4. 타입 안전 API 클라이언트
Entity를 정의하면 타입이 자동 생성되고, 프론트엔드에서 타입 안전하게 사용할 수 있습니다.

```typescript
// 1. Entity 정의
export const users = pgTable('users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').unique(),
});

// 2. 타입 자동 생성 (npm run generate)
// → src/types/generated/users.ts

// 3. 프론트엔드에서 사용
import { getUsers, createUser } from '@/lib/api';

const users = await getUsers(); // 완벽한 타입 추론!
```

### 5. 구조화된 에러 처리
커스텀 에러 클래스로 일관된 에러 처리를 제공합니다.

```typescript
throw new NotFoundError('User not found', { userId: 123 });
throw new ValidationError('Invalid email format', { email });
throw new UnauthorizedError('Login required');
```

### 6. 프로덕션급 로깅
Pino 기반 구조화된 로깅으로 디버깅과 모니터링이 쉽습니다.

```typescript
logger.info({ userId: 123, action: 'login' }, 'User logged in');
logger.error({ err, userId: 123 }, 'Login failed');
```

## 빠른 시작

### 프로젝트 구조
```
src/
├── server/                    # 백엔드 코드
│   ├── core/                 # 프레임워크 핵심 (향후 @spfn/core 패키지화)
│   │   ├── route/           # 파일 기반 라우팅 시스템
│   │   ├── db/              # 데이터베이스 연결 및 헬퍼
│   │   ├── transaction.ts   # 트랜잭션 미들웨어
│   │   └── errors/          # 에러 클래스 정의
│   ├── routes/              # API 라우트 (자동 등록)
│   ├── entities/            # Drizzle ORM 엔티티
│   ├── scripts/             # 코드 생성 스크립트
│   └── app.ts               # Hono 앱 진입점
├── app/                      # Next.js 프론트엔드
└── lib/
    └── api/                  # 자동 생성된 API 클라이언트
```

### 개발 흐름

#### 1. Entity 정의
```typescript
// src/server/entities/posts.ts
export const posts = pgTable('posts', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    title: text('title').notNull(),
    content: text('content'),
    authorId: bigserial('author_id', { mode: 'number' })
        .notNull()
        .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
```

#### 2. 마이그레이션 생성 및 실행
```bash
npm run db:generate  # Drizzle 마이그레이션 생성
npm run db:migrate   # 마이그레이션 실행 + 타입 재생성
```

#### 3. 라우트 작성
```typescript
// src/server/routes/posts/index.ts
import type { RouteContext } from '@/server/core';
import { Repository } from '@/server/core/db/repository';
import { posts } from '@/server/entities/posts';
import { Transactional, getDb } from '@/server/core';

export const meta = {
    description: 'Post management endpoints',
    tags: ['posts'],
};

export const middlewares = [Transactional()];

export async function GET(c: RouteContext) {
    const postRepo = new Repository(getDb(), posts);
    const result = await postRepo.findPage({
        pagination: { page: 1, limit: 10 },
        sort: [{ field: 'createdAt', direction: 'desc' }],
    });

    return c.json(result);
}

export async function POST(c: RouteContext) {
    const data = await c.req.json();
    const postRepo = new Repository(getDb(), posts);
    const post = await postRepo.save(data);

    return c.json(post, 201);
}
```

#### 4. API 클라이언트 생성
```bash
npm run generate  # 타입 + API 클라이언트 자동 생성
```

#### 5. 프론트엔드에서 사용
```typescript
// src/app/posts/page.tsx
import { getPosts } from '@/lib/api';

export default async function PostsPage() {
    const { data: posts } = await getPosts();

    return (
        <div>
            {posts.map(post => (
                <article key={post.id}>
                    <h2>{post.title}</h2>
                    <p>{post.content}</p>
                </article>
            ))}
        </div>
    );
}
```

## 문서 구조

- **[Getting Started](./guides/getting-started.md)** - 처음 시작하기
- **[File-based Routing](./guides/routing.md)** - 라우팅 시스템 상세 가이드
- **[Database & Transactions](./guides/database.md)** - DB 연결 및 트랜잭션 관리
- **[Repository Pattern](./guides/repository.md)** - Repository 사용법
- **[Error Handling](./guides/error-handling.md)** - 에러 처리 가이드
- **[Type Generation](./guides/type-generation.md)** - 타입 자동 생성
- **[API Reference](./api/)** - 상세 API 문서
- **[Examples](./examples/)** - 실전 예제

## 주요 명령어

```bash
# 개발
npm run dev              # 모든 서버 시작 (Next.js + Hono + 타입 감시)
npm run dev:server       # Hono 백엔드만 실행
npm run dev:next         # Next.js 프론트엔드만 실행

# 데이터베이스
npm run db:generate      # 마이그레이션 생성
npm run db:migrate       # 마이그레이션 실행
npm run db:push          # 스키마를 DB에 직접 푸시
npm run db:studio        # Drizzle Studio GUI 실행

# 코드 생성
npm run generate         # 모든 타입 및 API 클라이언트 생성
npm run generate:types   # Entity → Types 생성
npm run generate:api     # Routes → API 클라이언트 생성

# 테스트
npm test                 # 테스트 실행
npm run test:ui          # Vitest UI로 테스트

# 빌드
npm run build            # 프로덕션 빌드
npm start                # 프로덕션 서버 시작
```

## 테스트

프레임워크는 152개의 테스트로 100% 커버리지를 달성했습니다:

```bash
npm test

✓ 152 tests passing
  ✓ File-based routing (9)
  ✓ Route scanning & mapping (14)
  ✓ Transaction management (6)
  ✓ Repository CRUD (14)
  ✓ Error handling (8)
  ✓ Logging system (12)
  ... and more
```

## 아키텍처

SPFN은 **듀얼 서버 아키텍처**를 사용합니다:

```
┌─────────────────┐
│   Next.js       │  Port 3792
│   (Frontend)    │  - UI, SSR, Routing
└────────┬────────┘
         │ RPC / REST
         ▼
┌─────────────────┐
│   Hono          │  Port 4000
│   (Backend)     │  - API, Business Logic
└─────────────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
└─────────────────┘
```

### 특징
- **독립적이지만 통합됨** - 프론트엔드/백엔드 분리 배포 가능하지만 타입 공유
- **Never Fork** - Next.js를 포크하지 않고 확장 (Blitz.js의 교훈)
- **Convention over Configuration** - 파일 기반 자동화
- **Type Safety Throughout** - 단일 진실의 원천(Entity)에서 모든 타입 파생

## 기여하기

SPFN은 현재 활발히 개발 중입니다. 기여를 환영합니다!

## 라이선스

MIT License

---

**Made with ❤️ for TypeScript developers who want Rails productivity with Spring Boot robustness**