# @spfn/core/db - Database Layer

PostgreSQL + Drizzle ORM database layer with JPA-style Repository pattern and Read Replica support.

## Features

- ✅ **Zero-Config**: Works with just `DATABASE_URL`
- ✅ **Read Replica Support**: Automatic read/write separation
- ✅ **JPA-Style Repository**: Spring Data JPA-inspired API
- ✅ **Transaction Support**: AsyncLocalStorage-based transactions
- ✅ **Type-Safe**: Full TypeScript + Drizzle ORM integration
- ✅ **Connection Pooling**: Automatic connection management with retry logic
- ✅ **Query Builder**: Advanced filtering, sorting, and pagination
- ✅ **Schema Helpers**: Utilities for common schema patterns

---

## Quick Start

### 1. Setup Database Connection

```bash
# .env.local
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Optional: Read Replica
DATABASE_REPLICA_URL=postgresql://user:password@replica:5432/mydb
```

### 2. Define Schema

```typescript
// server/entities/users.ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
  ...id,
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  ...timestamps,
});
```

### 3. Use in Routes

```typescript
// server/routes/users/GET.ts
import { getDb } from '@spfn/core';
import { users } from '../../entities/users';

export async function GET(c: RouteContext) {
  const db = getDb();

  // Option 1: Direct Drizzle
  const allUsers = await db.select().from(users);

  // Option 2: Repository Pattern
  const userRepo = db.for(users);
  const result = await userRepo.findPage({
    filters: { email: { like: '@example.com' } },
    sort: [{ field: 'createdAt', direction: 'desc' }],
    pagination: { page: 1, limit: 20 }
  });

  return c.json(result);
}
```

---

## Core Concepts

### DB Instance vs Context

```typescript
// ❌ Don't use: Bypasses transactions
import { db } from '@spfn/core';
await db.select().from(users);

// ✅ Do use: Respects transactions
import { getDb } from '@spfn/core';
const db = getDb();
await db.select().from(users);
```

### Read/Write Separation

```typescript
import { getRawDb } from '@spfn/core';

// Read from replica (if configured)
const users = await getRawDb('read').select().from(users);

// Write to primary
await getRawDb('write').insert(users).values({ email: 'new@example.com' });
```

---

## API Reference

### `getDb()`

Get context-aware DB instance that respects transactions.

```typescript
import { getDb } from '@spfn/core';

const db = getDb();

// Direct Drizzle usage
const users = await db.select().from(usersTable);

// Repository pattern
const userRepo = db.for(usersTable);
const user = await userRepo.findById(1);
```

**Returns:** `WrappedDb` - Provides both Drizzle API and Repository pattern

---

### `getRawDb(type)`

Get raw Drizzle instance for advanced use cases.

```typescript
import { getRawDb } from '@spfn/core';

// Read from replica
const users = await getRawDb('read').select().from(usersTable);

// Write to primary
await getRawDb('write').insert(usersTable).values(data);
```

**⚠️ Warning:** Bypasses transaction context. Use `getDb()` for normal cases.

**Parameters:**
- `type: 'read' | 'write'` - Connection type (default: 'write')

**Returns:** `PostgresJsDatabase`

---

### Schema Helpers

#### `id`

Standard auto-incrementing ID column.

```typescript
import { id } from '@spfn/core/db';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  ...id, // { id: serial('id').primaryKey() }
  email: text('email').notNull(),
});
```

---

#### `timestamps`

CreatedAt and UpdatedAt columns with defaults.

```typescript
import { timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
  ...id,
  email: text('email').notNull(),
  ...timestamps, // { createdAt, updatedAt }
});
```

**Columns:**
- `createdAt: timestamp` - Auto-set on creation
- `updatedAt: timestamp` - Auto-updates on modification

---

#### `foreignKey(name, table, column)`

Type-safe foreign key helper.

```typescript
import { foreignKey } from '@spfn/core/db';
import { users } from './users';

export const posts = pgTable('posts', {
  ...id,
  ...foreignKey('userId', users, 'id'), // userId: integer references users(id)
  title: text('title').notNull(),
});
```

**Parameters:**
- `name: string` - Column name (e.g., 'userId')
- `table: PgTable` - Referenced table
- `column: string` - Referenced column (default: 'id')

**Returns:** `{ [name]: integer().notNull().references(() => table[column]) }`

---

#### `optionalForeignKey(name, table, column)`

Nullable foreign key.

```typescript
import { optionalForeignKey } from '@spfn/core/db';

export const posts = pgTable('posts', {
  ...id,
  ...optionalForeignKey('authorId', users, 'id'), // Can be null
  title: text('title').notNull(),
});
```

---

## Repository Pattern

### Creating a Repository

```typescript
import { getDb } from '@spfn/core';
import { users } from '../entities/users';

const db = getDb();
const userRepo = db.for(users);
```

### Repository Methods

#### `findAll()`

```typescript
const allUsers = await userRepo.findAll();
```

**Returns:** `Promise<User[]>`

---

#### `findById(id)`

```typescript
const user = await userRepo.findById(123);
```

**Returns:** `Promise<User | null>`

---

#### `findOne(where)`

```typescript
import { eq } from 'drizzle-orm';

const user = await userRepo.findOne(
  eq(users.email, 'john@example.com')
);
```

**Returns:** `Promise<User | null>`

---

#### `findPage(pageable)`

Advanced query with filters, sorting, and pagination.

```typescript
const result = await userRepo.findPage({
  filters: {
    email: { like: '@example.com' },
    createdAt: { gte: new Date('2024-01-01') }
  },
  sort: [
    { field: 'createdAt', direction: 'desc' },
    { field: 'email', direction: 'asc' }
  ],
  pagination: { page: 1, limit: 20 }
});

console.log(result.data); // User[]
console.log(result.meta); // { page, limit, total, totalPages, hasNext, hasPrev }
```

**Filter Operators:**
- `eq`, `ne` - Equal, Not Equal
- `gt`, `gte`, `lt`, `lte` - Comparisons
- `like`, `ilike` - Pattern matching
- `in`, `notIn` - Array membership
- `isNull`, `isNotNull` - Null checks

**Returns:** `Promise<Page<User>>`

---

#### `save(data)`

Create a new record.

```typescript
const newUser = await userRepo.save({
  email: 'john@example.com',
  name: 'John Doe'
});
```

**Returns:** `Promise<User>`

---

#### `update(id, data)`

Update an existing record.

```typescript
const updated = await userRepo.update(123, {
  name: 'Jane Doe'
});
```

**Returns:** `Promise<User | null>`

---

#### `delete(id)`

Delete a record.

```typescript
const deleted = await userRepo.delete(123);
```

**Returns:** `Promise<User | null>`

---

#### `count(where?)`

Count records.

```typescript
// Total count
const total = await userRepo.count();

// Conditional count
import { eq } from 'drizzle-orm';
const activeUsers = await userRepo.count(
  eq(users.status, 'active')
);
```

**Returns:** `Promise<number>`

---

## Transactions

### Using `@Transactional` Decorator

```typescript
import { Transactional } from '@spfn/core';
import { getDb } from '@spfn/core';

class UserService {
  @Transactional()
  async createUserWithProfile(userData: any, profileData: any) {
    const db = getDb(); // Uses transaction automatically

    const userRepo = db.for(users);
    const user = await userRepo.save(userData);

    const profileRepo = db.for(profiles);
    await profileRepo.save({ ...profileData, userId: user.id });

    return user; // Both saved or both rolled back
  }
}
```

### Manual Transaction Control

```typescript
import { runWithTransaction } from '@spfn/core';
import { getRawDb } from '@spfn/core';

await runWithTransaction(async (tx) => {
  const userRepo = new Repository(tx, users);
  const user = await userRepo.save(userData);

  const profileRepo = new Repository(tx, profiles);
  await profileRepo.save({ userId: user.id, ...profileData });
});
```

---

## Advanced Usage

### Custom Repository

```typescript
import { Repository } from '@spfn/core';
import { users } from '../entities/users';

class UserRepository extends Repository<typeof users> {
  async findByEmail(email: string) {
    return this.findOne(eq(users.email, email));
  }

  async findActiveUsers() {
    return this.findPage({
      filters: { status: { eq: 'active' } },
      sort: [{ field: 'createdAt', direction: 'desc' }]
    });
  }
}

// Usage
const db = getDb();
const userRepo = new UserRepository(db, users);
const user = await userRepo.findByEmail('john@example.com');
```

### Complex Queries

```typescript
import { and, or, eq, gte, like } from 'drizzle-orm';

const result = await userRepo.findPage({
  filters: {
    // Supports complex conditions via query builder
    $or: [
      { email: { like: '@gmail.com' } },
      { email: { like: '@example.com' } }
    ],
    createdAt: { gte: new Date('2024-01-01') },
    status: { in: ['active', 'pending'] }
  },
  sort: [{ field: 'createdAt', direction: 'desc' }],
  pagination: { page: 1, limit: 50 }
});
```

### Batch Operations

```typescript
const db = getDb();

// Batch insert
await db.insert(users).values([
  { email: 'user1@example.com', name: 'User 1' },
  { email: 'user2@example.com', name: 'User 2' },
  { email: 'user3@example.com', name: 'User 3' }
]);

// Batch update
await db.update(users)
  .set({ status: 'inactive' })
  .where(lt(users.lastLoginAt, new Date('2023-01-01')));
```

---

## Environment Variables

### Required

```bash
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### Optional

```bash
# Read Replica (for read/write separation)
DATABASE_REPLICA_URL=postgresql://user:password@replica:5432/dbname

# Connection Pool (defaults shown)
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_POOL_IDLE_TIMEOUT=30000

# Retry Configuration
DB_RETRY_MAX_ATTEMPTS=3
DB_RETRY_DELAY=1000
DB_RETRY_MAX_DELAY=10000
```

---

## Performance Tips

### 1. Use Read Replicas

```typescript
// Configure replica in .env
DATABASE_REPLICA_URL=postgresql://...

// Repository auto-routes reads to replica
const users = await userRepo.findAll(); // Uses replica
await userRepo.save(data); // Uses primary
```

### 2. Optimize Pagination

```typescript
// Use cursor-based pagination for large datasets
const result = await userRepo.findPage({
  filters: { id: { gt: lastSeenId } },
  sort: [{ field: 'id', direction: 'asc' }],
  pagination: { page: 1, limit: 100 }
});
```

### 3. Select Only Needed Columns

```typescript
const db = getDb();

// ❌ Don't: Selects all columns
const users = await db.select().from(usersTable);

// ✅ Do: Select specific columns
const users = await db.select({
  id: usersTable.id,
  email: usersTable.email
}).from(usersTable);
```

### 4. Use Indexes

```typescript
import { pgTable, text, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  ...id,
  email: text('email').notNull().unique(),
  status: text('status').notNull(),
  ...timestamps
}, (table) => ({
  emailIdx: index('email_idx').on(table.email),
  statusIdx: index('status_idx').on(table.status)
}));
```

---

## Troubleshooting

### ⚠️ "Transaction context not found"

**Cause:** Using `db` directly instead of `getDb()`

**Solution:**
```typescript
// ❌ Wrong
import { db } from '@spfn/core';

// ✅ Correct
import { getDb } from '@spfn/core';
const db = getDb();
```

### ⚠️ "Cannot read property 'id' of undefined"

**Cause:** Table doesn't have an `id` column

**Solution:** Add `id` to your schema:
```typescript
import { id } from '@spfn/core/db';

export const myTable = pgTable('my_table', {
  ...id, // Required for Repository methods
  ...
});
```

### ⚠️ Connection pool exhausted

**Cause:** Too many concurrent connections

**Solution:** Adjust pool size:
```bash
DB_POOL_MAX=50  # Increase max connections
```

---

## Related

- [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview) - Full ORM API
- [PostgreSQL Documentation](https://www.postgresql.org/docs/) - Database reference
- [@spfn/core](../../README.md) - Main package documentation
- [FRAMEWORK_PHILOSOPHY.md](../../../../FRAMEWORK_PHILOSOPHY.md) - Architecture principles