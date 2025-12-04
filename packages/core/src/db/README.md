# @spfn/core/db - Database Module

Type-safe PostgreSQL database layer built on Drizzle ORM with automatic transaction management and read/write separation.

## Core Components

```
db/
├── index.ts                    # Module exports
├── repository.ts               # BaseRepository class
├── helpers.ts                  # Standalone helper functions
├── postgres-errors.ts          # PostgreSQL error conversion
├── drizzle.config.ts           # Drizzle config template
├── manager/                    # Database connection management
│   ├── index.ts
│   ├── manager.ts              # Singleton manager
│   ├── factory.ts              # Pattern detection factory
│   ├── connection.ts           # Connection utilities
│   ├── config.ts               # Configuration types
│   ├── config-generator.ts     # Drizzle config generator
│   ├── health-check.ts         # Health monitoring
│   ├── global-state.ts         # Global state management
│   ├── types.ts                # Type definitions
│   └── __tests__/
├── transaction/                # Transaction management
│   ├── index.ts
│   ├── context.ts              # AsyncLocalStorage context
│   ├── middleware.ts           # Transactional middleware
│   ├── runner.ts               # Transaction runner
│   └── __tests__/
├── schema/                     # Schema helpers
│   ├── index.ts
│   ├── entity-helper.ts        # Column helpers (id, timestamps, etc.)
│   ├── schema-helper.ts        # PostgreSQL schema utilities
│   └── __tests__/
└── __tests__/
    ├── helpers.test.ts
    ├── postgres-errors.test.ts
    └── repository-error.test.ts
```

## Features

- **Repository Pattern**: BaseRepository class with protected helper methods
- **Automatic Transaction Management**: AsyncLocalStorage-based transactions with middleware
- **Read/Write Separation**: Automatic routing to read replicas when available
- **Type-Safe CRUD Operations**: Full TypeScript inference from table schema
- **Schema Helpers**: Reusable column definitions (id, timestamps, foreign keys, etc.)
- **PostgreSQL Schema Isolation**: Package-based schema namespacing
- **Connection Pooling**: Built-in connection pool with health checks
- **Drizzle Config Generator**: Auto-generate drizzle.config.ts

---

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

// 2. Create repository
export class UserRepository extends BaseRepository
{
    async findByEmail(email: string)
    {
        return await this._findOne(users, { email });
    }

    async findActive(limit = 10)
    {
        return await this._findMany(users, {
            where: { active: true },
            orderBy: desc(users.createdAt),
            limit
        });
    }

    async createUser(data: { email: string; name: string })
    {
        return await this._create(users, data);
    }
}

// 3. Initialize database
await initDatabase();

// 4. Use with transactions
const userRepo = new UserRepository();

export const middlewares = [Transactional()];

export async function POST(c: RouteContext)
{
    const data = await c.req.json();
    const user = await userRepo.createUser(data);
    return c.json(user, 201);
}
```

---

## Repository Pattern

### BaseRepository

Abstract class providing database access with automatic transaction detection.

```typescript
import { BaseRepository } from '@spfn/core/db';

export class UserRepository extends BaseRepository
{
    // Protected getters
    // this.db     - Write database (transaction-aware)
    // this.readDb - Read database (uses replica when available)

    async findById(id: number)
    {
        return await this._findOne(users, { id });
    }
}
```

### Protected Helper Methods

| Method | Description |
|--------|-------------|
| `_findOne(table, where)` | Find single record |
| `_findMany(table, options)` | Find multiple records with filtering/ordering/pagination |
| `_create(table, data)` | Create single record |
| `_createMany(table, data[])` | Create multiple records |
| `_upsert(table, data, options)` | Insert or update on conflict |
| `_updateOne(table, where, data)` | Update single record |
| `_updateMany(table, where, data)` | Update multiple records |
| `_deleteOne(table, where)` | Delete single record |
| `_deleteMany(table, where)` | Delete multiple records |
| `_count(table, where?)` | Count records |

### Where Clause Support

```typescript
// Object-based (simple equality)
await this._findOne(users, { id: 1 });
await this._findOne(users, { email: 'test@example.com', active: true });

// SQL-based (complex queries)
import { eq, and, gt, like } from 'drizzle-orm';
await this._findOne(users, and(eq(users.id, 1), gt(users.age, 18)));
```

### Error Tracking with Context

```typescript
import { BaseRepository, RepositoryError } from '@spfn/core/db';

export class UserRepository extends BaseRepository
{
    async findById(id: number)
    {
        return await this.withContext(
            () => this.readDb.select().from(users).where(eq(users.id, id)),
            { method: 'findById', table: 'users' }
        );
    }
}

// On error: RepositoryError with repository name, method, table context
```

---

## Standalone Helper Functions

For simple operations without repository class:

```typescript
import {
    findOne,
    findMany,
    create,
    createMany,
    upsert,
    updateOne,
    updateMany,
    deleteOne,
    deleteMany,
    count,
} from '@spfn/core/db';

// Find
const user = await findOne(users, { id: 1 });
const activeUsers = await findMany(users, {
    where: { active: true },
    orderBy: desc(users.createdAt),
    limit: 10
});

// Create
const newUser = await create(users, { email: 'test@example.com', name: 'Test' });
const newUsers = await createMany(users, [
    { email: 'user1@example.com' },
    { email: 'user2@example.com' }
]);

// Upsert
const cache = await upsert(cmsCache, data, {
    target: [cmsCache.section, cmsCache.locale],
    set: { content: data.content, updatedAt: new Date() }
});

// Update
const updated = await updateOne(users, { id: 1 }, { name: 'Updated' });
const updatedMany = await updateMany(users, { role: 'user' }, { verified: true });

// Delete
const deleted = await deleteOne(users, { id: 1 });
const deletedMany = await deleteMany(users, { verified: false });

// Count
const total = await count(users);
const activeCount = await count(users, { active: true });
```

---

## Schema Helpers

### Column Helpers

```typescript
import {
    id,
    uuid,
    timestamps,
    foreignKey,
    optionalForeignKey,
    auditFields,
    publishingFields,
    softDelete,
    verificationTimestamp,
    utcTimestamp,
    enumText,
    typedJsonb,
} from '@spfn/core/db';
```

#### `id()`

Auto-incrementing bigserial primary key.

```typescript
export const users = pgTable('users', {
    id: id(),  // bigserial primary key
    ...
});
```

#### `uuid()`

UUID primary key with auto-generation.

```typescript
export const sessions = pgTable('sessions', {
    id: uuid(),  // uuid primary key with gen_random_uuid()
    ...
});
```

#### `timestamps()`

Standard createdAt/updatedAt fields.

```typescript
export const users = pgTable('users', {
    id: id(),
    ...timestamps()  // createdAt, updatedAt (timestamptz)
});
```

#### `foreignKey(name, reference, options?)`

Required foreign key with cascade delete (default).

```typescript
export const posts = pgTable('posts', {
    id: id(),
    authorId: foreignKey('author', () => users.id),
    // Creates: author_id bigserial NOT NULL REFERENCES users(id) ON DELETE CASCADE
});
```

#### `optionalForeignKey(name, reference, options?)`

Nullable foreign key with set null (default).

```typescript
export const posts = pgTable('posts', {
    id: id(),
    categoryId: optionalForeignKey('category', () => categories.id),
    // Creates: category_id bigserial REFERENCES categories(id) ON DELETE SET NULL
});
```

#### `auditFields()`

User tracking fields.

```typescript
export const posts = pgTable('posts', {
    id: id(),
    ...auditFields()  // createdBy, updatedBy (text, nullable)
});
```

#### `publishingFields()`

Content publishing fields.

```typescript
export const articles = pgTable('articles', {
    id: id(),
    ...publishingFields()  // publishedAt (timestamptz), publishedBy (text)
});
```

#### `softDelete()`

Soft deletion fields.

```typescript
export const posts = pgTable('posts', {
    id: id(),
    ...softDelete()  // deletedAt (timestamptz), deletedBy (text)
});
```

#### `verificationTimestamp(fieldName)`

Custom verification timestamp.

```typescript
export const users = pgTable('users', {
    id: id(),
    ...verificationTimestamp('emailVerified'),  // emailVerifiedAt (timestamptz)
    ...verificationTimestamp('phoneVerified'),  // phoneVerifiedAt (timestamptz)
});
```

#### `utcTimestamp(fieldName, mode?)`

UTC timestamp field.

```typescript
export const events = pgTable('events', {
    id: id(),
    scheduledAt: utcTimestamp('scheduled_at').notNull(),
    processedAt: utcTimestamp('processed_at', 'string'),  // ISO string mode
});
```

#### `enumText(fieldName, values)`

Type-safe enum text field.

```typescript
const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;

export const users = pgTable('users', {
    id: id(),
    status: enumText('status', USER_STATUSES).default('active').notNull(),
});
```

#### `typedJsonb<T>(fieldName)`

Type-safe JSONB field.

```typescript
type UserMetadata = { preferences: Record<string, any>; settings: any };

export const users = pgTable('users', {
    id: id(),
    metadata: typedJsonb<UserMetadata>('metadata').notNull(),
});
```

### PostgreSQL Schema Helpers

For package-based schema isolation:

```typescript
import { createSchema, packageNameToSchema, getSchemaInfo } from '@spfn/core/db';

// Create namespaced schema
const schema = createSchema('@spfn/cms');
// Creates PostgreSQL schema: spfn_cms

export const labels = schema.table('labels', {
    id: id(),
    name: text('name').notNull(),
});
// Creates table: spfn_cms.labels

// Utility functions
packageNameToSchema('@spfn/cms');        // 'spfn_cms'
packageNameToSchema('@company/auth');    // 'company_auth'
packageNameToSchema('spfn-storage');     // 'spfn_storage'

getSchemaInfo('@spfn/cms');
// { schemaName: 'spfn_cms', isScoped: true, scope: 'spfn' }
```

---

## Manager APIs

### Initialization

```typescript
import {
    initDatabase,
    getDatabase,
    setDatabase,
    closeDatabase,
    getDatabaseInfo,
    createDatabaseFromEnv,
    createDatabaseConnection,
    checkConnection,
} from '@spfn/core/db';

// Initialize from environment
await initDatabase();

// Get database instance
const db = getDatabase('write');  // Primary database
const readDb = getDatabase('read');  // Replica (or primary if no replica)

// Manual setup
const clients = createDatabaseFromEnv();
setDatabase(clients);

// Connection utilities
const connection = await createDatabaseConnection(connectionString);
const isHealthy = await checkConnection(db);

// Cleanup
await closeDatabase();

// Diagnostics
const info = getDatabaseInfo();
// { hasWriteDb: true, hasReadDb: true, pattern: 'write-read' }
```

### Drizzle Config Generator

```typescript
import {
    getDrizzleConfig,
    detectDialect,
    generateDrizzleConfigFile,
} from '@spfn/core/db';
import type { DrizzleConfigOptions } from '@spfn/core/db';

// Auto-detect and generate config
const config = getDrizzleConfig({
    schemaPath: './src/server/entities/index.ts',
    outPath: './drizzle',
});

// Detect dialect from URL
const dialect = detectDialect(process.env.DATABASE_URL);
// 'postgresql' | 'mysql' | 'sqlite'

// Generate drizzle.config.ts file content
const fileContent = generateDrizzleConfigFile(options);
```

---

## Transaction APIs

```typescript
import {
    Transactional,
    getTransaction,
    runWithTransaction,
} from '@spfn/core/db';
import type {
    TransactionContext,
    TransactionDB,
    TransactionalOptions,
} from '@spfn/core/db';

// Middleware for routes
export const middlewares = [Transactional()];

// With options
export const middlewares = [Transactional({
    timeout: 30000,
    logSuccess: false,
    logErrors: true,
})];

// Get current transaction context
const tx = getTransaction();
if (tx) {
    await tx.insert(users).values(data);
}

// Manual transaction control
await runWithTransaction(async () => {
    await userRepo.create(userData);
    await profileRepo.create(profileData);
    // Auto-commit on success, auto-rollback on error
});
```

See [Transaction Documentation](./transaction/README.md) for detailed patterns.

---

## PostgreSQL Error Utilities

```typescript
import { fromPostgresError } from '@spfn/core/db';

try {
    await db.insert(users).values(data);
} catch (error) {
    const customError = fromPostgresError(error);
    // Converts PostgreSQL error codes to custom error types:
    // - 08xxx → ConnectionError
    // - 23505 → DuplicateEntryError
    // - 23503 → ConstraintViolationError
    // - 40P01 → DeadlockError
    // - 42xxx → QueryError
    throw customError;
}
```

---

## Environment Variables

### Single Database

```bash
DATABASE_URL=postgresql://localhost:5432/mydb
```

### Primary + Replica (Recommended)

```bash
DATABASE_WRITE_URL=postgresql://primary:5432/mydb
DATABASE_READ_URL=postgresql://replica:5432/mydb
```

### Legacy Pattern

```bash
DATABASE_URL=postgresql://primary:5432/mydb
DATABASE_REPLICA_URL=postgresql://replica:5432/mydb
```

See [Manager Documentation](./manager/README.md) for complete configuration options.

---

## Type Exports

```typescript
import type {
    // Manager types
    DatabaseClients,
    PoolConfig,
    RetryConfig,
    DbConnectionType,
    GetDatabaseFn,
    DrizzleConfigOptions,

    // Transaction types
    TransactionContext,
    TransactionDB,
    TransactionalOptions,
} from '@spfn/core/db';
```

---

## Best Practices

### Do

```typescript
// 1. Initialize once at startup
await initDatabase();

// 2. Use transactions for write operations
export const middlewares = [Transactional()];

// 3. Use domain-specific repositories
export class UserRepository extends BaseRepository
{
    async findActive()
    {
        return await this._findMany(users, { where: { active: true } });
    }
}

// 4. Use object-based where for simple queries
await this._findOne(users, { email });

// 5. Use SQL-based where for complex queries
await this._findOne(users, and(gt(users.age, 18), eq(users.verified, true)));

// 6. Use schema helpers for consistency
export const users = pgTable('users', {
    id: id(),
    ...timestamps()
});

// 7. Close connections in tests
afterAll(async () => {
    await closeDatabase();
});
```

### Don't

```typescript
// 1. Don't create multiple database instances manually
const db1 = drizzle(connection1);  // Bad

// 2. Don't bypass transaction middleware for writes
export async function POST(c) {
    // Missing Transactional() - no automatic rollback
}

// 3. Don't use write db for reads in repositories
async findUsers() {
    return await this.db.select().from(users);  // Bad - use this.readDb
}

// 4. Don't access protected methods outside repositories
repo._findOne(users, { id: 1 });  // TypeScript error
```

---

## Test Coverage

The database module has **224 tests** across all sub-modules:

| Module | Tests | Description |
|--------|-------|-------------|
| manager/ | 107 | Config, connection, factory, manager, health-check |
| transaction/ | 33 | Middleware, context integration |
| schema/ | (in sub-readme) | Schema helpers |
| helpers.ts | 29 | CRUD helper functions |
| postgres-errors.ts | 48 | PostgreSQL error conversion |
| repository-error.ts | 7 | RepositoryError class |

### Running Tests

```bash
# Run all database tests
pnpm vitest run src/db

# Run with coverage
pnpm vitest run src/db --coverage

# Run specific module
pnpm vitest run src/db/manager/__tests__
pnpm vitest run src/db/transaction/__tests__

# Integration tests (requires Docker PostgreSQL)
pnpm docker:test:up
pnpm vitest run src/db/**/*.integration.test.ts
```

---

## Related

- [Manager Documentation](./manager/README.md) - Connection management and configuration
- [Transaction Documentation](./transaction/README.md) - Transaction patterns
- [Schema Documentation](./schema/README.md) - Schema helper details
- [Drizzle ORM Documentation](https://orm.drizzle.team/) - Complete ORM reference
