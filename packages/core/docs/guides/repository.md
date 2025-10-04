# Repository Pattern

Repository 패턴은 데이터 접근 로직을 비즈니스 로직에서 분리하여 코드를 깔끔하고 테스트 가능하게 만듭니다.

## 기본 사용법

### Repository 생성

```typescript
import { Repository } from '@/server/core/db/repository';
import { users } from '@/server/entities/users';
import { getDb } from '@/server/core';

const userRepo = new Repository(getDb(), users);
```

### CRUD 메서드

```typescript
// CREATE
const user = await userRepo.save({
    email: 'test@example.com',
    name: 'Test User',
});

// READ - 단일
const user = await userRepo.findById(1);

// READ - 전체
const allUsers = await userRepo.findAll();

// UPDATE
const updated = await userRepo.update(1, {
    name: 'Updated Name',
});

// DELETE
const deleted = await userRepo.delete(1);

// COUNT
const count = await userRepo.count();
```

## 페이지네이션 & 필터링

### findPage() 메서드

가장 강력한 메서드로, 페이지네이션, 필터링, 정렬을 한 번에 처리합니다:

```typescript
const result = await userRepo.findPage({
    // 필터
    filters: {
        email: { like: '@gmail.com' },
        createdAt: { gte: new Date('2024-01-01') },
    },

    // 정렬
    sort: [
        { field: 'createdAt', direction: 'desc' },
        { field: 'name', direction: 'asc' },
    ],

    // 페이지네이션
    pagination: {
        page: 1,
        limit: 10,
    },
});

// 결과 구조
console.log(result);
// {
//   data: [ /* User[] */ ],
//   meta: {
//     page: 1,
//     limit: 10,
//     total: 100,
//     totalPages: 10
//   }
// }
```

### 필터 연산자

```typescript
// 같음
filters: { email: { eq: 'test@example.com' } }

// 좋아요 (LIKE)
filters: { email: { like: '@gmail.com' } }

// 대소 비교
filters: {
    age: { gte: 18, lte: 65 },  // 18 <= age <= 65
    price: { gt: 100 },          // price > 100
    stock: { lt: 10 },           // stock < 10
}

// IN
filters: { id: { in: [1, 2, 3] } }

// NULL 체크
filters: { deletedAt: { isNull: true } }

// 여러 필터 조합 (AND)
filters: {
    email: { like: '@gmail.com' },
    age: { gte: 18 },
    isActive: { eq: true },
}
```

## 실전 예제

### 예제 1: 사용자 목록 API

```typescript
// src/server/routes/users/index.ts
import type { RouteContext } from '@/server/core';
import { Repository } from '@/server/core/db/repository';
import { users } from '@/server/entities/users';
import { getDb } from '@/server/core';

export async function GET(c: RouteContext) {
    const userRepo = new Repository(getDb(), users);

    // 쿼리 파라미터에서 필터/페이지네이션 추출
    const page = Number(c.req.query('page')) || 1;
    const limit = Number(c.req.query('limit')) || 10;
    const email = c.req.query('email');

    const result = await userRepo.findPage({
        filters: email ? { email: { like: email } } : undefined,
        pagination: { page, limit },
        sort: [{ field: 'createdAt', direction: 'desc' }],
    });

    return c.json(result);
}
```

호출 예시:
```bash
# 전체 사용자 (1페이지, 10개)
GET /api/users?page=1&limit=10

# 이메일 필터링
GET /api/users?email=@gmail.com

# 페이지 + 필터 조합
GET /api/users?page=2&limit=20&email=@example.com
```

### 예제 2: 제품 검색 API

```typescript
// src/server/routes/products/search.ts
import type { RouteContext } from '@/server/core';
import { Repository } from '@/server/core/db/repository';
import { products } from '@/server/entities/products';
import { getDb } from '@/server/core';

export async function GET(c: RouteContext) {
    const productRepo = new Repository(getDb(), products);

    const keyword = c.req.query('q');
    const category = c.req.query('category');
    const minPrice = Number(c.req.query('minPrice')) || 0;
    const maxPrice = Number(c.req.query('maxPrice')) || Infinity;

    const result = await productRepo.findPage({
        filters: {
            name: keyword ? { like: keyword } : undefined,
            category: category ? { eq: category } : undefined,
            price: {
                gte: minPrice,
                lte: maxPrice === Infinity ? undefined : maxPrice,
            },
        },
        sort: [{ field: 'popularity', direction: 'desc' }],
        pagination: {
            page: Number(c.req.query('page')) || 1,
            limit: 20,
        },
    });

    return c.json(result);
}
```

### 예제 3: 커스텀 Repository 클래스

복잡한 비즈니스 로직은 Repository를 확장하여 처리합니다:

```typescript
// src/server/repositories/user-repository.ts
import { Repository } from '@/server/core/db/repository';
import { users } from '@/server/entities/users';
import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '@/server/core/db';

export class UserRepository extends Repository<typeof users> {
    constructor(db: DrizzleDb) {
        super(db, users);
    }

    // 이메일로 사용자 찾기
    async findByEmail(email: string) {
        const [user] = await this.db
            .select()
            .from(this.table)
            .where(eq(this.table.email, email));

        return user || null;
    }

    // 활성 사용자만 조회
    async findActiveUsers() {
        return this.findPage({
            filters: { isActive: { eq: true } },
            sort: [{ field: 'createdAt', direction: 'desc' }],
        });
    }

    // 사용자와 프로필 함께 조회
    async findWithProfile(userId: number) {
        const [result] = await this.db
            .select({
                user: this.table,
                profile: profiles,
            })
            .from(this.table)
            .leftJoin(profiles, eq(this.table.id, profiles.userId))
            .where(eq(this.table.id, userId));

        return result;
    }
}

// 사용
const userRepo = new UserRepository(getDb());
const user = await userRepo.findByEmail('test@example.com');
```

### 예제 4: 소프트 삭제 (Soft Delete)

```typescript
// Entity에 deletedAt 필드 추가
export const users = pgTable('users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Repository 확장
export class UserRepository extends Repository<typeof users> {
    // 소프트 삭제
    async softDelete(id: number) {
        const [deleted] = await this.db
            .update(this.table)
            .set({ deletedAt: new Date() })
            .where(eq(this.table.id, id))
            .returning();

        return deleted;
    }

    // 삭제되지 않은 사용자만 조회
    async findAllActive() {
        return this.db
            .select()
            .from(this.table)
            .where(isNull(this.table.deletedAt));
    }

    // 복원
    async restore(id: number) {
        const [restored] = await this.db
            .update(this.table)
            .set({ deletedAt: null })
            .where(eq(this.table.id, id))
            .returning();

        return restored;
    }
}
```

## Read Replica 지원

Repository는 자동으로 읽기/쓰기를 구분하여 적절한 DB를 사용합니다:

```typescript
const userRepo = new Repository(getDb('write'), users);

// 읽기 메서드 → 자동으로 Replica 사용
await userRepo.findAll();       // Replica
await userRepo.findById(1);     // Replica
await userRepo.findPage({});    // Replica
await userRepo.count();         // Replica

// 쓰기 메서드 → Primary 사용
await userRepo.save(data);      // Primary
await userRepo.update(1, data); // Primary
await userRepo.delete(1);       // Primary
```

## 트랜잭션과 함께 사용

Repository는 `getDb()`를 통해 현재 트랜잭션을 자동으로 사용합니다:

```typescript
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
    const userRepo = new Repository(getDb(), users);
    const profileRepo = new Repository(getDb(), profiles);

    // 두 Repository 모두 같은 트랜잭션 내에서 실행
    const user = await userRepo.save({ email: 'test@example.com' });
    const profile = await profileRepo.save({ userId: user.id });

    // 성공 → 모두 커밋
    // 에러 → 모두 롤백
    return c.json({ user, profile }, 201);
}
```

## 베스트 프랙티스

### 1. 서비스 레이어에서 Repository 사용

```typescript
// src/server/services/user-service.ts
import { UserRepository } from '@/server/repositories/user-repository';
import { ProfileRepository } from '@/server/repositories/profile-repository';
import { getDb } from '@/server/core';
import { ConflictError } from '@/server/core/errors';

export class UserService {
    private userRepo: UserRepository;
    private profileRepo: ProfileRepository;

    constructor() {
        this.userRepo = new UserRepository(getDb());
        this.profileRepo = new ProfileRepository(getDb());
    }

    async createUser(data: CreateUserData) {
        // 중복 체크
        const existing = await this.userRepo.findByEmail(data.email);
        if (existing) {
            throw new ConflictError('Email already exists');
        }

        // 사용자 생성
        const user = await this.userRepo.save({
            email: data.email,
            name: data.name,
        });

        // 프로필 생성
        const profile = await this.profileRepo.save({
            userId: user.id,
            bio: data.bio,
        });

        return { user, profile };
    }
}

// 라우트에서 사용
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
    const data = await c.req.json();
    const userService = new UserService();
    const result = await userService.createUser(data);

    return c.json(result, 201);
}
```

### 2. Repository 재사용

```typescript
// ❌ 나쁨 - 매번 새로 생성
export async function GET(c: RouteContext) {
    const userRepo = new Repository(getDb(), users);
    return c.json(await userRepo.findAll());
}

// ✅ 좋음 - 함수로 분리
function getUserRepo() {
    return new Repository(getDb(), users);
}

export async function GET(c: RouteContext) {
    return c.json(await getUserRepo().findAll());
}
```

### 3. 타입 안전성

```typescript
// ✅ 좋음 - 타입 명시
const userRepo = new Repository<typeof users>(getDb(), users);

// ❌ 나쁨 - any 타입
const userRepo: any = new Repository(getDb(), users);
```

### 4. 에러 처리

```typescript
import { NotFoundError } from '@/server/core/errors';

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

## 제한사항

### 1. 복잡한 JOIN

복잡한 JOIN이 필요한 경우 직접 쿼리를 작성하세요:

```typescript
// Repository로는 어려움
const result = await userRepo.findPage({
    // JOIN을 표현할 수 없음
});

// 직접 쿼리 작성
const db = getDb();
const result = await db
    .select({
        user: users,
        post: posts,
        comments: count(comments.id),
    })
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId))
    .leftJoin(comments, eq(posts.id, comments.postId))
    .groupBy(users.id, posts.id);
```

### 2. 서브쿼리

서브쿼리가 필요한 경우 Drizzle의 고급 기능을 사용하세요:

```typescript
// Repository로는 어려움
// 직접 Drizzle 쿼리 작성
```

### 3. Raw SQL

Raw SQL이 필요한 경우:

```typescript
import { sql } from 'drizzle-orm';

const db = getDb();
const result = await db.execute(sql`
    SELECT *
    FROM users
    WHERE created_at > NOW() - INTERVAL '7 days'
`);
```

## 다음 단계

- **[에러 처리](./error-handling.md)** - Repository 에러 처리
- **[테스트](./testing.md)** - Repository 테스트 작성
- **[API 레퍼런스](../api/repository.md)** - Repository API 상세 문서