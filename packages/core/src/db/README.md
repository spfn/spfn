# Database Module

Type-safe PostgreSQL database layer built on Drizzle ORM with automatic transaction management and read/write separation.

## Features

- 🔄 **Automatic Transaction Management** - AsyncLocalStorage-based transactions with middleware
- 📊 **Read/Write Separation** - Automatic routing to read replicas when available
- 🚀 **Helper Functions** - Type-safe CRUD operations with minimal boilerplate
- 🛠️ **Schema Helpers** - Reusable column definitions (id, timestamps, foreign keys)
- 🔌 **Connection Pooling** - Built-in connection pool with health checks
- ⚡ **Type Safety** - Full TypeScript support with Drizzle ORM

## Quick Start

```typescript
import { initDatabase, findOne, create, Transactional } from '@spfn/core/db';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

// 1. Define schema
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name'),
  ...timestamps()
});

// 2. Initialize database (once at app startup)
await initDatabase();  // Reads DATABASE_URL from env

// 3. Use helper functions directly - no Repository needed!
// Simple object-based queries
const user = await findOne(users, { email: 'test@example.com' });

// Create records
const newUser = await create(users, {
  email: 'new@example.com',
  name: 'New User'
});

// 4. Use in routes with transactions
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  const data = await c.req.json();

  // No Repository class needed - just use helper functions
  const user = await create(users, data);

  // Auto-commits on success, auto-rolls back on error
  return c.json(user, 201);
}
```

## Module Structure

The database module is organized into focused sub-modules:

### Helper Functions

Type-safe CRUD operations with minimal boilerplate - the recommended way to interact with your database.

**Key APIs:**
- `findOne(table, where)` - Find single record
- `findMany(table, options)` - Find multiple records with filtering, ordering, pagination
- `create(table, data)` - Insert single record
- `createMany(table, data[])` - Insert multiple records
- `updateOne(table, where, data)` - Update single record
- `updateMany(table, where, data)` - Update multiple records
- `deleteOne(table, where)` - Delete single record
- `deleteMany(table, where)` - Delete multiple records
- `count(table, where)` - Count records

**Features:**
- Automatic transaction context detection
- Read/write database separation
- Full TypeScript type inference from table schema
- Hybrid where clause support: objects (`{ id: 1 }`) or SQL (`eq(table.id, 1)`)
- No Repository class needed - functions work directly with table schemas

### [Manager](./manager/README.md)

Database connection and lifecycle management.

**Key APIs:**
- `initDatabase()` - Initialize database connection from environment
- `getDatabase()` - Get database instance (with read/write selection)
- `closeDatabase()` - Clean up connections
- `createDatabaseFromEnv()` - Factory function for manual setup

**Topics:**
- Environment variable configuration
- Single database vs Primary + Replica setup
- Connection pooling and health checks
- Automatic reconnection
- Monitoring and diagnostics

[Read Manager Documentation →](./manager/README.md)

### [Transaction](./transaction/README.md)

Automatic transaction management with AsyncLocalStorage propagation.

**Key APIs:**
- `Transactional()` - Middleware for automatic transactions
- `getTransaction()` - Get current transaction context
- `runWithTransaction()` - Manual transaction control

**Features:**
- Auto-commit on success, auto-rollback on error
- Transaction ID tracking for debugging
- Configurable timeouts and slow transaction warnings
- Nested transaction detection
- PostgreSQL error conversion

[Read Transaction Documentation →](./transaction/README.md)

### Schema Helpers

Reusable column definitions for common patterns.

**Available Helpers:**

```typescript
import { id, timestamps, foreignKey, optionalForeignKey } from '@spfn/core/db';

export const users = pgTable('users', {
  id: id(),                    // bigserial primary key
  email: text('email').unique(),
  ...timestamps()              // createdAt + updatedAt
});

export const posts = pgTable('posts', {
  id: id(),
  authorId: foreignKey('author', () => users.id),  // Required FK with cascade
  categoryId: optionalForeignKey('category', () => categories.id),  // Nullable FK
  ...timestamps()
});
```

**Helpers:**
- `id()` - Auto-incrementing bigserial primary key
- `timestamps()` - Adds createdAt and updatedAt timestamp fields
- `foreignKey(name, ref)` - Required foreign key with cascade delete
- `optionalForeignKey(name, ref)` - Nullable foreign key

## Environment Variables

### Single Database

```bash
DATABASE_URL=postgresql://localhost:5432/mydb
```

### Primary + Replica (Read/Write Separation)

```bash
# Write operations
DATABASE_WRITE_URL=postgresql://primary:5432/mydb

# Read operations (automatically used for SELECT queries)
DATABASE_READ_URL=postgresql://replica:5432/mydb
```

### Legacy Replica Pattern

```bash
DATABASE_URL=postgresql://primary:5432/mydb
DATABASE_REPLICA_URL=postgresql://replica:5432/mydb
```

See [Manager Documentation](./manager/README.md#environment-variables) for complete configuration options.

## Common Patterns

### Basic CRUD with Helper Functions

```typescript
import { findOne, findMany, create, updateOne, deleteOne, count } from '@spfn/core/db';
import { desc, gt } from 'drizzle-orm';

// Find single record (object-based where)
const user = await findOne(users, { id: 1 });
const userByEmail = await findOne(users, { email: 'test@example.com' });

// Find single record (SQL-based where for complex queries)
const adult = await findOne(users, gt(users.age, 18));

// Find multiple records with options
const allUsers = await findMany(users, {
  orderBy: desc(users.createdAt)
});

const activeUsers = await findMany(users, {
  where: { active: true },
  orderBy: desc(users.createdAt),
  limit: 10,
  offset: 0
});

// Create record
const newUser = await create(users, {
  email: 'new@example.com',
  name: 'New User'
});

// Update record
const updated = await updateOne(users, { id: 1 }, {
  name: 'Updated Name'
});

// Delete record
const deleted = await deleteOne(users, { id: 1 });

// Count records
const total = await count(users);
const activeCount = await count(users, { active: true });
```

### Transactions

```typescript
import { Transactional } from '@spfn/core/db';
import { create } from '@spfn/core/db';

// Apply middleware to route
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  // Both operations run in same transaction
  const user = await create(users, { email: 'test@example.com' });
  const profile = await create(profiles, { userId: user.id });

  // Success → Commit
  // Error → Rollback
  return c.json({ user, profile });
}
```

### Direct Database Access

For complex queries not suitable for repositories:

```typescript
import { getDatabase } from '@spfn/core/db';
import { eq } from 'drizzle-orm';

export async function GET(c: RouteContext) {
  const db = getDatabase('read'); // Use read replica

  // Complex join query
  const results = await db
    .select({
      post: posts,
      author: users,
      commentCount: sql<number>`count(${comments.id})`
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .leftJoin(comments, eq(comments.postId, posts.id))
    .groupBy(posts.id, users.id);

  return c.json(results);
}
```

### Read/Write Separation

```typescript
import { findMany, create } from '@spfn/core/db';

// Helper functions handle read/write separation automatically
await findMany(users);  // Automatically uses read replica
await create(users, { email: 'test@example.com' });  // Uses primary database

// For custom queries, you can manually specify
const db = getDatabase('read');
const result = await db.select().from(users);

const writeDb = getDatabase('write');
await writeDb.insert(users).values({ email: 'test@example.com' });
```

## Schema Definition

### Basic Schema

```typescript
import { pgTable, text, integer } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name'),
  age: integer('age'),
  ...timestamps()
});

// Type inference
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### Relationships

```typescript
import { foreignKey, optionalForeignKey } from '@spfn/core/db';

export const posts = pgTable('posts', {
  id: id(),
  title: text('title').notNull(),
  content: text('content'),

  // Required relationship - cascade delete
  authorId: foreignKey('author', () => users.id),

  // Optional relationship
  categoryId: optionalForeignKey('category', () => categories.id),

  ...timestamps()
});
```

## Database Migrations

Configure Drizzle Kit for migrations:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/entities/index.ts',  // Export all tables here
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**Generate and apply migrations:**

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations to database
npx drizzle-kit migrate
```

See [Drizzle Kit Documentation](https://orm.drizzle.team/kit-docs/overview) for advanced migration workflows.

## Best Practices

### ✅ Do

```typescript
// 1. Initialize once at startup
await initDatabase();

// 2. Use transactions for write operations
export const middlewares = [Transactional()];

// 3. Use helper functions for common operations
import { findMany, create } from '@spfn/core/db';

const activeUsers = await findMany(users, {
  where: { active: true }
});  // Automatically uses read replica

// 4. Use object-based where for simple queries
const user = await findOne(users, { id: 1 });

// 5. Use SQL-based where for complex queries
const adult = await findOne(users, and(gt(users.age, 18), eq(users.verified, true)));

// 6. Use schema helpers for consistency
export const users = pgTable('users', {
  id: id(),
  ...timestamps()
});

// 7. Let TypeScript infer types
export type User = typeof users.$inferSelect;
```

### ❌ Don't

```typescript
// 1. Don't create multiple database instances
const db1 = drizzle(connection1);  // ❌ Bad
const db2 = drizzle(connection2);  // ❌ Bad

// Use getDatabase() or helper functions instead
const db = getDatabase('write');   // ✅ Good
await create(users, data);          // ✅ Better

// 2. Don't bypass transaction middleware
export async function POST(c: RouteContext) {
  // Missing Transactional() - no automatic rollback
}

// 3. Don't use write db for reads
const db = getDatabase('write');
await db.select().from(users);  // ❌ Wastes primary db connection

// Use helper functions instead
await findMany(users);  // ✅ Automatically uses read replica

// 4. Don't forget to close in tests
afterAll(async () => {
  await closeDatabase();  // ✅ Cleanup
});
```

## Troubleshooting

### Database not initialized

**Error:** `Database not initialized. Call initDatabase() first.`

**Solution:**
```typescript
// Add to app startup
import { initDatabase } from '@spfn/core/db';
await initDatabase();
```

### DATABASE_URL not found

**Error:** `No database configuration found`

**Solution:**
```bash
# .env
DATABASE_URL=postgresql://localhost:5432/mydb
```

### Transaction not rolling back

**Cause:** Error caught and not re-thrown

**Solution:**
```typescript
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  try {
    await create(users, data);
  } catch (error) {
    // Log but re-throw to trigger rollback
    console.error(error);
    throw error;  // ✅ Must re-throw
  }
}
```

## API Reference

### Core Functions

| Function | Module | Description |
|----------|--------|-------------|
| `initDatabase()` | manager | Initialize database from environment |
| `getDatabase()` | manager | Get database instance |
| `closeDatabase()` | manager | Close all connections |
| `Transactional()` | transaction | Transaction middleware |

### Helper Functions

| Function | Description |
|----------|-------------|
| `findOne(table, where)` | Find single record by object or SQL where |
| `findMany(table, options)` | Find multiple records with filtering/ordering/pagination |
| `create(table, data)` | Create single record |
| `createMany(table, data[])` | Create multiple records |
| `updateOne(table, where, data)` | Update single record |
| `updateMany(table, where, data)` | Update multiple records |
| `deleteOne(table, where)` | Delete single record |
| `deleteMany(table, where)` | Delete multiple records |
| `count(table, where?)` | Count records |

### Schema Helpers

| Helper | Return Type | Description |
|--------|-------------|-------------|
| `id()` | `bigserial` | Auto-incrementing primary key |
| `timestamps()` | `{ createdAt, updatedAt }` | Timestamp columns |
| `foreignKey()` | `bigint` | Required foreign key |
| `optionalForeignKey()` | `bigint \| null` | Nullable foreign key |

## Further Reading

- [Manager Documentation](./manager/README.md) - Connection management and configuration
- [Transaction Documentation](./transaction/README.md) - Transaction patterns and best practices
- [Drizzle ORM Documentation](https://orm.drizzle.team/) - Complete ORM reference
- [PostgreSQL Documentation](https://www.postgresql.org/docs/) - Database reference