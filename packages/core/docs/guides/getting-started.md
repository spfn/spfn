# Getting Started with SPFN

이 가이드는 SPFN 프레임워크로 첫 API를 만드는 과정을 단계별로 안내합니다.

## 사전 요구사항

- Node.js 18+
- PostgreSQL 14+
- 기본적인 TypeScript 지식
- Drizzle ORM에 대한 기본 이해 (선택사항)

## 프로젝트 설정

### 1. 환경변수 설정

`.env.local.example`을 복사하여 `.env.local` 파일을 생성합니다:

```bash
cp .env.local.example .env.local
```

`.env.local` 파일을 편집하여 데이터베이스 연결 정보를 입력합니다:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/your_database

# Optional: Read Replica
DATABASE_REPLICA_URL=postgresql://user:password@localhost:5432/your_replica

# Server
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 데이터베이스 마이그레이션

```bash
npm run db:migrate
```

### 4. 개발 서버 실행

```bash
npm run dev
```

이 명령어는 다음을 동시에 실행합니다:
- Next.js 개발 서버 (포트 3792)
- Hono 백엔드 서버 (포트 4000)
- 파일 감시 및 자동 타입 생성

## 첫 번째 API 만들기

실제 블로그 포스트 API를 만들어보겠습니다.

### Step 1: Entity 정의

먼저 데이터베이스 스키마를 정의합니다:

```typescript
// src/server/entities/posts.ts
import { pgTable, bigserial, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const posts = pgTable('posts', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    title: text('title').notNull(),
    content: text('content'),
    authorId: bigserial('author_id', { mode: 'number' })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .defaultNow(),
});

export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
```

### Step 2: 마이그레이션 생성 및 실행

```bash
# 마이그레이션 파일 생성
npm run db:generate

# 마이그레이션 실행 및 타입 자동 생성
npm run db:migrate
```

이 명령어는 다음을 수행합니다:
1. `drizzle/migrations/` 디렉토리에 SQL 마이그레이션 파일 생성
2. 마이그레이션을 데이터베이스에 적용
3. `src/types/generated/posts.ts`에 API용 타입 자동 생성

### Step 3: 라우트 작성

파일 구조가 곧 API 엔드포인트가 됩니다:

```typescript
// src/server/routes/posts/index.ts
import type { RouteContext } from '@/server/core';
import { Repository } from '@/server/core/db/repository';
import { posts } from '@/server/entities/posts';
import { Transactional, getDb } from '@/server/core';
import { ValidationError } from '@/server/core/errors';

export const meta = {
    description: 'Blog post management',
    tags: ['posts'],
    auth: false, // 인증이 필요하면 true
};

// 트랜잭션 미들웨어 적용
export const middlewares = [Transactional()];

/**
 * GET /api/posts
 * 포스트 목록 조회 (페이지네이션, 필터링, 정렬 지원)
 */
export async function GET(c: RouteContext) {
    const postRepo = new Repository(getDb(), posts);

    // 쿼리 파라미터에서 페이지네이션 정보 추출
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 10;

    const result = await postRepo.findPage({
        pagination: { page, limit },
        sort: [{ field: 'createdAt', direction: 'desc' }],
    });

    return c.json(result);
}

/**
 * POST /api/posts
 * 새 포스트 생성
 */
export async function POST(c: RouteContext) {
    const data = await c.req.json();

    // 간단한 검증
    if (!data.title || !data.authorId) {
        throw new ValidationError('Title and authorId are required', {
            missing: !data.title ? 'title' : 'authorId',
        });
    }

    const postRepo = new Repository(getDb(), posts);
    const post = await postRepo.save({
        title: data.title,
        content: data.content,
        authorId: data.authorId,
    });

    return c.json(post, 201);
}
```

이제 동적 라우트도 만들어봅시다:

```typescript
// src/server/routes/posts/[id].ts
import type { RouteContext } from '@/server/core';
import { Repository } from '@/server/core/db/repository';
import { posts } from '@/server/entities/posts';
import { Transactional, getDb } from '@/server/core';
import { NotFoundError, ValidationError } from '@/server/core/errors';

export const meta = {
    description: 'Single post operations',
    tags: ['posts'],
};

export const middlewares = [Transactional()];

/**
 * GET /api/posts/:id
 * 특정 포스트 조회
 */
export async function GET(c: RouteContext) {
    const id = Number(c.req.param('id'));
    const postRepo = new Repository(getDb(), posts);

    const post = await postRepo.findById(id);
    if (!post) {
        throw new NotFoundError('Post not found', { postId: id });
    }

    return c.json(post);
}

/**
 * PATCH /api/posts/:id
 * 포스트 수정
 */
export async function PATCH(c: RouteContext) {
    const id = Number(c.req.param('id'));
    const data = await c.req.json();

    const postRepo = new Repository(getDb(), posts);
    const updated = await postRepo.update(id, data);

    if (!updated) {
        throw new NotFoundError('Post not found', { postId: id });
    }

    return c.json(updated);
}

/**
 * DELETE /api/posts/:id
 * 포스트 삭제
 */
export async function DELETE(c: RouteContext) {
    const id = Number(c.req.param('id'));
    const postRepo = new Repository(getDb(), posts);

    const deleted = await postRepo.delete(id);
    if (!deleted) {
        throw new NotFoundError('Post not found', { postId: id });
    }

    return c.json({ success: true });
}
```

### Step 4: API 클라이언트 생성

타입 안전한 API 클라이언트를 자동 생성합니다:

```bash
npm run generate
```

이 명령어는 다음 파일을 생성합니다:
- `src/lib/api/posts.ts` - 포스트 API 함수들
- `src/lib/api/index.ts` - 모든 API 함수를 export

### Step 5: 프론트엔드에서 사용

생성된 API 클라이언트를 프론트엔드에서 사용합니다:

```typescript
// src/app/posts/page.tsx
import { getPosts } from '@/lib/api';

export default async function PostsPage() {
    // 타입 안전한 API 호출
    const result = await getPosts();

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">Blog Posts</h1>

            <div className="space-y-4">
                {result.data.map(post => (
                    <article key={post.id} className="border p-4 rounded">
                        <h2 className="text-xl font-semibold">{post.title}</h2>
                        <p className="text-gray-600 mt-2">{post.content}</p>
                        <time className="text-sm text-gray-400">
                            {new Date(post.createdAt).toLocaleDateString()}
                        </time>
                    </article>
                ))}
            </div>

            <div className="mt-6">
                <p>Page {result.meta.page} of {result.meta.totalPages}</p>
                <p>Total: {result.meta.total} posts</p>
            </div>
        </div>
    );
}
```

클라이언트 컴포넌트에서 사용하기:

```typescript
// src/app/posts/new/page.tsx
'use client';

import { useState } from 'react';
import { createPost } from '@/lib/api';
import { useRouter } from 'next/navigation';

export default function NewPostPage() {
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const post = await createPost({
                title,
                content,
                authorId: 1, // 실제로는 현재 로그인한 사용자 ID
            });

            router.push(`/posts/${post.id}`);
        } catch (error) {
            console.error('Failed to create post:', error);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-4">
            <h1 className="text-3xl font-bold mb-6">New Post</h1>

            <div className="mb-4">
                <label className="block mb-2">Title</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full border p-2 rounded"
                    required
                />
            </div>

            <div className="mb-4">
                <label className="block mb-2">Content</label>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full border p-2 rounded"
                    rows={10}
                />
            </div>

            <button
                type="submit"
                className="bg-blue-500 text-white px-4 py-2 rounded"
            >
                Create Post
            </button>
        </form>
    );
}
```

## API 테스트

생성된 API를 테스트해봅시다:

```bash
# 포스트 목록 조회
curl http://localhost:4000/api/posts

# 포스트 생성
curl -X POST http://localhost:4000/api/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Hello World","content":"My first post","authorId":1}'

# 특정 포스트 조회
curl http://localhost:4000/api/posts/1

# 포스트 수정
curl -X PATCH http://localhost:4000/api/posts/1 \
  -H "Content-Type: application/json" \
  -d '{"title":"Updated Title"}'

# 포스트 삭제
curl -X DELETE http://localhost:4000/api/posts/1
```

## 다음 단계

축하합니다! 첫 SPFN API를 성공적으로 만들었습니다. 이제 다음을 학습해보세요:

1. **[트랜잭션 관리](./database.md#transactions)** - 복잡한 비즈니스 로직을 안전하게 처리
2. **[에러 처리](./error-handling.md)** - 일관된 에러 응답 만들기
3. **[Repository 고급 기능](./repository.md)** - 복잡한 쿼리 및 관계 처리
4. **[미들웨어](./middleware.md)** - 인증, 로깅, Rate Limiting 등
5. **[테스트 작성](./testing.md)** - API 테스트 자동화

## 팁과 트릭

### 1. 개발 모드에서 자동 재시작

`npm run dev`는 파일 변경을 감지하여 자동으로 서버를 재시작하고 타입을 재생성합니다.

### 2. Drizzle Studio 사용

데이터베이스를 GUI로 확인하고 싶다면:

```bash
npm run db:studio
```

브라우저에서 `https://local.drizzle.studio`가 열립니다.

### 3. 타입 검증

TypeScript 컴파일러를 실행하여 타입 에러를 확인하세요:

```bash
npx tsc --noEmit
```

### 4. 로그 확인

개발 모드에서는 모든 API 요청/응답이 콘솔에 로깅됩니다:

```
[22:38:45.123] INFO: GET /api/posts (req_id: "abc123")
[22:38:45.234] INFO: Response 200 in 111ms (req_id: "abc123")
```

### 5. 환경별 설정

- `.env.local` - 로컬 개발
- `.env.test` - 테스트 환경
- `.env.production` - 프로덕션 (Vercel 등에서 자동 사용)

## 문제 해결

### 포트 충돌

포트 4000이나 3792가 이미 사용 중인 경우:

```bash
# 포트를 사용하는 프로세스 찾기
lsof -i :4000

# 프로세스 종료
kill -9 <PID>
```

### 데이터베이스 연결 실패

1. PostgreSQL이 실행 중인지 확인
2. `.env.local`의 `DATABASE_URL`이 올바른지 확인
3. 데이터베이스가 생성되어 있는지 확인

### 타입 생성 안됨

수동으로 타입을 재생성하려면:

```bash
npm run generate
```

### 마이그레이션 실패

마이그레이션을 초기화하려면:

```bash
# 주의: 모든 데이터가 삭제됩니다!
npm run db:push
```

## 다음 문서

- **[라우팅 가이드](./routing.md)** - 파일 기반 라우팅 상세 설명
- **[데이터베이스 가이드](./database.md)** - DB 연결, 트랜잭션, Repository
- **[타입 생성 가이드](./type-generation.md)** - 타입 자동 생성 원리