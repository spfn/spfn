# Database Module

Type-safe PostgreSQL database layer built on Drizzle ORM with automatic transaction management and read/write separation.

## Features

- 🏛️ **Repository Pattern** - Base repository class with protected helper methods for clean architecture
- 🔄 **Automatic Transaction Management** - AsyncLocalStorage-based transactions with middleware
- 📊 **Read/Write Separation** - Automatic routing to read replicas when available
- 🚀 **Type-Safe CRUD Operations** - Protected helper methods with minimal boilerplate
- 🛠️ **Schema Helpers** - Reusable column definitions (id, timestamps, foreign keys)
- 🔌 **Connection Pooling** - Built-in connection pool with health checks
- ⚡ **Type Safety** - Full TypeScript support with Drizzle ORM

## Quick Start

```typescript
import { initDatabase, BaseRepository, Transactional } from '@spfn/core/db';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';
import { desc } from 'drizzle-orm';

// 1. Define schema
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name'),
  ...timestamps()
});

// 2. Create domain-specific repository
export class UserRepository extends BaseRepository
{
    async findByEmail(email: string)
    {
        // Use protected helper methods
        return await this.findOne(users, { email });
    }

    async findActive(limit = 10)
    {
        return await this.findMany(users, {
            where: { active: true },
            orderBy: desc(users.createdAt),
            limit
        });
    }

    async createUser(data: { email: string; name: string })
    {
        return await this.create(users, data);
    }

    async updateUser(id: number, data: Partial<{ name: string }>)
    {
        return await this.updateOne(users, { id }, data);
    }
}

// 3. Initialize database (once at app startup)
await initDatabase();  // Reads DATABASE_URL from env

// 4. Use repository in routes with transactions
const userRepo = new UserRepository();

export const middlewares = [Transactional()];

export async function POST(c: RouteContext)
{
    const data = await c.req.json();

    // Repository automatically uses transaction context
    const user = await userRepo.createUser(data);

    // Auto-commits on success, auto-rolls back on error
    return c.json(user, 201);
}
```

## Module Structure

The database module is organized into focused sub-modules:

### Repository Pattern

The recommended way to interact with your database using domain-specific repositories that extend `BaseRepository`.

**Base Repository:**
- `BaseRepository<TSchema>` - Abstract class providing database access and CRUD operations
- `db` getter - Write database instance (automatic transaction-aware)
- `readDb` getter - Read database instance (uses replicas when available)
- `withContext()` - Error tracking with repository context

**Protected Helper Methods:**
- `findOne(table, where)` - Find single record
- `findMany(table, options)` - Find multiple records with filtering, ordering, pagination
- `create(table, data)` - Insert single record
- `createMany(table, data[])` - Insert multiple records
- `upsert(table, data, options)` - Insert or update on conflict
- `updateOne(table, where, data)` - Update single record
- `updateMany(table, where, data)` - Update multiple records
- `deleteOne(table, where)` - Delete single record
- `deleteMany(table, where)` - Delete multiple records
- `count(table, where)` - Count records

**Benefits:**
- Clean architecture with domain-specific repositories
- Encapsulated database operations
- Automatic transaction context detection
- Read/write database separation
- Full TypeScript type inference
- Hybrid where clause support: objects (`{ id: 1 }`) or SQL (`eq(table.id, 1)`)
- Enhanced error tracking with repository context

**Example:**
```typescript
import { BaseRepository } from '@spfn/core/db';
import { users } from './schema';

export class UserRepository extends BaseRepository
{
    async findByEmail(email: string)
    {
        return await this.findOne(users, { email });
    }

    async findActive()
    {
        return await this.findMany(users, {
            where: { active: true }
        });
    }

    async createUser(data: { email: string; name: string })
    {
        return await this.create(users, data);
    }
}

// Usage
const userRepo = new UserRepository();
const user = await userRepo.findByEmail('test@example.com');
```

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

### [Schema](./schema/README.md)

Reusable column definitions for common patterns.

**Available Helpers:**

```typescript
import { pgTable, text, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey, optionalForeignKey } from '@spfn/core/db';

// Basic table with SPFN helpers
export const users = pgTable('users', {
  id: id(),                    // bigserial primary key
  email: text('email').notNull(),
  name: text('name'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps()              // createdAt + updatedAt
}, (table) => [
  // Modern Drizzle constraint syntax (array-based)
  uniqueIndex('users_email_idx').on(table.email),
  index('users_active_idx').on(table.isActive)
]);

// Table with foreign keys and constraints
export const posts = pgTable('posts', {
  id: id(),
  title: text('title').notNull(),
  content: text('content'),
  published: boolean('published').notNull().default(false),
  viewCount: integer('view_count').notNull().default(0),

  // Foreign keys using SPFN helpers
  authorId: foreignKey('author', () => users.id),  // Required FK with cascade
  categoryId: optionalForeignKey('category', () => categories.id),  // Nullable FK

  ...timestamps()
}, (table) => [
  // Indexes for performance
  index('posts_author_idx').on(table.authorId),
  index('posts_category_idx').on(table.categoryId),
  index('posts_published_idx').on(table.published),

  // Composite index for common queries
  index('posts_author_published_idx').on(table.authorId, table.published)
]);

// Table with unique constraints
export const categories = pgTable('categories', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  ...timestamps()
}, (table) => [
  uniqueIndex('categories_slug_idx').on(table.slug),
  index('categories_name_idx').on(table.name)
]);

// Many-to-many join table
export const postTags = pgTable('post_tags', {
  postId: foreignKey('post', () => posts.id),
  tagId: foreignKey('tag', () => tags.id),
  ...timestamps()
}, (table) => [
  // Composite primary key
  uniqueIndex('post_tags_pkey').on(table.postId, table.tagId)
]);
```

**Helpers:**
- `id()` - Auto-incrementing bigserial primary key
- `timestamps()` - Adds createdAt and updatedAt timestamp fields
- `foreignKey(name, ref)` - Required foreign key with cascade delete
- `optionalForeignKey(name, ref)` - Nullable foreign key

**Constraint Syntax (Modern Drizzle):**
- Use the second argument (callback) to define indexes and constraints
- Return an array of constraints: `(table) => [index(...), uniqueIndex(...)]`
- `index(name).on(column1, column2, ...)` - Performance index
- `uniqueIndex(name).on(column)` - Unique constraint with index
- Composite indexes: `.on(column1, column2)` for multi-column queries

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

### Repository Pattern CRUD

```typescript
import { BaseRepository } from '@spfn/core/db';
import { users, posts } from './schema';
import { desc, gt, and, eq } from 'drizzle-orm';

// Define domain-specific repositories
export class UserRepository extends BaseRepository
{
    // Find single record (object-based where)
    async findById(id: number)
    {
        return await this.findOne(users, { id });
    }

    async findByEmail(email: string)
    {
        return await this.findOne(users, { email });
    }

    // Find single record (SQL-based where for complex queries)
    async findAdult()
    {
        return await this.findOne(users, gt(users.age, 18));
    }

    // Find multiple records with options
    async findAll()
    {
        return await this.findMany(users, {
            orderBy: desc(users.createdAt)
        });
    }

    async findActive(limit = 10, offset = 0)
    {
        return await this.findMany(users, {
            where: { active: true },
            orderBy: desc(users.createdAt),
            limit,
            offset
        });
    }

    // Create record
    async createUser(data: { email: string; name: string })
    {
        return await this.create(users, data);
    }

    // Update record
    async updateUser(id: number, data: Partial<{ name: string }>)
    {
        return await this.updateOne(users, { id }, data);
    }

    // Delete record
    async deleteUser(id: number)
    {
        return await this.deleteOne(users, { id });
    }

    // Count records
    async countAll()
    {
        return await this.count(users);
    }

    async countActive()
    {
        return await this.count(users, { active: true });
    }
}

export class PostRepository extends BaseRepository
{
    async findByAuthor(authorId: number)
    {
        return await this.findMany(posts, {
            where: { authorId },
            orderBy: desc(posts.createdAt)
        });
    }

    async createPost(data: { title: string; content: string; authorId: number })
    {
        return await this.create(posts, data);
    }
}

// Usage
const userRepo = new UserRepository();
const user = await userRepo.findByEmail('test@example.com');
const activeUsers = await userRepo.findActive(10);
```

### Repository with Transactions

```typescript
import { BaseRepository, Transactional } from '@spfn/core/db';
import { users, profiles } from './schema';

export class UserRepository extends BaseRepository
{
    async createUser(data: { email: string; name: string })
    {
        return await this.create(users, data);
    }
}

export class ProfileRepository extends BaseRepository
{
    async createProfile(data: { userId: number; bio: string })
    {
        return await this.create(profiles, data);
    }
}

// Apply middleware to route
export const middlewares = [Transactional()];

export async function POST(c: RouteContext)
{
    const userRepo = new UserRepository();
    const profileRepo = new ProfileRepository();

    // Both operations run in same transaction automatically
    const user = await userRepo.createUser({
        email: 'test@example.com',
        name: 'Test User'
    });

    const profile = await profileRepo.createProfile({
        userId: user.id,
        bio: 'Test bio'
    });

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

// 3. Use domain-specific repositories
import { BaseRepository } from '@spfn/core/db';
import { users } from './schema';

export class UserRepository extends BaseRepository
{
    async findActive()
    {
        return await this.findMany(users, {
            where: { active: true }
        });  // Automatically uses read replica
    }
}

// 4. Use object-based where for simple queries
async findByEmail(email: string)
{
    return await this.findOne(users, { email });
}

// 5. Use SQL-based where for complex queries
import { and, gt, eq } from 'drizzle-orm';

async findVerifiedAdults()
{
    return await this.findOne(
        users,
        and(gt(users.age, 18), eq(users.verified, true))
    );
}

// 6. Use schema helpers for consistency
export const users = pgTable('users', {
  id: id(),
  ...timestamps()
});

// 7. Let TypeScript infer types
export type User = typeof users.$inferSelect;

// 8. Create repository instances once and reuse
const userRepo = new UserRepository();
const user = await userRepo.findByEmail('test@example.com');
```

### ❌ Don't

```typescript
// 1. Don't create multiple database instances
const db1 = drizzle(connection1);  // ❌ Bad
const db2 = drizzle(connection2);  // ❌ Bad

// Use repositories instead
export class UserRepository extends BaseRepository {  // ✅ Good
    // Uses this.db and this.readDb internally
}

// 2. Don't bypass transaction middleware
export async function POST(c: RouteContext) {
  // Missing Transactional() - no automatic rollback
}

// 3. Don't use write db for reads in repositories
async findUsers()
{
    // ❌ Bad - forces write db
    return await this.db.select().from(users);
}

async findUsers()
{
    // ✅ Good - uses read replica
    return await this.readDb.select().from(users);
    // Or better: use protected helper
    return await this.findMany(users);
}

// 4. Don't access protected methods outside repositories
const repo = new UserRepository();
repo.findOne(users, { id: 1 });  // ❌ TypeScript error - protected method

// Create proper public methods instead
export class UserRepository extends BaseRepository {
    async findById(id: number) {  // ✅ Public method
        return await this.findOne(users, { id });
    }
}

// 5. Don't forget to close in tests
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

### Base Repository

| Class/Method | Type | Description |
|--------------|------|-------------|
| `BaseRepository<TSchema>` | abstract class | Base repository class for database operations |
| `db` | getter (protected) | Write database instance (transaction-aware) |
| `readDb` | getter (protected) | Read database instance (uses replicas when available) |
| `withContext(fn, ctx)` | method (protected) | Wrap query with repository error tracking context |

### Protected Helper Methods

Available inside repositories extending `BaseRepository`:

| Method | Description |
|--------|-------------|
| `findOne(table, where)` | Find single record by object or SQL where |
| `findMany(table, options)` | Find multiple records with filtering/ordering/pagination |
| `create(table, data)` | Create single record |
| `createMany(table, data[])` | Create multiple records |
| `upsert(table, data, options)` | Insert or update on conflict |
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

[Read Schema Documentation →](./schema/README.md)

## Testing

The database module has comprehensive test coverage across all sub-modules:

### Test Coverage Summary

```
Module            Coverage    Tests   Files
─────────────────────────────────────────────
manager/          ~100%       116     5 test files
transaction/      100%*       35      3 test files
schema/           100%        23      1 test file
helpers.ts        84.26%      29      Unit tests
postgres-errors.ts 100%       48      Unit tests
schema-helper.ts  100%        22      Unit tests
─────────────────────────────────────────────
Total                         273     12 test files
```

*transaction/middleware.ts has 100% coverage with unit tests; context.ts is tested via integration tests only (AsyncLocalStorage requires real environment)

### Running Tests

```bash
# Run all database tests
pnpm vitest run src/db

# Run with coverage
pnpm vitest run src/db --coverage

# Run specific module tests
pnpm vitest run src/db/manager/__tests__
pnpm vitest run src/db/transaction/__tests__
pnpm vitest run src/db/schema/__tests__

# Run integration tests (requires Docker PostgreSQL)
pnpm docker:test:up
pnpm vitest run src/db/**/*.integration.test.ts
```

### Test Structure

```
db/
├── __tests__/                           # Root-level tests
│   ├── helpers.test.ts                  # 29 tests - CRUD helpers
│   ├── postgres-errors.test.ts          # 48 tests - Error conversion
│   └── schema-helper.test.ts            # 22 tests - Schema utilities
├── manager/__tests__/                   # Manager module tests
│   ├── config.test.ts                   # 33 tests - Configuration
│   ├── connection.test.ts               # 9 tests - Connection logic
│   ├── factory.test.ts                  # 23 tests - Pattern detection
│   ├── manager.test.ts                  # 38 tests - Core API
│   └── health-check.test.ts             # 13 tests - Health monitoring
├── transaction/__tests__/               # Transaction module tests
│   ├── middleware.test.ts               # 14 tests - Unit tests
│   ├── middleware.integration.test.ts   # 11 tests - Real PostgreSQL
│   └── context.integration.test.ts      # 10 tests - AsyncLocalStorage
└── schema/__tests__/                    # Schema module tests
    └── helpers.test.ts                  # 23 tests - Schema helpers
```

### What's Tested

**Manager Module:**
- ✅ Configuration builders with priority resolution
- ✅ Connection retry with exponential backoff
- ✅ Database pattern detection (write-read, legacy, single)
- ✅ Manager initialization and lifecycle
- ✅ Health check intervals and reconnection
- ✅ Pool configuration and environment variables

**Transaction Module:**
- ✅ Basic transaction lifecycle (start, commit, rollback)
- ✅ Error handling and PostgreSQL error conversion
- ✅ Slow transaction warnings and timeout enforcement
- ✅ Logging enable/disable
- ✅ Context error detection
- ✅ AsyncLocalStorage context propagation
- ✅ Nested transaction tracking
- ✅ Concurrent transaction isolation

**Schema Module:**
- ✅ `id()` - bigserial primary key creation
- ✅ `timestamps()` - createdAt/updatedAt fields
- ✅ `autoUpdateTimestamp()` - custom timestamp fields
- ✅ `foreignKey()` - required foreign key with cascade options
- ✅ `optionalForeignKey()` - optional foreign key with set null default
- ✅ Integration tests with complete table schemas

**Helper Functions:**
- ✅ CRUD operations (find, create, update, delete, count)
- ✅ Object-based and SQL-based where clauses
- ✅ Read/write database separation
- ✅ Transaction context detection
- ✅ Error handling

**PostgreSQL Errors:**
- ✅ Connection exceptions (Class 08)
- ✅ Integrity constraint violations (Class 23)
- ✅ Transaction rollback errors (Class 40)
- ✅ Syntax errors (Class 42)
- ✅ Unique violation parsing
- ✅ Error conversion to custom types

## Further Reading

- [Manager Documentation](./manager/README.md) - Connection management and configuration
- [Transaction Documentation](./transaction/README.md) - Transaction patterns and best practices
- [Schema Documentation](./schema/README.md) - Reusable column definitions
- [Drizzle ORM Documentation](https://orm.drizzle.team/) - Complete ORM reference
- [PostgreSQL Documentation](https://www.postgresql.org/docs/) - Database reference