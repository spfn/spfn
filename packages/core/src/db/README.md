# Database Module

Type-safe PostgreSQL database layer built on Drizzle ORM with automatic transaction management and read/write separation.

## Features

- 🔄 **Automatic Transaction Management** - AsyncLocalStorage-based transactions with middleware
- 📊 **Read/Write Separation** - Automatic routing to read replicas when available
- 🏗️ **Repository Pattern** - Base class for structured database access
- 🛠️ **Schema Helpers** - Reusable column definitions (id, timestamps, foreign keys)
- 🔌 **Connection Pooling** - Built-in connection pool with health checks
- ⚡ **Type Safety** - Full TypeScript support with Drizzle ORM

## Quick Start

```typescript
import { initDatabase, getDatabase, Transactional } from '@spfn/core/db';
import { Repository } from '@spfn/core/db/repository';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';
import { eq } from 'drizzle-orm';

// 1. Define schema
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name'),
  ...timestamps()
});

// 2. Initialize database (once at app startup)
await initDatabase();  // Reads DATABASE_URL from env

// 3. Create a repository
class UserRepository extends Repository<typeof users> {
  async findByEmail(email: string) {
    return this.select()
      .where(eq(this.table.email, email))
      .limit(1);
  }

  async create(data: typeof users.$inferInsert) {
    return this.insert()
      .values(data)
      .returning();
  }
}

// 4. Use in routes with transactions
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  const userRepo = new UserRepository(users);

  const data = await c.req.json();
  const [user] = await userRepo.create(data);

  // Auto-commits on success, auto-rolls back on error
  return c.json(user, 201);
}
```

## Module Structure

The database module is organized into focused sub-modules:

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

### [Repository](./repository/README.md)

Base repository pattern for structured database access.

**Key APIs:**
- `Repository<T>` - Base class with query builders
- `select()` - Read operations (uses read replica if available)
- `insert()` - Create operations
- `update()` - Update operations
- `delete()` - Delete operations

**Features:**
- Automatic transaction context detection
- Read/write database separation
- Type-safe query builders
- Custom repository methods via inheritance

[Read Repository Documentation →](./repository/README.md)

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

### Basic CRUD with Repository

```typescript
import { Repository } from '@spfn/core/db/repository';
import { eq } from 'drizzle-orm';

class UserRepository extends Repository<typeof users> {
  async findById(id: number) {
    return this.select()
      .where(eq(this.table.id, id))
      .limit(1);
  }

  async findAll() {
    return this.select()
      .orderBy(this.table.createdAt);
  }

  async create(data: typeof users.$inferInsert) {
    return this.insert()
      .values(data)
      .returning();
  }

  async update(id: number, data: Partial<typeof users.$inferInsert>) {
    return this.update()
      .set(data)
      .where(eq(this.table.id, id))
      .returning();
  }

  async deleteById(id: number) {
    return this.delete()
      .where(eq(this.table.id, id));
  }
}
```

### Transactions

```typescript
import { Transactional } from '@spfn/core/db/transaction';

// Apply middleware to route
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  const userRepo = new UserRepository(users);
  const profileRepo = new ProfileRepository(profiles);

  // Both operations run in same transaction
  const [user] = await userRepo.create({ email: 'test@example.com' });
  const [profile] = await profileRepo.create({ userId: user.id });

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
// Read operations automatically use read replica
const db = getDatabase('read');
const users = await db.select().from(users);

// Write operations use primary database
const db = getDatabase('write');
await db.insert(users).values({ email: 'test@example.com' });

// Repositories handle this automatically
const userRepo = new UserRepository(users);
await userRepo.findAll();  // Uses read replica
await userRepo.create({}); // Uses primary database
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

// 3. Leverage read replicas via Repository
class UserRepository extends Repository<typeof users> {
  async findActive() {
    return this.select()  // Automatically uses read replica
      .where(eq(this.table.active, true));
  }
}

// 4. Use schema helpers for consistency
export const users = pgTable('users', {
  id: id(),
  ...timestamps()
});

// 5. Let TypeScript infer types
export type User = typeof users.$inferSelect;
```

### ❌ Don't

```typescript
// 1. Don't create multiple database instances
const db1 = drizzle(connection1);  // ❌ Bad
const db2 = drizzle(connection2);  // ❌ Bad

// Use getDatabase() instead
const db = getDatabase('write');   // ✅ Good

// 2. Don't bypass transaction middleware
export async function POST(c: RouteContext) {
  // Missing Transactional() - no automatic rollback
}

// 3. Don't use write db for reads
const db = getDatabase('write');
await db.select().from(users);  // ❌ Wastes primary db connection

// Use read db or Repository
const userRepo = new UserRepository(users);
await userRepo.findAll();  // ✅ Uses read replica

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
    await userRepo.create(data);
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
| `Repository<T>` | repository | Base repository class |

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
- [Repository Documentation](./repository/README.md) - Repository pattern guide
- [Drizzle ORM Documentation](https://orm.drizzle.team/) - Complete ORM reference
- [PostgreSQL Documentation](https://www.postgresql.org/docs/) - Database reference