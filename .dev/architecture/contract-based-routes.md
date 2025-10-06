# Contract-Based Route Design

SPFN의 타입 안전하고 검증 가능한 라우트 정의 시스템 설계 문서입니다.

## 목표

1. **End-to-End Type Safety**: Backend → Frontend 완전한 타입 추론
2. **Runtime Validation**: Zod 기반 자동 검증
3. **Single Source of Truth**: Contract 하나로 모든 타입 관리
4. **DX 향상**: 기존 파일 기반 라우팅 유지하면서 타입 안전성 추가
5. **Frontend 재사용**: 동일한 스키마로 Form validation

## 핵심 컨셉

### 디렉토리 구조

Contract는 Next.js에서도 사용되므로 **별도 폴더에 분리**합니다:

```
src/server/
├── entities/           # Drizzle schemas + Zod schemas + CRUD contracts
│   ├── users.ts
│   └── posts.ts
│
├── contracts/          # Custom contracts (복잡한 비즈니스 로직용)
│   ├── video-analysis.ts
│   └── auth.ts
│
└── routes/             # 라우트 핸들러만 (Backend 전용)
    ├── users/
    │   ├── index.ts
    │   └── [id].ts
    └── video-analysis/
        └── index.ts
```

**중요**:
- `entities/`와 `contracts/`는 **순수 스키마/타입만** → Next.js에서 안전하게 import 가능
- `routes/`는 **Backend 전용** → Next.js에 번들 안됨

### Contract 정의 (Entity 기반)

```typescript
// entities/users.ts
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// 1. Drizzle Schema (DB)
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. Zod Schemas (자동 생성 + 확장)
export const insertUserSchema = createInsertSchema(users, {
  email: z.string().email('Invalid email'),
  name: z.string().min(2, 'Name too short').max(50, 'Name too long'),
});

export const selectUserSchema = createSelectSchema(users);

// 3. API Schemas (일부 필드 제외)
export const createUserApiSchema = insertUserSchema.omit({
  id: true,
  createdAt: true,
});

// 4. Contracts (CRUD)
export const getUserContract = {
  method: 'GET' as const,
  params: z.object({
    id: z.string().uuid(),
  }),
  query: z.object({
    include: z.array(z.enum(['posts', 'comments'])).optional(),
  }).optional(),
  response: selectUserSchema,
};

export const createUserContract = {
  method: 'POST' as const,
  body: createUserApiSchema,
  response: selectUserSchema,
};

// 5. TypeScript Types
export type User = z.infer<typeof selectUserSchema>;
export type CreateUserApi = z.infer<typeof createUserApiSchema>;
```

### Contract 정의 (Custom 비즈니스 로직)

```typescript
// contracts/video-analysis.ts
import { z } from 'zod';

export const analyzeVideoContract = {
  method: 'POST' as const,
  body: z.object({
    videoPath: z.string(),
    options: z.object({
      extractAudio: z.boolean().default(true),
      generateThumbnails: z.boolean().default(false),
    }).optional(),
  }),
  response: z.object({
    metadata: z.object({
      title: z.string(),
      description: z.string(),
      tags: z.array(z.string()),
    }),
    processingTime: z.number(),
  }),
};

export type VideoAnalysisRequest = z.infer<typeof analyzeVideoContract.body>;
export type VideoAnalysisResponse = z.infer<typeof analyzeVideoContract.response>;
```

### Route 핸들러 (Backend)

```typescript
// routes/users/[id].ts
import { getUserContract } from '@/server/entities/users';
import type { RouteContext } from '@spfn/core';

export async function GET(c: RouteContext<typeof getUserContract>) {
  // ✅ c.params.id는 string으로 타입 추론
  // ✅ c.query.include는 ('posts' | 'comments')[] | undefined로 타입 추론
  const { id } = c.params;
  const { include } = c.query;

  const user = await db.users.findById(id);

  // ✅ 반환 타입 검증
  return c.json({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  });
}
```

```typescript
// routes/users/index.ts
import { createUserContract } from '@/server/entities/users';
import type { RouteContext } from '@spfn/core';

export async function POST(c: RouteContext<typeof createUserContract>) {
  const body = await c.data();  // ✅ 이미 검증됨

  const [user] = await db.insert(users).values({
    ...body,
    id: nanoid(),
  }).returning();

  return c.json(user);
}
```

## 아키텍처

### 1. RouteContract 타입 정의

```typescript
// packages/core/src/route/types.ts

import type { z } from 'zod';

export type RouteContract = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
};

export type InferContract<TContract extends RouteContract> = {
  params: TContract['params'] extends z.ZodType
    ? z.infer<TContract['params']>
    : Record<string, never>;
  query: TContract['query'] extends z.ZodType
    ? z.infer<TContract['query']>
    : Record<string, never>;
  body: TContract['body'] extends z.ZodType
    ? z.infer<TContract['body']>
    : Record<string, never>;
  response: TContract['response'] extends z.ZodType
    ? z.infer<TContract['response']>
    : unknown;
};
```

### 2. RouteContext 타입 확장

```typescript
// packages/core/src/route/types.ts

import type { Context } from 'hono';

export type RouteContext<TContract extends RouteContract = any> = {
  params: InferContract<TContract>['params'];
  query: InferContract<TContract>['query'];

  // data() 메서드: body 타입 추론
  data: () => Promise<InferContract<TContract>['body']>;

  // json() 메서드: response 타입 검증
  json: (
    data: InferContract<TContract>['response'],
    status?: number
  ) => Response;

  // 원본 Hono Context
  raw: Context;
};
```

### 3. RouteMapper 수정

```typescript
// packages/core/src/route/route-mapper.ts

export class RouteMapper {
  private wrapHandler<TContract extends RouteContract>(
    handler: RouteHandler<TContract>,
    contract?: TContract
  ) {
    return async (c: Context) => {
      // 1. Params validation
      if (contract?.params) {
        const params = c.req.param();
        const parsed = contract.params.safeParse(params);

        if (!parsed.success) {
          return c.json({
            error: 'Invalid parameters',
            issues: parsed.error.issues,
          }, 400);
        }
      }

      // 2. Query validation
      if (contract?.query) {
        const query = this.parseQuery(c.req.url);
        const parsed = contract.query.safeParse(query);

        if (!parsed.success) {
          return c.json({
            error: 'Invalid query parameters',
            issues: parsed.error.issues,
          }, 400);
        }
      }

      // 3. Body validation (POST, PUT, PATCH)
      let validatedBody: any;
      if (contract?.body && ['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
        const body = await c.req.json().catch(() => ({}));
        const parsed = contract.body.safeParse(body);

        if (!parsed.success) {
          return c.json({
            error: 'Invalid request body',
            issues: parsed.error.issues,
          }, 400);
        }

        validatedBody = parsed.data;
      }

      // 4. RouteContext 생성
      const routeContext: RouteContext<TContract> = {
        params: c.req.param(),
        query: this.parseQuery(c.req.url),

        data: async () => validatedBody,

        json: (data, status = 200) => {
          // Development에서만 response 검증
          if (process.env.NODE_ENV === 'development' && contract?.response) {
            const parsed = contract.response.safeParse(data);
            if (!parsed.success) {
              console.error('❌ Response validation failed:');
              console.error(parsed.error.issues);
            }
          }

          return c.json(data, status);
        },

        raw: c,
      };

      // 5. Handler 실행
      return handler(routeContext);
    };
  }

  private parseQuery(url: string): Record<string, any> {
    const queryString = new URL(url).search;
    const params = new URLSearchParams(queryString);
    const result: Record<string, any> = {};

    for (const [key, value] of params.entries()) {
      // 배열 처리: ?tags=a&tags=b → { tags: ['a', 'b'] }
      if (result[key]) {
        result[key] = Array.isArray(result[key])
          ? [...result[key], value]
          : [result[key], value];
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  async mapRoute(routeFile: RouteFile): Promise<RouteDefinition> {
    const module = await import(routeFile.absolutePath) as RouteModule;

    // Contract 추출
    const contracts = this.extractContracts(module);

    let honoInstance: Hono;

    if (module.default) {
      honoInstance = module.default;
    } else if (this.hasHttpMethodHandlers(module)) {
      honoInstance = this.createHonoFromHandlers(module, contracts);
    } else {
      throw new Error(`Invalid route file: ${routeFile.absolutePath}`);
    }

    return {
      urlPath: this.buildUrlPath(routeFile, module),
      filePath: routeFile.relativePath,
      priority: this.calculatePriority(routeFile),
      params: this.extractParams(routeFile),
      honoInstance,
      meta: module.meta,
      middlewares: module.middlewares,
      contracts, // ✅ Contract 정보 추가
    };
  }

  private extractContracts(module: RouteModule): Record<string, RouteContract> {
    const contracts: Record<string, RouteContract> = {};
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    for (const method of methods) {
      // Convention: {method}Contract 또는 {lowercase}Contract
      const contractKey = `${method.toLowerCase()}Contract`;
      if (module[contractKey]) {
        contracts[method] = module[contractKey];
      }
    }

    return contracts;
  }

  private createHonoFromHandlers(
    module: RouteModule,
    contracts: Record<string, RouteContract>
  ): Hono {
    let app = new Hono();

    if (module.GET) {
      app = app.get('/', this.wrapHandler(module.GET, contracts.GET));
    }
    if (module.POST) {
      app = app.post('/', this.wrapHandler(module.POST, contracts.POST));
    }
    if (module.PUT) {
      app = app.put('/', this.wrapHandler(module.PUT, contracts.PUT));
    }
    if (module.PATCH) {
      app = app.patch('/', this.wrapHandler(module.PATCH, contracts.PATCH));
    }
    if (module.DELETE) {
      app = app.delete('/', this.wrapHandler(module.DELETE, contracts.DELETE));
    }

    return app;
  }
}
```

### 4. RouteModule 타입 확장

```typescript
// packages/core/src/route/types.ts

export type RouteModule = {
  // HTTP Method Handlers
  GET?: RouteHandler<any>;
  POST?: RouteHandler<any>;
  PUT?: RouteHandler<any>;
  PATCH?: RouteHandler<any>;
  DELETE?: RouteHandler<any>;

  // Contracts (선택사항)
  getContract?: RouteContract;
  postContract?: RouteContract;
  putContract?: RouteContract;
  patchContract?: RouteContract;
  deleteContract?: RouteContract;

  // Metadata
  meta?: RouteMeta;
  middlewares?: Middleware[];

  // Legacy
  default?: Hono;
  prefix?: string;
};

export type RouteHandler<TContract extends RouteContract = any> = (
  c: RouteContext<TContract>
) => Promise<Response> | Response;
```

## 사용 예시

### 1. 기본 예시 (GET)

```typescript
// routes/users/[id].ts
import { z } from 'zod';
import type { RouteContext } from '@spfn/core';

export const getContract = {
  method: 'GET' as const,
  params: z.object({
    id: z.string().uuid('Invalid user ID'),
  }),
  query: z.object({
    include: z.array(z.enum(['posts', 'comments'])).optional(),
  }).optional(),
  response: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    createdAt: z.string(),
  }),
};

export async function GET(c: RouteContext<typeof getContract>) {
  const { id } = c.params;
  const { include } = c.query;

  const user = await db.users.findById(id);

  if (!user) {
    return c.raw.json({ error: 'User not found' }, 404);
  }

  return c.json({
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  });
}
```

### 2. POST with Body

```typescript
// routes/users/index.ts
import { z } from 'zod';
import { insertUserSchema, selectUserSchema } from '@/server/entities/users';
import type { RouteContext } from '@spfn/core';

export const postContract = {
  method: 'POST' as const,
  body: insertUserSchema.omit({ id: true, createdAt: true }),
  response: selectUserSchema,
};

export async function POST(c: RouteContext<typeof postContract>) {
  const body = await c.data();

  const [user] = await db.insert(users).values({
    ...body,
    id: nanoid(),
  }).returning();

  return c.json(user);
}
```

### 3. Entity 기반 스키마 재사용

```typescript
// entities/posts.ts
import { pgTable, text, boolean } from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  published: boolean('published').default(false),
});

export const insertPostSchema = createInsertSchema(posts, {
  title: z.string().min(5, 'Title must be at least 5 characters'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
});

export const selectPostSchema = createSelectSchema(posts);

// API용 스키마
export const createPostApiSchema = insertPostSchema.omit({
  id: true
});

export type CreatePostApi = z.infer<typeof createPostApiSchema>;
export type Post = z.infer<typeof selectPostSchema>;
```

```typescript
// routes/posts/index.ts
import { createPostApiSchema, selectPostSchema, posts } from '@/server/entities/posts';
import type { RouteContext } from '@spfn/core';

export const postContract = {
  method: 'POST' as const,
  body: createPostApiSchema,
  response: selectPostSchema,
};

export async function POST(c: RouteContext<typeof postContract>) {
  const body = await c.data();

  const [post] = await db.insert(posts).values({
    ...body,
    id: nanoid(),
  }).returning();

  return c.json(post);
}
```

### 4. Frontend 사용 (Server Component)

```typescript
// app/users/[id]/page.tsx
import { getContract } from '@/server/routes/users/[id]';
import { z } from 'zod';

type User = z.infer<typeof getContract.response>;

export default async function UserPage({
  params
}: {
  params: { id: string }
}) {
  const response = await fetch(`http://localhost:4000/users/${params.id}`);
  const user: User = await response.json();

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}
```

### 5. Frontend 사용 (Client Component with Form)

```typescript
// components/CreatePostForm.tsx
'use client';

import { createPostApiSchema } from '@/server/entities/posts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

type FormData = z.infer<typeof createPostApiSchema>;

export function CreatePostForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(createPostApiSchema),
    defaultValues: {
      published: false,
    },
  });

  const onSubmit = async (data: FormData) => {
    const response = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const post = await response.json();
      console.log('Created:', post);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label htmlFor="title">Title</label>
        <input {...form.register('title')} />
        {form.formState.errors.title && (
          <p className="error">{form.formState.errors.title.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="content">Content</label>
        <textarea {...form.register('content')} />
        {form.formState.errors.content && (
          <p className="error">{form.formState.errors.content.message}</p>
        )}
      </div>

      <div>
        <label>
          <input type="checkbox" {...form.register('published')} />
          Published
        </label>
      </div>

      <button type="submit" disabled={form.formState.isSubmitting}>
        Create Post
      </button>
    </form>
  );
}
```

## Contract 없는 경우 (하위 호환)

Contract 정의가 없어도 기존 방식대로 동작:

```typescript
// routes/health/index.ts
export async function GET(c: RouteContext) {
  // ✅ Contract 없어도 동작
  return c.json({ status: 'ok' });
}
```

## 에러 응답

### Validation 실패 시

```json
{
  "error": "Invalid request body",
  "issues": [
    {
      "code": "too_small",
      "minimum": 5,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "Title must be at least 5 characters",
      "path": ["title"]
    }
  ]
}
```

### Development 환경: Response 검증 실패

```
❌ Response validation failed:
[
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["email"],
    "message": "Required"
  }
]
```

## 마이그레이션 가이드

### Phase 1: Contract 타입 추가
```typescript
// 기존
export async function GET(c: RouteContext) { ... }

// 변경
export const getContract = { ... };
export async function GET(c: RouteContext<typeof getContract>) { ... }
```

### Phase 2: Validation 활용
```typescript
// c.data()가 자동으로 검증된 데이터 반환
const body = await c.data();
```

### Phase 3: Frontend 타입 사용
```typescript
import { getContract } from '@/server/routes/users/[id]';
import { z } from 'zod';

type User = z.infer<typeof getContract.response>;
```

## 구현 우선순위

### Phase 1: Core 타입 시스템
- [ ] `RouteContract` 타입 정의
- [ ] `RouteContext<TContract>` 제네릭 타입
- [ ] `InferContract` 유틸리티 타입

### Phase 2: RouteMapper 수정
- [ ] `wrapHandler`에 contract 파라미터 추가
- [ ] Params/Query/Body validation 구현
- [ ] Response validation (dev only)
- [ ] `extractContracts` 메서드 구현

### Phase 3: Documentation & Examples
- [ ] Contract 작성 가이드
- [ ] Entity → Contract 패턴 문서화
- [ ] Frontend 통합 예시

### Phase 4: Advanced Features
- [ ] OpenAPI 생성 (Contract 기반)
- [ ] Client SDK 자동 생성
- [ ] Contract testing utilities

## 참고 자료

- [Zod Documentation](https://zod.dev/)
- [drizzle-zod](https://orm.drizzle.team/docs/zod)
- [tRPC](https://trpc.io/) - Contract-first API 참고
- [Hono Validator](https://hono.dev/docs/guides/validation)