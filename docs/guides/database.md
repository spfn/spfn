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
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { Transactional } from '@spfn/core/db';
import { create, updateOne } from '@spfn/core/db';
import { users, profiles } from '@/server/entities';

// Apply transaction middleware to specific route
export const createUserWithProfile = route.post('/users')
    .input({
        body: Type.Object({
            email: Type.String(),
            name: Type.String(),
            bio: Type.Optional(Type.String())
        })
    })
    .use([Transactional()])  // ← All operations in same transaction
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // 1. Create user
        const user = await create(users, {
            email: body.email,
            name: body.name
        });

        // 2. Create profile
        const profile = await create(profiles, {
            userId: user.id,
            bio: body.bio
        });

        // 3. Update user with profile ID
        await updateOne(users, { id: user.id }, {
            profileId: profile.id
        });

        // ✅ If any operation fails → automatic rollback
        // ✅ If all succeed → automatic commit

        return c.created({ user, profile });
    });
```

> **How Transactions Work**
>
> - All database operations within the handler use the same transaction
> - Success → Automatic commit when handler returns
> - Error → Automatic rollback when handler throws
> - AsyncLocalStorage propagates transaction context automatically


### Using runInTransaction for Scripts and CLI

For standalone scripts, migrations, or CLI commands outside of Hono routes, use `runInTransaction`:

```typescript
// src/scripts/migrate-users.ts
import { runInTransaction } from '@spfn/core/db';
import { users, profiles } from '@/server/entities';

// Simple usage
await runInTransaction(async (tx) => {
  // All operations use the same transaction
  const user = await tx.insert(users).values({
    email: 'user@example.com',
    name: 'John Doe'
  }).returning();

  await tx.insert(profiles).values({
    userId: user[0].id,
    bio: 'Sample bio'
  });

  // Auto-commits on success, auto-rolls back on error
});
```

#### With Options

```typescript
import { runInTransaction } from '@spfn/core/db';

// Custom timeout and logging
await runInTransaction(
  async (tx) => {
    // Long-running migration
    await tx.execute(sql`/* complex migration */`);
  },
  {
    timeout: 300000,        // 5 minutes (default: 30s)
    slowThreshold: 10000,   // Warn if > 10s (default: 1s)
    enableLogging: true,    // Transaction logging (default: true)
    context: 'migration:users'  // For logging (default: 'transaction')
  }
);
```

#### Transaction Timeout

`runInTransaction` uses PostgreSQL's `statement_timeout` for database-level timeout enforcement:

```typescript
// Timeout after 60 seconds - guaranteed rollback
await runInTransaction(
  async (tx) => {
    // Complex operations...
  },
  { timeout: 60000 }
);

// Disable timeout for very long operations
await runInTransaction(
  async (tx) => {
    // Data migration that may take hours...
  },
  { timeout: 0 }  // No timeout
);
```

**Environment Variable:**
```bash
# Default timeout for all transactions (milliseconds)
TRANSACTION_TIMEOUT=30000  # 30 seconds (default)
```

> **Why Database-Level Timeout?**
>
> Using PostgreSQL's `statement_timeout` ensures that if a transaction times out, it's actually rolled back at the database level, not just canceled on the Node.js side. This prevents data inconsistency from "phantom" transactions that continue running after the application thinks they've timed out.

#### Return Values

```typescript
// Return data from transaction
const user = await runInTransaction(async (tx) => {
  const [newUser] = await tx.insert(users)
    .values({ email: 'test@example.com' })
    .returning();
  
  return newUser;  // Returned to caller
});

console.log(user.id);  // ✅ Type-safe
```

#### Error Handling

```typescript
import { runInTransaction } from '@spfn/core/db';
import { fromPostgresError } from '@spfn/core/db';

try {
  await runInTransaction(async (tx) => {
    // Operations...
  });
} catch (error) {
  // Errors are propagated as-is (not auto-converted)
  // Convert PostgreSQL errors manually if needed
  const customError = fromPostgresError(error);
  console.error('Transaction failed:', customError);
}
```

> **Note:** Unlike the `Transactional` middleware, `runInTransaction` does **not** automatically convert PostgreSQL errors to custom errors. You're responsible for error handling and conversion.

### After-Commit Hooks

Use `onAfterCommit()` to schedule side effects that should only run after the transaction commits successfully. This is ideal for sending notifications, triggering background jobs, or any fire-and-forget work.

```typescript
import { onAfterCommit } from '@spfn/core/db';

async function submitTestimonial(spaceId: string, chatId: string)
{
    const publication = await publicationRepo.create({ spaceId, chatId });
    await requestRepo.updateStatusAtomically(requestId, 'submitted');

    // Only runs after the transaction commits
    onAfterCommit(() =>
    {
        generateArticle(spaceId, chatId, publication.id).catch(console.error);
    });

    return publication;
}
```

**Behavior:**
- Inside a transaction: queued and executed after the root transaction commits
- Inside a nested transaction: bubbles up to the root transaction's queue
- Outside any transaction: executed immediately
- Errors in callbacks are logged but never thrown (commit already succeeded)


```typescript
export const transferMoney = route.post('/transfer')
    .input({
        body: Type.Object({
            fromUserId: Type.String(),
            toUserId: Type.String(),
            amount: Type.Number()
        })
    })
    .use([Transactional()])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const { fromUserId, toUserId, amount } = body;

        try
        {
            // Withdraw from sender
            const sender = await updateOne(users, { id: fromUserId }, {
                balance: sql`balance - ${amount}`
            });

            if (!sender || sender.balance < 0)
            {
                throw new ValidationError({ message: 'Insufficient funds' });
            }

            // Deposit to receiver
            await updateOne(users, { id: toUserId }, {
                balance: sql`balance + ${amount}`
            });

            return c.success({ success: true });
        }
        catch (error)
        {
            // ⚠️ Must re-throw to trigger rollback
            console.error('Transfer failed:', error);
            throw error;  // ← This triggers rollback
        }
    });
```

## Complex Queries

For complex queries beyond helper functions, use the direct database API:

### Getting Database Instance

```typescript
import { getDatabase, getDatabaseOrThrow } from '@spfn/core/db';

// Option 1: getDatabase() - Returns undefined if not initialized
const db = getDatabase('read');
if (!db) {
  throw new Error('Database not initialized');
}

// Option 2: getDatabaseOrThrow() - Automatically throws if not initialized (recommended)
const db = getDatabaseOrThrow('read');  // No null check needed!
```

**Recommendation**: Use `getDatabaseOrThrow()` in most cases to avoid repetitive null checks. Only use `getDatabase()` if you need to gracefully handle the uninitialized state.

### Joins and Aggregations

```typescript
import { getDatabaseOrThrow } from '@spfn/core/db';
import { eq, sql, desc } from 'drizzle-orm';
import { posts, users, comments } from '@/server/entities';

export async function GET(c: RouteContext) {
  const db = getDatabaseOrThrow('read');  // Use read replica

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

## Repository Pattern

Superfunction provides the `BaseRepository` class to eliminate repetitive database access patterns and provide consistent transaction support across your repositories.

### Why Use BaseRepository?

Before BaseRepository, you would repeat this pattern in every repository:

```typescript
// ❌ Before: Repetitive pattern
export class UserRepository {
  private db = getDatabaseOrThrow();

  async findById(id: string) {
    return await this.db.select().from(users).where(eq(users.id, id));
  }
}
```

With BaseRepository, you get:
- ✅ Automatic database instance management
- ✅ Built-in transaction context detection
- ✅ Read/Write separation support
- ✅ Type-safe schema generics
- ✅ Less boilerplate code

### Basic Usage

```typescript
// src/server/repositories/users.ts
import { BaseRepository } from '@spfn/core/db';
import { eq, desc } from 'drizzle-orm';
import { users } from '@/server/entities/users';

export class UserRepository extends BaseRepository {
  async findById(id: string) {
    // this.readDb uses read replica when available
    const result = await this.readDb
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0];
  }

  async findByEmail(email: string) {
    const result = await this.readDb
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return result[0];
  }

  async findAll(options: { limit?: number; offset?: number } = {}) {
    const { limit = 20, offset = 0 } = options;

    return await this.readDb
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async create(data: NewUser) {
    // this.db uses write primary
    const result = await this.db
      .insert(users)
      .values(data)
      .returning();

    return result[0];
  }

  async update(id: string, data: Partial<NewUser>) {
    const result = await this.db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();

    return result[0];
  }

  async delete(id: string) {
    const result = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning();

    return result[0];
  }
}
```

### Using Repositories in Routes

```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { NotFoundError } from '@spfn/core/errors';
import { UserRepository } from '@/server/repositories/users';

const userRepo = new UserRepository();

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();

        const user = await userRepo.findById(params.id);

        if (!user)
        {
            throw new NotFoundError({ resource: 'User' });
        }

        return user;
    });

export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            email: Type.String(),
            name: Type.String()
        })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();

        const user = await userRepo.create(body);

        return c.created(user);
    });
```

### Automatic Transaction Support

BaseRepository automatically detects transaction context and uses the appropriate database instance:

```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { Transactional } from '@spfn/core/db';
import { UserRepository } from '@/server/repositories/users';
import { ProfileRepository } from '@/server/repositories/profiles';

const userRepo = new UserRepository();
const profileRepo = new ProfileRepository();

export const createUserWithProfile = route.post('/users')
    .input({
        body: Type.Object({
            email: Type.String(),
            name: Type.String(),
            bio: Type.Optional(Type.String())
        })
    })
    .use([Transactional()])  // ← Wraps entire operation in transaction
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // Both repositories automatically use the same transaction
        const user = await userRepo.create({
            email: body.email,
            name: body.name
        });

        const profile = await profileRepo.create({
            userId: user.id,
            bio: body.bio
        });

        // ✅ If any operation fails → automatic rollback
        // ✅ If all succeed → automatic commit

        return c.created({ user, profile });
    });
```

### Read/Write Separation

BaseRepository provides two database accessors:

- `this.db` - Write operations (uses primary database)
- `this.readDb` - Read operations (uses read replica when configured)

```typescript
export class UserRepository extends BaseRepository {
  async getStats() {
    // Heavy read query → use read replica
    const result = await this.readDb
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where is_active = true)`,
        inactive: sql<number>`count(*) filter (where is_active = false)`
      })
      .from(users);

    return result[0];
  }

  async activate(id: string) {
    // Write operation → use primary database
    const result = await this.db
      .update(users)
      .set({ isActive: true })
      .where(eq(users.id, id))
      .returning();

    return result[0];
  }
}
```

> **Transaction Context Overrides Read/Write Separation**
>
> When running inside a transaction (via `Transactional()` middleware), both `this.db` and `this.readDb` use the same transaction database instance. This ensures all operations in the transaction see a consistent view of the data.

### Type-Safe Schemas

Use TypeScript generics to type your repository with your schema:

```typescript
// src/server/entities/index.ts
import * as users from './users';
import * as posts from './posts';
import * as comments from './comments';

export const schema = {
  ...users,
  ...posts,
  ...comments
};

export type AppSchema = typeof schema;

// src/server/repositories/users.ts
import { BaseRepository } from '@spfn/core/db';
import type { AppSchema } from '@/server/entities';

export class UserRepository extends BaseRepository<AppSchema> {
  // this.db and this.readDb are now typed with AppSchema
  async findById(id: string) {
    // Full autocomplete and type safety
    return await this.readDb.select().from(this.readDb.schema.users);
  }
}
```

### Combining with Helper Functions

You can still use helper functions alongside repositories:

```typescript
import { BaseRepository } from '@spfn/core/db';
import { findOne, create, updateOne } from '@spfn/core/db';
import { users } from '@/server/entities/users';

export class UserRepository extends BaseRepository {
  // Helper function approach
  async findById(id: string) {
    return await findOne(users, { id });
  }

  // Direct query approach
  async findByEmail(email: string) {
    const result = await this.readDb
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return result[0];
  }

  // Mix and match based on complexity
  async create(data: NewUser) {
    return await create(users, data);
  }
}
```

### Best Practices

```typescript
// ✅ Good: Use BaseRepository for domain logic
export class UserRepository extends BaseRepository {
  async findActiveUsers() {
    return await this.readDb
      .select()
      .from(users)
      .where(eq(users.isActive, true));
  }

  async deactivate(id: string) {
    return await this.db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, id))
      .returning();
  }
}

// ✅ Good: Create repository instances at module level
const userRepo = new UserRepository();

// Use in routes
export const getUser = route.get('/users/:id')
    .input({ params: Type.Object({ id: Type.String() }) })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        const user = await userRepo.findById(params.id);
        return user;
    });

// ❌ Bad: Creating new instances in every request
export const badGetUser = route.get('/users/:id')
    .input({ params: Type.Object({ id: Type.String() }) })
    .handler(async (c) =>
    {
        const userRepo = new UserRepository(); // Unnecessary overhead
        const { params } = await c.data();
        const user = await userRepo.findById(params.id);
        return user;
    });
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

> **Interactive Prompts Support**
>
> The `db generate` command supports Drizzle Kit's interactive prompts. When you make ambiguous schema changes (like renaming a column), Drizzle Kit will ask you to clarify:
>
> ```bash
> $ npx spfn@alpha db generate
>
> Is pattern_id column in workflow_steps table created or renamed from another column?
> ❯ + pattern_id                      create column
>   ~ workflow_id › pattern_id        rename column
>   ~ action › pattern_id             rename column
> ```
>
> This helps Drizzle Kit generate accurate migrations that preserve your data instead of dropping and recreating columns.

## Working with SPFN Modules

When using SPFN modules (like `@spfn/cms`, `@spfn/auth`), database operations are handled differently to prevent conflicts:

### Module Migrations

Modules ship with pre-built migrations in their `migrations/` directory. These are automatically applied:

```bash
# When you run:
spfn db push          # safe mode — prompts for destructive changes
spfn db push --force  # apply all without prompting
spfn db push --dry-run # preview only
# or
spfn db migrate

# Schema changes are classified and applied:
✅ Safe changes (2):
   CREATE TABLE "posts" (...)
   ALTER TABLE "users" ADD COLUMN "bio" varchar(500);
❌ Destructive changes (1):    ← requires --force or confirmation
   ALTER TABLE "users" DROP COLUMN "legacy";

# Then module migrations are applied:
📦 Applying function package migrations:
  - @spfn/cms
  - @spfn/auth
✅ All function migrations applied
```

### Module Schemas

Each module uses an isolated PostgreSQL schema to prevent conflicts:

| Module | Schema Name | Tables |
|--------|-------------|---------|
| @spfn/cms | `spfn_cms` | labels, label_values, audit_logs, etc. |
| @spfn/auth | `spfn_auth` | users, sessions, etc. |
| Your app | `public` | Your custom tables |

You can query across schemas:

```typescript
import { getDatabase } from '@spfn/core/db';
import { eq } from 'drizzle-orm';
import { posts } from '@/server/entities/posts'; // public.posts
import { cmsLabels } from '@spfn/cms/server/entities'; // spfn_cms.labels

const db = getDatabase('read');

// Join across schemas
const postsWithLabels = await db
  .select({
    post: posts,
    label: cmsLabels
  })
  .from(posts)
  .leftJoin(cmsLabels, eq(posts.labelId, cmsLabels.id));
```

### Generating Migrations

`spfn db generate` only processes **your project's entities**, not module entities:

```bash
spfn db generate

# Output:
Reading config...
1 tables         # Only your app's tables
users 4 columns  # Module tables excluded
```

This prevents issues with:
- Mixed `.ts`/`.js` file types between project and packages
- Different TypeScript configurations
- Build order dependencies

Module migrations are already included in the published package, so you never need to regenerate them.

## Branch-Parallel Development

SPFN uses **timestamp-based migration prefixes** by default to avoid conflicts when multiple developers generate migrations on different branches.

### Why Timestamp Prefix?

With sequential prefixes (`0000`, `0001`), two branches that each generate a migration will both create `0001_*.sql`, causing a 3-way merge conflict across the SQL file, the snapshot, and `_journal.json`. Timestamp prefixes (e.g., `1764036749408_*.sql`) are virtually collision-free.

### Migrating Existing Projects

If your project was created before timestamp prefix became the default, convert existing migrations with:

```bash
# Preview what will change
spfn db reindex --dry-run

# Apply conversion
spfn db reindex
```

After reindexing, all future `spfn db generate` calls will use timestamp prefixes automatically.

### Workflow

```bash
# Branch A: add users table
git checkout -b feat/users
# edit schema...
spfn db generate        # → 1764036749408_add_users.sql

# Branch B: add posts table
git checkout -b feat/posts
# edit schema...
spfn db generate        # → 1764036812345_add_posts.sql

# Merge — no conflicts!
git checkout main
git merge feat/users
git merge feat/posts    # Both migrations coexist
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
export const createUserWithProfile = route.post('/users')
    .input({ body: Type.Object({ email: Type.String(), name: Type.String() }) })
    .use([Transactional()])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const user = await create(users, body);
        const profile = await create(profiles, { userId: user.id });
        return c.created({ user, profile });
    });

// ❌ Bad: No transaction - partial data on error
export const badCreate = route.post('/users')
    .input({ body: Type.Object({ email: Type.String(), name: Type.String() }) })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const user = await create(users, body);
        const profile = await create(profiles, { userId: user.id });  // If this fails, user is orphaned!
        return c.created({ user, profile });
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
