# Database & Transactions

SPFN은 PostgreSQL과 Drizzle ORM을 사용하여 타입 안전하고 효율적인 데이터베이스 작업을 제공합니다.

## 데이터베이스 연결

### 환경 변수 설정

```env
# .env.local
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# 옵션: Read Replica
DATABASE_REPLICA_URL=postgresql://user:password@localhost:5432/replica
```

### Connection Pool

SPFN은 자동으로 Connection Pool을 관리합니다:

```typescript
// src/server/core/db/index.ts
const pool = postgres(DATABASE_URL, {
    max: 20,              // 최대 연결 수
    idle_timeout: 20,     // 유휴 연결 타임아웃 (초)
    connect_timeout: 10,  // 연결 타임아웃 (초)
});
```

### 데이터베이스 접근

두 가지 방법으로 데이터베이스에 접근할 수 있습니다:

#### 1. getDb() 헬퍼 사용 (권장)

`getDb()`는 현재 컨텍스트에 맞는 데이터베이스 인스턴스를 반환합니다:

```typescript
import { getDb } from '@/server/core';

export async function GET(c: RouteContext) {
    const db = getDb();  // 트랜잭션 또는 일반 db 반환

    const users = await db.select().from(users);
    return c.json(users);
}
```

#### 2. 직접 import

특정 상황에서는 직접 import할 수 있습니다:

```typescript
import { db } from '@/server/core';

// 항상 기본 db 인스턴스를 사용 (트랜잭션 무시)
const users = await db.select().from(users);
```

## 트랜잭션 관리

### 자동 트랜잭션 (Transactional 미들웨어)

가장 간단하고 권장되는 방법입니다:

```typescript
import { Transactional, getDb } from '@/server/core';

export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
    const db = getDb();  // 자동으로 트랜잭션 반환

    // 모든 DB 작업이 하나의 트랜잭션 내에서 실행
    const user = await db.insert(users).values({ email }).returning();
    const profile = await db.insert(profiles).values({
        userId: user[0].id,
        name: 'Default',
    }).returning();

    // 성공 시 자동 커밋
    // 에러 발생 시 자동 롤백
    return c.json({ user, profile }, 201);
}
```

### 작동 원리

1. **트랜잭션 시작**: 요청이 들어오면 자동으로 트랜잭션 시작
2. **AsyncLocalStorage**: 트랜잭션을 컨텍스트에 저장 (명시적 전달 불필요)
3. **자동 커밋**: 핸들러가 성공적으로 완료되면 커밋
4. **자동 롤백**: 에러 발생 시 롤백

### 트랜잭션 로그

트랜잭션 실행 시 자동으로 로깅됩니다:

```json
{
  "level": "info",
  "module": "transaction",
  "txId": "tx_1234567890_abc123",
  "route": "POST /api/users",
  "msg": "Transaction started"
}

// 성공 시
{
  "level": "info",
  "module": "transaction",
  "txId": "tx_1234567890_abc123",
  "duration": "45ms",
  "msg": "Transaction committed"
}

// 실패 시
{
  "level": "error",
  "module": "transaction",
  "txId": "tx_1234567890_abc123",
  "duration": "23ms",
  "error": "Unique constraint violation",
  "msg": "Transaction rolled back"
}
```

### 중첩 함수에서 트랜잭션 사용

`getDb()`를 사용하면 중첩 함수에서도 같은 트랜잭션을 사용합니다:

```typescript
// 서비스 함수
async function createUserWithProfile(userData: any) {
    const db = getDb();  // 현재 트랜잭션 사용

    const user = await db.insert(users).values(userData).returning();
    const profile = await db.insert(profiles).values({
        userId: user[0].id,
    }).returning();

    return { user: user[0], profile: profile[0] };
}

// 라우트 핸들러
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
    const data = await c.req.json();

    // createUserWithProfile도 같은 트랜잭션 내에서 실행됨
    const result = await createUserWithProfile(data);

    return c.json(result, 201);
}
```

### 수동 트랜잭션

더 세밀한 제어가 필요한 경우 수동으로 트랜잭션을 관리할 수 있습니다:

```typescript
import { db } from '@/server/core';

export async function POST(c: RouteContext) {
    const data = await c.req.json();

    const result = await db.transaction(async (tx) => {
        // tx를 사용하여 DB 작업 수행
        const user = await tx.insert(users).values(data).returning();

        const profile = await tx.insert(profiles).values({
            userId: user[0].id,
        }).returning();

        // 성공 시 자동 커밋, 에러 시 자동 롤백
        return { user: user[0], profile: profile[0] };
    });

    return c.json(result, 201);
}
```

## Entity 정의

### 기본 Entity

```typescript
// src/server/entities/users.ts
import { pgTable, bigserial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
```

### 관계 (Relations)

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
```

### 인덱스 & 제약조건

```typescript
import { pgTable, bigserial, text, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    category: text('category'),
}, (table) => ({
    // 인덱스
    categoryIdx: index('category_idx').on(table.category),

    // 유니크 인덱스
    skuIdx: uniqueIndex('sku_idx').on(table.sku),
}));
```

## 마이그레이션

### 마이그레이션 생성

Entity를 변경한 후 마이그레이션을 생성합니다:

```bash
npm run db:generate
```

이 명령어는:
1. Entity 스키마 변경 감지
2. `drizzle/migrations/` 디렉토리에 SQL 파일 생성
3. 메타데이터 파일 업데이트

생성된 파일 예시:

```sql
-- drizzle/migrations/0001_add_posts_table.sql
CREATE TABLE IF NOT EXISTS "posts" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "title" text NOT NULL,
    "content" text,
    "author_id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id")
        REFERENCES "users"("id") ON DELETE cascade
);
```

### 마이그레이션 실행

```bash
npm run db:migrate
```

이 명령어는:
1. 미실행 마이그레이션을 데이터베이스에 적용
2. API 타입 자동 재생성 (`npm run generate:types`)

### 직접 스키마 푸시 (개발 전용)

개발 환경에서는 마이그레이션 없이 스키마를 직접 푸시할 수 있습니다:

```bash
npm run db:push
```

⚠️ **주의**: 프로덕션에서는 사용하지 마세요! 데이터 손실 가능성이 있습니다.

### Drizzle Studio

GUI로 데이터베이스를 탐색하고 관리합니다:

```bash
npm run db:studio
```

브라우저에서 `https://local.drizzle.studio`가 열립니다.

## 쿼리 작성

### 기본 CRUD

```typescript
import { eq, and, or, like, gt, lt } from 'drizzle-orm';
import { users } from '@/server/entities/users';
import { getDb } from '@/server/core';

const db = getDb();

// SELECT
const allUsers = await db.select().from(users);

// WHERE
const user = await db.select()
    .from(users)
    .where(eq(users.id, 1));

// INSERT
const newUser = await db.insert(users)
    .values({ email: 'test@example.com' })
    .returning();

// UPDATE
const updated = await db.update(users)
    .set({ name: 'Updated' })
    .where(eq(users.id, 1))
    .returning();

// DELETE
const deleted = await db.delete(users)
    .where(eq(users.id, 1))
    .returning();
```

### 복잡한 WHERE 조건

```typescript
import { eq, and, or, like, gt, lt, gte, lte, inArray } from 'drizzle-orm';

// AND
const result = await db.select()
    .from(users)
    .where(
        and(
            eq(users.email, 'test@example.com'),
            gte(users.createdAt, new Date('2024-01-01'))
        )
    );

// OR
const result = await db.select()
    .from(users)
    .where(
        or(
            like(users.email, '%@gmail.com'),
            like(users.email, '%@yahoo.com')
        )
    );

// IN
const result = await db.select()
    .from(users)
    .where(inArray(users.id, [1, 2, 3]));
```

### JOIN

```typescript
import { eq } from 'drizzle-orm';
import { users } from '@/server/entities/users';
import { posts } from '@/server/entities/posts';

// INNER JOIN
const result = await db
    .select({
        user: users,
        post: posts,
    })
    .from(users)
    .innerJoin(posts, eq(users.id, posts.authorId));

// LEFT JOIN
const result = await db
    .select()
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId));
```

### 집계 함수

```typescript
import { count, sum, avg, max, min } from 'drizzle-orm';

// COUNT
const [{ count: userCount }] = await db
    .select({ count: count() })
    .from(users);

// SUM
const [{ total }] = await db
    .select({ total: sum(orders.amount) })
    .from(orders);

// GROUP BY
const result = await db
    .select({
        category: products.category,
        count: count(),
    })
    .from(products)
    .groupBy(products.category);
```

### 정렬 & 페이지네이션

```typescript
import { desc, asc } from 'drizzle-orm';

// ORDER BY
const result = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));

// LIMIT & OFFSET
const page = 1;
const limit = 10;
const offset = (page - 1) * limit;

const result = await db
    .select()
    .from(users)
    .limit(limit)
    .offset(offset);
```

## Read Replica 지원

읽기 부하를 분산하기 위해 Read Replica를 설정할 수 있습니다.

### 설정

```env
# .env.local
DATABASE_URL=postgresql://user:password@primary:5432/mydb
DATABASE_REPLICA_URL=postgresql://user:password@replica:5432/mydb
```

### 사용

```typescript
import { getDb } from '@/server/core';

// 읽기 작업 - Replica 사용
const db = getDb('read');
const users = await db.select().from(users);

// 쓰기 작업 - Primary 사용
const db = getDb('write');
const user = await db.insert(users).values(data).returning();

// 기본값 (write)
const db = getDb();  // === getDb('write')
```

### Repository와 함께 사용

Repository는 자동으로 적절한 DB를 선택합니다:

```typescript
const userRepo = new Repository(getDb(), users);

// 읽기 메서드는 자동으로 Replica 사용
await userRepo.findAll();       // → Replica
await userRepo.findById(1);     // → Replica
await userRepo.count();         // → Replica

// 쓰기 메서드는 Primary 사용
await userRepo.save(data);      // → Primary
await userRepo.update(1, data); // → Primary
await userRepo.delete(1);       // → Primary
```

## 연결 재시도

데이터베이스 연결 실패 시 자동으로 재시도합니다:

```typescript
// src/server/core/db/connection.ts
const maxRetries = 3;
const retryDelayMs = 100;

// 연결 실패 시 최대 3번 재시도 (100ms 간격)
```

재시도 로그:

```json
{
  "level": "warn",
  "module": "database",
  "attempt": 1,
  "maxRetries": 3,
  "msg": "Connection failed (attempt 1/3), retrying in 100ms..."
}
```

## 베스트 프랙티스

### 1. 항상 getDb() 사용

```typescript
// ✅ 좋음 - 트랜잭션 자동 관리
const db = getDb();
const users = await db.select().from(users);

// ❌ 나쁨 - 트랜잭션 무시
import { db } from '@/server/core';
const users = await db.select().from(users);
```

### 2. Repository 패턴 활용

```typescript
// ✅ 좋음 - 재사용 가능, 테스트 용이
const userRepo = new Repository(getDb(), users);
const user = await userRepo.findById(1);

// ❌ 나쁨 - 중복 코드, 테스트 어려움
const [user] = await db.select()
    .from(users)
    .where(eq(users.id, 1));
```

### 3. 트랜잭션 미들웨어 사용

```typescript
// ✅ 좋음 - 자동 트랜잭션 관리
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
    // 모든 DB 작업이 트랜잭션 내에서 실행
}

// ❌ 나쁨 - 수동 트랜잭션 관리 (복잡함)
export async function POST(c: RouteContext) {
    await db.transaction(async (tx) => {
        // ...
    });
}
```

### 4. 타입 안전성 유지

```typescript
// ✅ 좋음 - 타입 안전
const user: User = await userRepo.findById(1);

// ❌ 나쁨 - any 타입
const user: any = await db.select().from(users);
```

### 5. N+1 쿼리 방지

```typescript
// ❌ 나쁨 - N+1 쿼리
const users = await db.select().from(users);
for (const user of users) {
    const posts = await db.select()
        .from(posts)
        .where(eq(posts.authorId, user.id));
}

// ✅ 좋음 - JOIN 사용
const result = await db
    .select()
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId));
```

## 다음 단계

- **[Repository 패턴](./repository.md)** - 데이터 접근 추상화
- **[에러 처리](./error-handling.md)** - DB 에러 처리
- **[테스트](./testing.md)** - DB 테스트 작성법