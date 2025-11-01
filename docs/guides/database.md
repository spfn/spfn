---
title: "Database Guide"
description: "Learn how to work with PostgreSQL and Drizzle ORM in Superfunction"
order: 1
available: true
---

# Database Guide

Superfunction provides a type-safe database layer built on Drizzle ORM with helper functions, automatic transactions, and read/write separation.

## Features

- **Helper Functions** - Type-safe CRUD operations with minimal boilerplate
- **Automatic Transactions** - AsyncLocalStorage-based transaction management
- **Read/Write Separation** - Automatic routing to read replicas
- **Schema Helpers** - Reusable column definitions (id, timestamps, foreign keys)
- **Type Safety** - Full TypeScript support with Drizzle ORM

## Setup

### Environment Variables

Configure your database connection in `.env`:

```bash
# Single database
DATABASE_URL=postgresql://localhost:5432/mydb

# Or with read/write separation
DATABASE_WRITE_URL=postgresql://primary:5432/mydb
DATABASE_READ_URL=postgresql://replica:5432/mydb
```

### Initialize Database

Initialize the database connection at app startup:

```typescript
// src/server/index.ts
import { initDatabase } from '@spfn/core/db';

// Initialize once at startup
await initDatabase();

console.log('Database initialized');
```

## Defining Schemas

Define your database schemas using Drizzle ORM with Superfunction helpers:

### Basic Schema

```typescript
// src/server/entities/users.ts
import { pgTable, text, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
  id: id(),                          // Auto-incrementing bigserial primary key
  email: text('email').notNull(),
  name: text('name'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps()                    // Adds createdAt + updatedAt
}, (table) => [
  // Modern Drizzle constraint syntax (array-based)
  uniqueIndex('users_email_idx').on(table.email),
  index('users_active_idx').on(table.isActive)
]);

// Type inference
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Schema with Foreign Keys

```typescript
// src/server/entities/posts.ts
import { pgTable, text, boolean, integer, index } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey, optionalForeignKey } from '@spfn/core/db';
import { users } from './users';
import { categories } from './categories';

export const posts = pgTable('posts', {
  id: id(),
  title: text('title').notNull(),
  content: text('content'),
  published: boolean('published').notNull().default(false),
  viewCount: integer('view_count').notNull().default(0),

  // Required foreign key with cascade delete
  authorId: foreignKey('author', () => users.id),

  // Optional foreign key
  categoryId: optionalForeignKey('category', () => categories.id),

  ...timestamps()
}, (table) => [
  index('posts_author_idx').on(table.authorId),
  index('posts_category_idx').on(table.categoryId),
  index('posts_published_idx').on(table.published),

  // Composite index for common queries
  index('posts_author_published_idx').on(table.authorId, table.published)
]);
```

### Schema Helpers

Superfunction provides reusable column helpers:

- `id()` - Auto-incrementing bigserial primary key
- `timestamps()` - Adds createdAt and updatedAt columns
- `foreignKey(name, ref)` - Required foreign key with cascade delete
- `optionalForeignKey(name, ref)` - Nullable foreign key

## Helper Functions

Superfunction provides type-safe helper functions for common database operations:

### Finding Records

```typescript
import { findOne, findMany } from '@spfn/core/db';
import { desc, gt, like, and } from 'drizzle-orm';
import { users } from '@/server/entities/users';

// Find single record (object-based where)
const user = await findOne(users, { id: 1 });
const userByEmail = await findOne(users, { email: 'test@example.com' });

// Find single record (SQL-based where for complex queries)
const adult = await findOne(users, gt(users.age, 18));

// Find all records
const allUsers = await findMany(users, {
  orderBy: desc(users.createdAt)
});

// Find with filters and pagination
const activeUsers = await findMany(users, {
  where: { isActive: true },
  orderBy: desc(users.createdAt),
  limit: 10,
  offset: 0
});

// Complex SQL where clause
const results = await findMany(users, {
  where: and(
    gt(users.age, 18),
    like(users.email, '%@example.com')
  ),
  orderBy: [desc(users.createdAt), users.name],
  limit: 20
});
```

### Creating Records

```typescript
import { create, createMany } from '@spfn/core/db';

// Create single record
const user = await create(users, {
  email: 'new@example.com',
  name: 'New User',
  isActive: true
});

console.log(user.id); // Auto-generated ID

// Create multiple records
const newUsers = await createMany(users, [
  { email: 'user1@example.com', name: 'User 1' },
  { email: 'user2@example.com', name: 'User 2' },
  { email: 'user3@example.com', name: 'User 3' }
]);

console.log(newUsers.length); // 3
```

### Updating Records

```typescript
import { updateOne, updateMany } from '@spfn/core/db';
import { eq } from 'drizzle-orm';

// Update single record (object-based where)
const updated = await updateOne(users, { id: 1 }, {
  name: 'Updated Name'
});

// Update single record (SQL-based where)
const user = await updateOne(users, eq(users.email, 'test@example.com'), {
  name: 'New Name'
});

// Update multiple records
const updatedUsers = await updateMany(users, { isActive: false }, {
  isActive: true
});

console.log(updatedUsers.length); // Number of updated records
```

### Deleting Records

```typescript
import { deleteOne, deleteMany } from '@spfn/core/db';

// Delete single record
const deleted = await deleteOne(users, { id: 1 });

if (deleted) {
  console.log('Deleted:', deleted.email);
}

// Delete multiple records
const deletedUsers = await deleteMany(users, { isActive: false });

console.log(`Deleted ${deletedUsers.length} inactive users`);
```

### Counting Records

```typescript
import { count } from '@spfn/core/db';
import { gt } from 'drizzle-orm';

// Count all records
const total = await count(users);

// Count with filter (object-based)
const activeCount = await count(users, { isActive: true });

// Count with complex filter (SQL-based)
const adultCount = await count(users, gt(users.age, 18));
```

### Upsert (Insert or Update)

```typescript
import { upsert } from '@spfn/core/db';
import { sql } from 'drizzle-orm';

// Upsert - insert or update on conflict
const cache = await upsert(cacheTable, {
  key: 'config:theme',
  value: 'dark'
}, {
  target: [cacheTable.key],  // Conflict target
  set: {
    value: 'dark',
    updatedAt: new Date()
  }
});

// Upsert with SQL expression
const counter = await upsert(countersTable, {
  name: 'page_views',
  count: 1
}, {
  target: [countersTable.name],
  set: {
    count: sql`${countersTable.count} + 1`  // Increment on conflict
  }
});
```

## Transactions

Superfunction provides automatic transaction management with the `Transactional()` middleware:

### Using Transactional Middleware

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { create, updateOne } from '@spfn/core/db';
import { users, profiles } from '@/server/entities';

const app = createApp();

// Apply transaction middleware to specific route
app.bind(
  createUserContract,
  [Transactional()],  // ← All operations in same transaction
  async (c) => {
    const data = await c.data();

    // 1. Create user
    const user = await create(users, {
      email: data.email,
      name: data.name
    });

    // 2. Create profile
    const profile = await create(profiles, {
      userId: user.id,
      bio: data.bio
    });

    // 3. Update user with profile ID
    await updateOne(users, { id: user.id }, {
      profileId: profile.id
    });

    // ✅ If any operation fails → automatic rollback
    // ✅ If all succeed → automatic commit

    return c.json({ user, profile });
  }
);

export default app;
```

> **How Transactions Work**
>
> - All database operations within the handler use the same transaction
> - Success → Automatic commit when handler returns
> - Error → Automatic rollback when handler throws
> - AsyncLocalStorage propagates transaction context automatically

### Error Handling in Transactions

```typescript
app.bind(
  transferMoneyContract,
  [Transactional()],
  async (c) => {
    const { fromUserId, toUserId, amount } = await c.data();

    try {
      // Withdraw from sender
      const sender = await updateOne(users, { id: fromUserId }, {
        balance: sql`balance - ${amount}`
      });

      if (!sender || sender.balance < 0) {
        throw new Error('Insufficient funds');
      }

      // Deposit to receiver
      await updateOne(users, { id: toUserId }, {
        balance: sql`balance + ${amount}`
      });

      return c.json({ success: true });
    } catch (error) {
      // ⚠️ Must re-throw to trigger rollback
      console.error('Transfer failed:', error);
      throw error;  // ← This triggers rollback
    }
  }
);
```

## Complex Queries

For complex queries beyond helper functions, use the direct database API:

### Joins and Aggregations

```typescript
import { getDatabase } from '@spfn/core/db';
import { eq, sql, desc } from 'drizzle-orm';
import { posts, users, comments } from '@/server/entities';

export async function GET(c: RouteContext) {
  const db = getDatabase('read');  // Use read replica

  // Complex join with aggregation
  const results = await db
    .select({
      post: posts,
      author: {
        id: users.id,
        name: users.name,
        email: users.email
      },
      commentCount: sql<number>`count(${comments.id})`.as('comment_count')
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .leftJoin(comments, eq(comments.postId, posts.id))
    .where(eq(posts.published, true))
    .groupBy(posts.id, users.id)
    .orderBy(desc(posts.createdAt))
    .limit(20);

  return c.json({ posts: results });
}
```

### Subqueries

```typescript
import { getDatabase } from '@spfn/core/db';
import { eq, inArray } from 'drizzle-orm';

const db = getDatabase('read');

// Find users who have published posts
const usersWithPosts = await db
  .select()
  .from(users)
  .where(
    inArray(
      users.id,
      db.select({ authorId: posts.authorId })
        .from(posts)
        .where(eq(posts.published, true))
    )
  );
```

## Database Migrations

Superfunction uses Drizzle Kit for database migrations:

### Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/entities/index.ts',
  out: './src/server/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
```

### Export All Schemas

```typescript
// src/server/entities/index.ts
export * from './users';
export * from './posts';
export * from './comments';
export * from './categories';
```

### Generate and Apply Migrations

```bash
# Generate migration from schema changes
npx spfn@alpha db generate

# Apply migrations to database
npx spfn@alpha db migrate

# Or use Drizzle Kit directly
npx drizzle-kit generate
npx drizzle-kit migrate
```

## Read/Write Separation

Superfunction automatically routes read operations to replica databases when configured:

```typescript
// Helper functions handle separation automatically
await findMany(users);   // ← Uses read replica (DATABASE_READ_URL)
await findOne(users, { id: 1 });  // ← Uses read replica

await create(users, data);  // ← Uses primary (DATABASE_WRITE_URL)
await updateOne(users, { id: 1 }, data);  // ← Uses primary

// Manual control
import { getDatabase } from '@spfn/core/db';

const readDb = getDatabase('read');   // Read replica
const writeDb = getDatabase('write'); // Primary database
```

## Best Practices

### 1. Use Helper Functions

```typescript
// ✅ Good: Use helper functions
const user = await findOne(users, { id: 1 });

// ❌ Bad: Manual queries for simple operations
const db = getDatabase('read');
const [user] = await db.select().from(users).where(eq(users.id, 1)).limit(1);
```

### 2. Always Use Transactions for Write Operations

```typescript
// ✅ Good: Use Transactional middleware
app.bind(
  createUserContract,
  [Transactional()],
  async (c) => {
    const user = await create(users, data);
    const profile = await create(profiles, { userId: user.id });
    return c.json({ user, profile });
  }
);

// ❌ Bad: No transaction - partial data on error
app.bind(createUserContract, async (c) => {
  const user = await create(users, data);
  const profile = await create(profiles, { userId: user.id });  // If this fails, user is orphaned!
  return c.json({ user, profile });
});
```

### 3. Use Schema Helpers for Consistency

```typescript
// ✅ Good: Use schema helpers
export const users = pgTable('users', {
  id: id(),
  ...timestamps()
});

// ❌ Bad: Manual column definitions
export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});
```

### 4. Always Add Indexes

```typescript
// ✅ Good: Index foreign keys and frequently queried columns
export const posts = pgTable('posts', {
  id: id(),
  authorId: foreignKey('author', () => users.id),
  categoryId: foreignKey('category', () => categories.id),
  published: boolean('published').notNull().default(false),
  ...timestamps()
}, (table) => [
  index('posts_author_idx').on(table.authorId),
  index('posts_category_idx').on(table.categoryId),
  index('posts_published_idx').on(table.published),
  // Composite index for common query patterns
  index('posts_author_published_idx').on(table.authorId, table.published)
]);
```

> **Next: Authentication**
>
> Learn how to implement authentication in your Superfunction application.
>
> [Authentication Guide →](/docs/guides/authentication)