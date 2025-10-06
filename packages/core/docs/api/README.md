# API Reference

SPFN 프레임워크의 상세 API 레퍼런스입니다.

## Core APIs

### Routing
- **[RouteContext](./route-context.md)** - 라우트 핸들러의 Context 객체
- **[Middleware](./middleware.md)** - 미들웨어 작성 및 사용

### Database
- **[getDb()](./database.md#getdb)** - 데이터베이스 인스턴스 가져오기
- **[Transactional()](./database.md#transactional)** - 트랜잭션 미들웨어
- **[Repository](./repository.md)** - Repository 클래스 API

### Error Handling
- **[BaseError](./errors.md#baseerror)** - 기본 에러 클래스
- **[ValidationError](./errors.md#validationerror)** - 400 Validation 에러
- **[NotFoundError](./errors.md#notfounderror)** - 404 Not Found 에러
- **[UnauthorizedError](./errors.md#unauthorizederror)** - 401 Unauthorized 에러
- **[ForbiddenError](./errors.md#forbiddenerror)** - 403 Forbidden 에러
- **[ConflictError](./errors.md#conflicterror)** - 409 Conflict 에러

### Logging
- **[logger](./logging.md)** - 구조화된 로깅

## Type Generation

### Commands
```bash
npm run generate          # 모든 타입 생성
npm run generate:types    # Entity → API 타입
npm run generate:api      # Routes → API 클라이언트
```

### Generated Types
생성되는 타입들:

```typescript
// src/types/generated/users.ts
export type User = {
    id: number;
    email: string;
    name: string | null;
    createdAt: string;      // Date → string으로 변환
    updatedAt: string | null;
};

export type CreateUserDto = {
    email: string;
    name?: string | null;
};

export type UpdateUserDto = {
    email?: string;
    name?: string | null;
};
```

## API Client Functions

자동 생성되는 API 클라이언트 함수들:

```typescript
// src/lib/api/users.ts
export async function getUsers(params?: {
    page?: number;
    limit?: number;
}): Promise<PagedResult<User>>;

export async function createUser(
    data: CreateUserDto
): Promise<User>;

export async function getUser(
    id: number
): Promise<User>;

export async function updateUser(
    id: number,
    data: UpdateUserDto
): Promise<User>;

export async function deleteUser(
    id: number
): Promise<void>;
```

## Configuration

### Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/db

# Optional
DATABASE_REPLICA_URL=postgresql://...
NEXT_PUBLIC_API_URL=http://localhost:4000
LOG_LEVEL=info
```

### vitest.config.ts

```typescript
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./src/server/tests/setup.ts'],
        fileParallelism: false,  // DB 테스트 순차 실행
    },
});
```

## Best Practices

### 1. Route Handlers

```typescript
// ✅ Good
import { Hono } from 'hono';
import { bind } from '@spfn/core';
import { Type } from '@sinclair/typebox';
import { Transactional } from '@/server/core';
import { Repository, getDb } from '@spfn/core/db';
import { users } from '@/server/entities/users';

const app = new Hono();

const getUsersContract = {
  response: Type.Any(),
  meta: {
    tags: ['users'],
    description: 'User management',
  },
};

app.get('/', Transactional(), bind(getUsersContract, async (c) => {
  const userRepo = new Repository(getDb(), users);
  const result = await userRepo.findPage({
    pagination: { page: 1, limit: 10 },
  });
  return c.json(result);
}));

export default app;
```

### 2. Error Handling

```typescript
// ✅ Good
if (!user) {
    throw new NotFoundError('User not found', { userId: id });
}

// ❌ Bad
if (!user) {
    return c.json({ error: 'Not found' }, 404);
}
```

### 3. Repository Usage

```typescript
// ✅ Good
const userRepo = new Repository(getDb(), users);
await userRepo.findById(1);

// ❌ Bad
const [user] = await db.select()
    .from(users)
    .where(eq(users.id, 1));
```

### 4. Transaction Management

```typescript
// ✅ Good
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
    // 자동 트랜잭션 관리
    const user = await userRepo.save(data);
    const profile = await profileRepo.save({ userId: user.id });
    return c.json({ user, profile }, 201);
}

// ❌ Bad
export async function POST(c: RouteContext) {
    await db.transaction(async (tx) => {
        // 수동 트랜잭션 관리 (불필요하게 복잡함)
    });
}
```

## Migration Guide

### From Express

```typescript
// Express
app.get('/users/:id', async (req, res) => {
    const user = await findUser(req.params.id);
    res.json(user);
});

// SPFN
export async function GET(c: RouteContext) {
    const id = Number(c.req.param('id'));
    const userRepo = new Repository(getDb(), users);
    const user = await userRepo.findById(id);

    if (!user) {
        throw new NotFoundError('User not found', { userId: id });
    }

    return c.json(user);
}
```

### From Next.js API Routes

```typescript
// Next.js API Route
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const user = await prisma.user.findUnique({ where: { id } });
    return NextResponse.json(user);
}

// SPFN
export async function GET(c: RouteContext) {
    const id = Number(c.req.query('id'));
    const userRepo = new Repository(getDb(), users);
    const user = await userRepo.findById(id);
    return c.json(user);
}
```

## Performance Tips

### 1. Use Repository for Common Operations

```typescript
// ✅ Fast - Uses optimized repository methods
const users = await userRepo.findPage({ pagination: { page: 1, limit: 10 } });

// ❌ Slow - Manual query building
const users = await db.select().from(users).limit(10).offset(0);
```

### 2. Leverage Read Replicas

```typescript
// ✅ Good - Read from replica
const userRepo = new Repository(getDb('read'), users);
const users = await userRepo.findAll();

// Write to primary
const userRepo = new Repository(getDb('write'), users);
await userRepo.save(data);
```

### 3. Avoid N+1 Queries

```typescript
// ❌ Bad - N+1 query
const users = await userRepo.findAll();
for (const user of users) {
    const posts = await postRepo.findByAuthorId(user.id);  // N queries
}

// ✅ Good - Single query with JOIN
const result = await db
    .select()
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId));
```

## Troubleshooting

### Common Issues

**Issue**: "DATABASE_URL environment variable is required"
```bash
# Solution: Create .env.local file
cp .env.local.example .env.local
```

**Issue**: "Type 'Date' is not assignable to type 'string'"
```bash
# Solution: Regenerate types
npm run generate:types
```

**Issue**: "Table 'users' does not exist"
```bash
# Solution: Run migrations
npm run db:migrate
```

**Issue**: "Port 4000 is already in use"
```bash
# Solution: Kill the process or change port
lsof -i :4000
kill -9 <PID>
```

## Support

- **Documentation**: `/src/server/docs/`
- **GitHub Issues**: [Report a bug](https://github.com/your-repo/issues)
- **Discussions**: [Ask questions](https://github.com/your-repo/discussions)