# Entities

Define your Drizzle ORM entities here. These are your database table schemas.

Use `spfn generate <entity-name>` to scaffold a new entity with CRUD routes.

## Entity Helper Functions

SPFN provides helper functions to reduce boilerplate when defining entities:

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core';

// Simple entity with helpers
export const users = pgTable('users', {
    id: id(),                    // bigserial primary key
    email: text('email').unique(),
    ...timestamps(),             // createdAt + updatedAt
});

// Entity with foreign key
export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),  // Cascade delete
    ...timestamps(),
});

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
```

**Available helpers:**
- `id()` - Auto-incrementing bigserial primary key
- `timestamps()` - Adds `createdAt` and `updatedAt` fields
- `foreignKey(name, ref)` - Foreign key with cascade delete
- `optionalForeignKey(name, ref)` - Nullable foreign key

## Pattern 1: Helper Functions (Recommended)

Use helper functions directly for most database operations:

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { findMany, findOne, create, updateOne, deleteOne } from '@spfn/core/db';
import { users } from '../../entities/users.js';
import { getUsersContract } from './contract.js';

const app = createApp();

// GET /users - Find all users
app.bind(getUsersContract, async (c) =>
{
    const allUsers = await findMany(users);
    return c.json(allUsers);
});

export default app;
```

### CRUD Examples with Helper Functions

**1. Define entity schema:**

```typescript
// src/server/entities/users.ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    ...timestamps(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

**2. Use helper functions in routes:**

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { findOne, findMany, create, updateOne, deleteOne } from '@spfn/core/db';
import { eq } from 'drizzle-orm';
import { users, type User, type NewUser } from '../../entities/users.js';

const app = createApp();

// GET /users - Find all users
app.bind(getUsersContract, async (c) =>
{
    const allUsers = await findMany(users, {
        orderBy: desc(users.createdAt),
        limit: 100
    });
    return c.json(allUsers);
});

// GET /users/:id - Find user by id
app.bind(getUserContract, async (c) =>
{
    const { id } = c.req.param();
    const user = await findOne(users, { id: parseInt(id) });

    if (!user) {
        return c.json({ error: 'User not found' }, 404);
    }

    return c.json(user);
});

// POST /users - Create user with transaction
app.bind(createUserContract, [Transactional()], async (c) =>
{
    const data = await c.data();

    // Check if email exists
    const existing = await findOne(users, { email: data.email });
    if (existing) {
        return c.json({ error: 'Email already exists' }, 409);
    }

    const user = await create(users, data);
    return c.json(user, 201);
});

// PATCH /users/:id - Update user
app.bind(updateUserContract, [Transactional()], async (c) =>
{
    const { id } = c.req.param();
    const data = await c.data();

    const updated = await updateOne(users, { id: parseInt(id) }, data);
    if (!updated) {
        return c.json({ error: 'User not found' }, 404);
    }

    return c.json(updated);
});

// DELETE /users/:id - Delete user
app.bind(deleteUserContract, [Transactional()], async (c) =>
{
    const { id } = c.req.param();

    const deleted = await deleteOne(users, { id: parseInt(id) });
    if (!deleted) {
        return c.json({ error: 'User not found' }, 404);
    }

    return c.json({ success: true });
});

export default app;
```

## Pattern 2: Complex Queries with Direct Database Access

For complex queries, use direct Drizzle ORM access:

```typescript
import { getDatabase } from '@spfn/core/db';
import { eq, and, like } from 'drizzle-orm';
import { users, posts } from '../../entities';

// Complex join query
const db = getDatabase('read');
const results = await db
    .select({
        user: users,
        postCount: sql<number>`count(${posts.id})`
    })
    .from(users)
    .leftJoin(posts, eq(posts.authorId, users.id))
    .where(and(
        like(users.email, '%@example.com'),
        gt(users.createdAt, new Date('2024-01-01'))
    ))
    .groupBy(users.id);
```

## Available Helper Functions

| Function | Description | Example |
|----------|-------------|---------|
| `findOne(table, where)` | Find single record | `findOne(users, { id: 1 })` |
| `findMany(table, options)` | Find multiple records | `findMany(users, { limit: 10 })` |
| `create(table, data)` | Create record | `create(users, { email: 'test@example.com' })` |
| `createMany(table, data[])` | Create multiple records | `createMany(users, [{ email: 'a@example.com' }, ...])` |
| `updateOne(table, where, data)` | Update single record | `updateOne(users, { id: 1 }, { name: 'New Name' })` |
| `updateMany(table, where, data)` | Update multiple records | `updateMany(users, { active: false }, { verified: false })` |
| `deleteOne(table, where)` | Delete single record | `deleteOne(users, { id: 1 })` |
| `deleteMany(table, where)` | Delete multiple records | `deleteMany(users, { active: false })` |
| `count(table, where?)` | Count records | `count(users, { active: true })` |

## @spfn/core Features

- **Zero-Config**: Framework auto-loads routes from `routes/` directory
- **File-based Routing**: Next.js App Router style (GET.ts, POST.ts, [id].ts, etc.)
- **Helper Functions**: Type-safe CRUD operations with minimal boilerplate
- **Automatic Transactions**: `Transactional()` middleware with AsyncLocalStorage
- **Read/Write Separation**: Automatic routing to read replicas when available

## Database Migration

```bash
# Generate migration from your entities
npx drizzle-kit generate

# Run migrations
npx drizzle-kit migrate
```

## Learn More

- [Getting Started](https://spfn.dev/docs/getting-started)
- [Routing Guide](https://spfn.dev/docs/routing)
- [Database Helpers](https://spfn.dev/docs/database)
- [Transaction Management](https://spfn.dev/docs/transactions)