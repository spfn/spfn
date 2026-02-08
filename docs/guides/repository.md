---
title: "Repository"
description: "Data access layer with BaseRepository, query helpers, and business logic patterns"
order: 11
available: true
---

# Repository

Repositories provide the data access layer in SPFN. Extend `BaseRepository` to get type-safe CRUD operations, transaction-aware connections, and master-replica routing out of the box.

## Basic Repository

```typescript
// src/server/repositories/user.repository.ts
import { BaseRepository } from '@spfn/core/db';
import { users, type User, type NewUser } from '../entities/users';

export class UserRepository extends BaseRepository
{
    async findById(id: string): Promise<User | null>
    {
        return this._findOne(users, { id });
    }

    async findByEmail(email: string): Promise<User | null>
    {
        return this._findOne(users, { email });
    }

    async findAll(): Promise<User[]>
    {
        return this._findMany(users);
    }

    async create(data: NewUser): Promise<User>
    {
        return this._create(users, data);
    }

    async update(id: string, data: Partial<NewUser>): Promise<User | null>
    {
        return this._updateOne(users, { id }, data);
    }

    async delete(id: string): Promise<User | null>
    {
        return this._deleteOne(users, { id });
    }
}

// Export singleton instance
export const userRepo = new UserRepository();
```

## Singleton Pattern

Export a singleton instance from each repository. BaseRepository uses `AsyncLocalStorage` to detect active transactions, so a single instance automatically uses the correct connection.

```typescript
// src/server/repositories/user.repository.ts
export class UserRepository extends BaseRepository
{
    // ... methods
}

export const userRepo = new UserRepository();
```

**Usage in routes:**

```typescript
import { userRepo } from '../repositories/user.repository';

export const getUser = route.get('/users/:id')
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return userRepo.findById(params.id);
    });
```

### Index File Export

```typescript
// src/server/repositories/index.ts
export { userRepo } from './user.repository';
export { postRepo } from './post.repository';
export { categoryRepo } from './category.repository';

// Also export classes for testing
export { UserRepository } from './user.repository';
```

## Protected Helper Methods

BaseRepository provides these protected methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `_findOne(table, where)` | `T \| null` | Find single record |
| `_findMany(table, options?)` | `T[]` | Find multiple records |
| `_create(table, data)` | `T` | Create single record |
| `_createMany(table, data[])` | `T[]` | Create multiple records |
| `_upsert(table, data, options)` | `T` | Insert or update |
| `_updateOne(table, where, data)` | `T \| null` | Update single record |
| `_updateMany(table, where, data)` | `T[]` | Update multiple records |
| `_deleteOne(table, where)` | `T \| null` | Delete single record |
| `_deleteMany(table, where)` | `T[]` | Delete multiple records |
| `_count(table, where?)` | `number` | Count records |

## Where Clause

### Object-based (Simple Equality)

For straightforward equality checks:

```typescript
// Single field
await this._findOne(users, { id: '1' });

// Multiple fields (AND)
await this._findOne(users, { email: 'test@example.com', isActive: true });
```

### SQL-based (Complex Conditions)

For operators beyond equality:

```typescript
import { eq, and, or, gt, lt, like, isNull, inArray } from 'drizzle-orm';

// Complex AND
await this._findMany(users, {
    where: and(
        eq(users.isActive, true),
        gt(users.createdAt, lastWeek),
    ),
});

// OR condition
await this._findMany(users, {
    where: or(
        eq(users.role, 'admin'),
        eq(users.role, 'moderator'),
    ),
});

// LIKE
await this._findMany(users, {
    where: like(users.email, '%@example.com'),
});

// IN
await this._findMany(users, {
    where: inArray(users.id, ['1', '2', '3']),
});

// IS NULL
await this._findMany(users, {
    where: isNull(users.deletedAt),
});
```

## Query Options

### Ordering

```typescript
import { desc, asc } from 'drizzle-orm';

await this._findMany(users, {
    orderBy: desc(users.createdAt),
});

// Multiple columns
await this._findMany(users, {
    orderBy: [desc(users.createdAt), asc(users.name)],
});
```

### Pagination

```typescript
await this._findMany(users, {
    limit: 20,
    offset: 40,  // Skip first 40
});
```

### Combined

```typescript
await this._findMany(users, {
    where: eq(users.isActive, true),
    orderBy: desc(users.createdAt),
    limit: 10,
    offset: 0,
});
```

## Database Access

BaseRepository provides two protected database getters:

```typescript
export class UserRepository extends BaseRepository
{
    // this.db     - Write database (transaction-aware)
    // this.readDb - Read database (uses replica if available)

    async customQuery()
    {
        // Use readDb for SELECT
        const results = await this.readDb
            .select()
            .from(users)
            .where(eq(users.isActive, true));

        // Use db for INSERT/UPDATE/DELETE
        await this.db
            .insert(users)
            .values(data);
    }
}
```

## Business Logic Patterns

### Validation in Create

```typescript
export class UserRepository extends BaseRepository
{
    async createWithValidation(data: NewUser): Promise<User>
    {
        const existing = await this._findOne(users, { email: data.email });
        if (existing)
        {
            throw new Error('Email already exists');
        }

        return this._create(users, data);
    }
}
```

### Soft Delete

```typescript
export class PostRepository extends BaseRepository
{
    async softDelete(id: string, deletedBy: string): Promise<Post | null>
    {
        return this._updateOne(posts, { id }, {
            deletedAt: new Date(),
            deletedBy,
        });
    }

    async findActive(): Promise<Post[]>
    {
        return this._findMany(posts, {
            where: isNull(posts.deletedAt),
        });
    }
}
```

### Paginated Query

```typescript
export class UserRepository extends BaseRepository
{
    async findPaginated(page: number, limit: number)
    {
        const offset = (page - 1) * limit;

        const [items, total] = await Promise.all([
            this._findMany(users, {
                orderBy: desc(users.createdAt),
                limit,
                offset,
            }),
            this._count(users),
        ]);

        return {
            items,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
}
```

### Filtered Query

```typescript
export class UserRepository extends BaseRepository
{
    async findByFilters(filters: {
        role?: string;
        isActive?: boolean;
        search?: string;
    }): Promise<User[]>
    {
        const conditions = [];

        if (filters.role)
        {
            conditions.push(eq(users.role, filters.role));
        }

        if (filters.isActive !== undefined)
        {
            conditions.push(eq(users.isActive, filters.isActive));
        }

        if (filters.search)
        {
            conditions.push(or(
                like(users.name, `%${filters.search}%`),
                like(users.email, `%${filters.search}%`),
            ));
        }

        return this._findMany(users, {
            where: conditions.length > 0 ? and(...conditions) : undefined,
            orderBy: desc(users.createdAt),
        });
    }
}
```

## Complex Queries

For queries that can't be expressed with helpers, use direct database access:

```typescript
import { sql, getTableColumns } from 'drizzle-orm';

export class UserRepository extends BaseRepository
{
    async findWithPostCounts(): Promise<Array<User & { postCount: number }>>
    {
        return this.readDb
            .select({
                ...getTableColumns(users),
                postCount: sql<number>`count(${posts.id})::int`,
            })
            .from(users)
            .leftJoin(posts, eq(users.id, posts.authorId))
            .where(eq(users.isActive, true))
            .groupBy(users.id)
            .orderBy(desc(sql`count(${posts.id})`));
    }

    async findUsersWithRecentPosts(since: Date)
    {
        return this.readDb
            .selectDistinct({ user: users })
            .from(users)
            .innerJoin(posts, eq(users.id, posts.authorId))
            .where(gt(posts.createdAt, since));
    }
}
```

## Error Handling

### withContext

Wrap operations with context for better error tracking:

```typescript
export class UserRepository extends BaseRepository
{
    async findById(id: string)
    {
        return this.withContext(
            () => this._findOne(users, { id }),
            { method: 'findById', table: 'users' },
        );
    }
}

// On error: RepositoryError with repository name, method, table context
```

## Best Practices

```typescript
// 1. Encapsulate business logic in repository methods
async createWithValidation(data: NewUser)
{
    const existing = await this._findOne(users, { email: data.email });
    if (existing) throw new Error('Email exists');
    return this._create(users, data);
}

// 2. Use object-based where for simple queries
await this._findOne(users, { id });

// 3. Use SQL-based where for complex queries
await this._findMany(users, {
    where: and(eq(users.role, 'admin'), gt(users.createdAt, date)),
});

// 4. Use readDb for read operations
async findAll()
{
    return this.readDb.select().from(users);
}

// 5. Create domain-specific methods
async findActiveAdmins()
{
    return this._findMany(users, {
        where: and(eq(users.role, 'admin'), eq(users.isActive, true)),
    });
}

// 6. Don't put repository logic in routes
// Route handler should delegate to repository methods
```

## Related

- [Entity](/docs/guides/entity) - Database schema definitions
- [Database](/docs/guides/database) - Database setup and migrations
- [Route Definition](/docs/core-concepts/contracts) - Using repositories in routes
- [Testing](/docs/guides/testing) - Testing repositories
