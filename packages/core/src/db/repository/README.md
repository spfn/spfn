# Repository Module

Base repository pattern for database operations with automatic transaction handling and read/write separation.

## Import

```ts
import { Repository } from '@spfn/core/db/repository';
import type { DrizzleTableWithUtils } from '@spfn/core/db/repository';

// or from @spfn/core
import { Repository } from '@spfn/core';
```

## Overview

The Repository base class provides a simple abstraction for database operations with automatic:
- **Transaction context detection** - Automatically uses transaction if in one
- **Read/Write database separation** - Uses read replica for queries when available
- **Type-safe query builders** - Leverages Drizzle ORM's query builder API

## Basic Usage

### Creating a Repository

```ts
import { Repository } from '@spfn/core/db/repository';
import { users } from './schema';
import { eq } from 'drizzle-orm';

class UserRepository extends Repository<typeof users> {
  async findById(id: string) {
    const query = this.select();
    return query.where(eq(this.table.id, id)).limit(1);
  }

  async findAll() {
    return this.select();
  }

  async create(data: InsertUser) {
    const query = this.insert();
    return query.values(data).returning();
  }

  async update(id: string, data: Partial<InsertUser>) {
    const query = this.update();
    return query.set(data).where(eq(this.table.id, id)).returning();
  }

  async delete(id: string) {
    const query = this.delete();
    return query.where(eq(this.table.id, id));
  }
}

// Create instance
const userRepo = new UserRepository(users);

// Use it
const user = await userRepo.findById('123');
const newUser = await userRepo.create({ name: 'John' });
```

## Query Builders

The Repository class provides four protected query builder methods:

### `select()` - Read Operations

Uses read database (replica if available, or transaction context if in transaction):

```ts
protected select() {
  // Automatically uses:
  // 1. Transaction context (if in transaction)
  // 2. Read replica (if available)
  // 3. Primary database (fallback)
  return this.readDb.select().from(this.table);
}
```

**Example:**
```ts
async findActive() {
  return this.select()
    .where(eq(this.table.active, true))
    .orderBy(this.table.createdAt);
}
```

### `insert()` - Create Operations

Uses write database (or transaction context if in transaction):

```ts
protected insert() {
  // Automatically uses:
  // 1. Transaction context (if in transaction)
  // 2. Primary database
  return this.writeDb.insert(this.table);
}
```

**Example:**
```ts
async createMany(users: InsertUser[]) {
  return this.insert()
    .values(users)
    .returning();
}
```

### `update()` - Update Operations

Uses write database (or transaction context if in transaction):

```ts
protected update() {
  // Automatically uses:
  // 1. Transaction context (if in transaction)
  // 2. Primary database
  return this.writeDb.update(this.table);
}
```

**Example:**
```ts
async updateStatus(id: string, status: string) {
  return this.update()
    .set({ status, updatedAt: new Date() })
    .where(eq(this.table.id, id))
    .returning();
}
```

### `delete()` - Delete Operations

Uses write database (or transaction context if in transaction):

```ts
protected delete() {
  // Automatically uses:
  // 1. Transaction context (if in transaction)
  // 2. Primary database
  return this.writeDb.delete(this.table);
}
```

**Example:**
```ts
async deleteOld(days: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return this.delete()
    .where(lt(this.table.createdAt, cutoff));
}
```

## Transaction Integration

Repositories automatically use transaction context when used within `Transactional()` middleware:

```ts
import { Transactional } from '@spfn/core';

export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  const userRepo = new UserRepository(users);
  const profileRepo = new ProfileRepository(profiles);

  // Both operations run in same transaction
  const [user] = await userRepo.create({ name: 'John' });
  const [profile] = await profileRepo.create({
    userId: user.id,
    bio: 'New user'
  });

  return c.json({ user, profile }, 201);
}
```

**How it works:**
1. Middleware starts transaction
2. Transaction stored in AsyncLocalStorage
3. Repository checks AsyncLocalStorage before each operation
4. If transaction found, uses it; otherwise uses appropriate database

## Read/Write Separation

The Repository automatically routes queries to the correct database:

### Read Operations → Read Replica

```ts
// Uses read replica (if configured)
const users = await userRepo.findAll();
const user = await userRepo.findById('123');
```

### Write Operations → Primary Database

```ts
// Always uses primary database
await userRepo.create({ name: 'John' });
await userRepo.update('123', { name: 'Jane' });
await userRepo.delete('123');
```

### Configuration

Set up read/write separation in environment variables:

```bash
# Single database (reads and writes)
DATABASE_URL=postgresql://localhost:5432/mydb

# Separate read/write
DATABASE_WRITE_URL=postgresql://primary:5432/mydb
DATABASE_READ_URL=postgresql://replica:5432/mydb
```

## Advanced Patterns

### Complex Queries

```ts
class UserRepository extends Repository<typeof users> {
  async findWithPagination(page: number, limit: number) {
    const offset = (page - 1) * limit;

    return this.select()
      .limit(limit)
      .offset(offset)
      .orderBy(desc(this.table.createdAt));
  }

  async searchByEmail(email: string) {
    return this.select()
      .where(like(this.table.email, `%${email}%`));
  }

  async countActive() {
    return this.select()
      .where(eq(this.table.active, true));
  }
}
```

### Joins and Relations

```ts
class PostRepository extends Repository<typeof posts> {
  async findWithAuthor(postId: string) {
    // Access underlying database for complex queries
    const query = this.select();

    return this.readDb
      .select({
        post: posts,
        author: users,
      })
      .from(posts)
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.id, postId));
  }
}
```

### Batch Operations

```ts
class UserRepository extends Repository<typeof users> {
  async bulkCreate(userData: InsertUser[]) {
    return this.insert()
      .values(userData)
      .returning();
  }

  async bulkUpdateStatus(ids: string[], status: string) {
    return this.update()
      .set({ status })
      .where(inArray(this.table.id, ids))
      .returning();
  }

  async bulkDelete(ids: string[]) {
    return this.delete()
      .where(inArray(this.table.id, ids));
  }
}
```

## Error Handling

Repositories throw database errors that can be caught and handled:

```ts
import { fromPostgresError } from '@spfn/core/errors';

try {
  await userRepo.create({ email: 'duplicate@example.com' });
} catch (error) {
  const customError = fromPostgresError(error);

  if (customError.name === 'UniqueConstraintError') {
    return c.json({ error: 'Email already exists' }, 409);
  }

  throw customError;
}
```

## Type Definitions

```ts
/**
 * Drizzle table type with utility methods
 */
export interface DrizzleTableWithUtils extends PgTable {
  getTableName: () => string;
}

/**
 * Base Repository class
 */
export class Repository<TTable extends DrizzleTableWithUtils> {
  constructor(protected table: TTable);

  protected get readDb(): TransactionDB;
  protected get writeDb(): TransactionDB;

  protected select(): SelectQueryBuilder;
  protected insert(): InsertQueryBuilder;
  protected update(): UpdateQueryBuilder;
  protected delete(): DeleteQueryBuilder;
}
```

## Best Practices

### ✅ Do

```ts
// 1. Keep repository methods focused
class UserRepository extends Repository<typeof users> {
  async findById(id: string) {
    return this.select().where(eq(this.table.id, id));
  }
}

// 2. Use transactions for multi-step operations
export const middlewares = [Transactional()];
export async function POST(c: RouteContext) {
  await userRepo.create(userData);
  await profileRepo.create(profileData);
  // Auto-commits on success
}

// 3. Leverage read replicas
async getStats() {
  // This uses read replica automatically
  return this.select()
    .where(eq(this.table.type, 'stat'));
}
```

### ❌ Don't

```ts
// 1. Don't bypass repository abstraction unnecessarily
class UserRepository extends Repository<typeof users> {
  async findAll() {
    // Bad: Directly accessing db
    return db.select().from(users);

    // Good: Use repository method
    return this.select();
  }
}

// 2. Don't mix repository and raw queries in same transaction
export async function POST(c: RouteContext) {
  // Bad: Mixing patterns
  await userRepo.create(userData);
  await db.insert(profiles).values(profileData); // Won't use transaction!

  // Good: Use repositories consistently
  await userRepo.create(userData);
  await profileRepo.create(profileData);
}

// 3. Don't create repository instances inside loops
async function processUsers(ids: string[]) {
  // Bad
  for (const id of ids) {
    const repo = new UserRepository(users);
    await repo.findById(id);
  }

  // Good
  const repo = new UserRepository(users);
  for (const id of ids) {
    await repo.findById(id);
  }
}
```

## Testing

```ts
import { describe, it, expect } from 'vitest';
import { db, Transactional } from '@spfn/core';

describe('UserRepository', () => {
  it('should create user', async () => {
    const repo = new UserRepository(users);

    const [user] = await repo.create({
      name: 'Test User',
      email: 'test@example.com'
    });

    expect(user.name).toBe('Test User');
  });

  it('should rollback on error', async () => {
    // Use transaction for test isolation
    await db.transaction(async (tx) => {
      const repo = new UserRepository(users);

      await repo.create({ name: 'Test' });

      // Force rollback
      throw new Error('Rollback test');
    }).catch(() => {
      // Expected error
    });
  });
});
```

## See Also

- [Transaction Module](../transaction/README.md) - Transaction management
- [Manager Module](../manager/README.md) - Database connection and configuration
- [Drizzle ORM Documentation](https://orm.drizzle.team/) - Query builder reference