# Database Module (@spfn/core/db)

Type-safe PostgreSQL database layer with automatic transactions, repository pattern, and schema helpers.

## Quick Start

```typescript
import { createApp } from '@spfn/core/route';
import { createDatabaseFromEnv, getDb, Transactional } from '@spfn/core/db';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';
import { Type } from '@sinclair/typebox';

// 1. Define schema
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name'),
    ...timestamps()
});

// 2. Initialize database (once at app startup)
createDatabaseFromEnv();  // Reads DATABASE_URL from env

// 3. Use in routes
const app = createApp();

const getUsersContract = {
    method: 'GET' as const,
    path: '/',
    response: Type.Array(Type.Object({
        id: Type.Number(),
        email: Type.String()
    }))
};

app.bind(getUsersContract, async (c) => {
    const userRepo = new Repository(users);

    const allUsers = await userRepo.findAll();
    return c.json(allUsers);
});

const createUserContract = {
    method: 'POST' as const,
    path: '/',
    body: Type.Object({
        email: Type.String(),
        name: Type.String()
    }),
    response: Type.Object({
        id: Type.Number(),
        email: Type.String()
    })
};

app.bind(createUserContract, Transactional(), async (c) => {
    const userRepo = new Repository(users);

    const data = await c.req.json();
    const user = await userRepo.save(data);

    return c.json(user, 201);
});

export default app;
```

## Core API

### Database Access

```typescript
import { createDatabaseFromEnv, getDb } from '@spfn/core/db';

// Initialize once at app startup
createDatabaseFromEnv();

// Access anywhere in your app
const db = getDb();
```

**Key Functions:**
- `createDatabaseFromEnv()` - Initialize from `DATABASE_URL` env var
- `getDb()` - Get database instance (alias: `getDatabase()`)

For advanced configuration, see [Database Manager →](./docs/database-manager.md)

### Repository Pattern

```typescript
import { Repository } from '@spfn/core/db';
import { users } from './schema';

const userRepo = new Repository(users);

// Create
const user = await userRepo.save({
    email: 'test@example.com',
    name: 'John Doe'
});

// Read
const found = await userRepo.findById(user.id);
const all = await userRepo.findAll();

// Update
await userRepo.update(user.id, { name: 'Jane Doe' });

// Delete
await userRepo.delete(user.id);

// Pagination & Filtering
const page = await userRepo.findPage({
    filters: { email: { like: '@example.com' } },
    pagination: { page: 1, limit: 10 },
    sort: [{ field: 'createdAt', direction: 'desc' }]
});
```

**Core Methods:**
- `save(data)` - Create record
- `saveMany(data[])` - Batch create
- `findById(id)` - Find by primary key
- `findAll(options?)` - List all with pagination
- `findWhere(filters, options?)` - Filter records
- `findPage(options)` - Paginate with metadata
- `update(id, data)` - Update by primary key
- `updateWhere(filters, data)` - Batch update
- `delete(id)` - Delete by primary key
- `deleteWhere(filters)` - Batch delete
- `exists(id)` - Check existence
- `count(filters?)` - Count records

For complete API reference, see [Repository Pattern →](./docs/repository.md)

### Transactions

```typescript
import { Transactional, Repository } from '@spfn/core/db';

app.bind(contract, Transactional(), async (c) => {
    const userRepo = new Repository(users);
    const profileRepo = new Repository(profiles);

    // Both operations in same transaction
    const user = await userRepo.save({ email: 'test@example.com' });
    const profile = await profileRepo.save({ userId: user.id });

    // Success → automatic COMMIT
    // Error → automatic ROLLBACK
    return c.json({ user, profile });
});
```

**Key Features:**
- Automatic BEGIN/COMMIT/ROLLBACK
- AsyncLocalStorage-based (no explicit passing)
- Works across nested function calls
- Repository methods auto-participate

For transaction patterns and best practices, see [Transactions →](./docs/transactions.md)

### Schema Helpers

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey, optionalForeignKey } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),                    // bigserial primary key
    email: text('email').notNull().unique(),
    ...timestamps()              // createdAt + updatedAt
});

export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),           // Required FK
    categoryId: optionalForeignKey('category', () => categories.id),  // Optional FK
    ...timestamps()
});
```

**Available Helpers:**
- `id()` - Standard primary key (bigserial, auto-increment)
- `timestamps()` - createdAt + updatedAt with timezone
- `foreignKey(name, reference)` - Required foreign key
- `optionalForeignKey(name, reference)` - Nullable foreign key

For complete schema helper documentation, see [Schema Helpers →](./docs/schema-helpers.md)

## Filter Operators

Repository `findWhere()` and `findPage()` support rich filtering:

```typescript
// Equality
{ role: 'admin' }

// Comparison
{ age: { gt: 18 } }           // greater than
{ age: { gte: 18 } }          // greater than or equal
{ age: { lt: 65 } }           // less than
{ age: { lte: 65 } }          // less than or equal

// Pattern matching
{ email: { like: '@gmail.com' } }     // LIKE '%@gmail.com%'
{ email: { ilike: '@GMAIL.COM' } }    // Case-insensitive LIKE

// Array operations
{ id: { in: [1, 2, 3] } }              // IN (1, 2, 3)
{ status: { notIn: ['deleted'] } }     // NOT IN (...)

// Null checks
{ deletedAt: { isNull: true } }        // IS NULL
{ deletedAt: { isNotNull: true } }     // IS NOT NULL

// Multiple filters (AND)
{
    role: 'user',
    status: 'active',
    createdAt: { gte: new Date('2024-01-01') }
}
```

## Environment Variables

```bash
# .env
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
```

**Connection String Format:**
```
postgresql://[user[:password]@][host][:port][/database][?param1=value1&...]
```

**Examples:**
```bash
# Local development
DATABASE_URL=postgresql://localhost:5432/myapp_dev

# With authentication
DATABASE_URL=postgresql://user:password@localhost:5432/myapp

# Production (Railway, Render, etc.)
DATABASE_URL=postgresql://user:pass@containers-us-west-123.railway.app:5432/railway

# With SSL
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```

## Common Patterns

### CRUD Operations

```typescript
const userRepo = new Repository(users);

// Create single
const user = await userRepo.save({
    email: 'john@example.com',
    name: 'John Doe'
});

// Create multiple
const newUsers = await userRepo.saveMany([
    { email: 'user1@example.com', name: 'User 1' },
    { email: 'user2@example.com', name: 'User 2' }
]);

// Read with filters
const admins = await userRepo.findWhere({ role: 'admin' });

// Paginate
const page = await userRepo.findPage({
    pagination: { page: 1, limit: 20 },
    filters: { status: 'active' },
    sort: [{ field: 'createdAt', direction: 'desc' }]
});

// Update
await userRepo.update(user.id, { name: 'Updated Name' });

// Batch update
await userRepo.updateWhere(
    { status: 'inactive' },
    { status: 'archived' }
);

// Delete
await userRepo.delete(user.id);

// Batch delete
await userRepo.deleteWhere({ status: 'banned' });
```

### Relationships

```typescript
import { foreignKey, optionalForeignKey } from '@spfn/core/db';

// One-to-Many
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    ...timestamps()
});

export const posts = pgTable('posts', {
    id: id(),
    authorId: foreignKey('author', () => users.id),  // Many posts per user
    title: text('title').notNull(),
    ...timestamps()
});

// Query with join
const db = getDb();
const postsWithAuthors = await db
    .select({
        post: posts,
        author: users
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id));
```

### Atomic Operations

```typescript
app.bind(contract, Transactional(), async (c) => {
    const orderRepo = new Repository(orders);
    const inventoryRepo = new Repository(inventory);

    // Create order
    const order = await orderRepo.save({
        userId: c.user.id,
        total: 100
    });

    // Update inventory
    await inventoryRepo.updateWhere(
        { productId: 1 },
        { quantity: sql`quantity - 1` }
    );

    // Both succeed or both rollback
    return c.json(order);
});
```

## Advanced Topics

### Database Manager
Manual database lifecycle management for testing and advanced scenarios.

[Read more →](./docs/database-manager.md)

**Topics:**
- `initDatabase(config)` - Manual initialization
- `setDatabase(db)` - Replace connection
- `closeDatabase()` - Cleanup
- `getDatabaseInfo()` - Connection metadata
- Testing patterns
- Multiple connections

### Repository Pattern
Complete API reference for all repository methods.

[Read more →](./docs/repository.md)

**Topics:**
- Full method documentation
- Advanced filtering
- Pagination with metadata
- Batch operations
- Type safety
- Performance tips

### Transactions
Automatic transaction management with AsyncLocalStorage.

[Read more →](./docs/transactions.md)

**Topics:**
- How transactions work
- Nested service calls
- Error handling and rollback
- Manual transaction control
- Isolation levels
- Best practices

### Schema Helpers
Reusable column definitions for common patterns.

[Read more →](./docs/schema-helpers.md)

**Topics:**
- `id()` - Primary key helper
- `timestamps()` - Audit columns
- `foreignKey()` - Required relationships
- `optionalForeignKey()` - Optional relationships
- Custom foreign key options
- Type inference

## API Reference

### Core Functions

| Function | Description |
|----------|-------------|
| `createDatabaseFromEnv()` | Initialize from `DATABASE_URL` |
| `getDb()` | Get database instance |
| `Transactional()` | Transaction middleware |
| `new Repository(table)` | Create Repository instance |

### Repository Methods

| Method | Description |
|--------|-------------|
| `save(data)` | Create record |
| `saveMany(data[])` | Batch create |
| `findById(id)` | Find by primary key |
| `findAll(options?)` | List all |
| `findWhere(filters, options?)` | Filter records |
| `findPage(options)` | Paginate |
| `update(id, data)` | Update by primary key |
| `updateWhere(filters, data)` | Batch update |
| `delete(id)` | Delete by primary key |
| `deleteWhere(filters)` | Batch delete |
| `exists(id)` | Check existence |
| `count(filters?)` | Count records |

### Schema Helpers

| Helper | Description |
|--------|-------------|
| `id()` | Primary key (bigserial) |
| `timestamps()` | createdAt + updatedAt |
| `foreignKey(name, ref)` | Required foreign key |
| `optionalForeignKey(name, ref)` | Optional foreign key |

### Database Manager

| Function | Description |
|----------|-------------|
| `initDatabase(config)` | Manual init |
| `getDatabase()` | Get instance |
| `setDatabase(db)` | Replace connection |
| `closeDatabase()` | Cleanup |
| `getDatabaseInfo()` | Connection info |

See [Database Manager docs](./docs/database-manager.md) for details.

## Troubleshooting

### "Database not initialized" error

**Cause:** Trying to use `getDb()` before calling `createDatabaseFromEnv()`

**Solution:**
```typescript
// Add to app startup (src/server/app.ts)
import { createDatabaseFromEnv } from '@spfn/core/db';
createDatabaseFromEnv();
```

### "DATABASE_URL not found" error

**Cause:** Missing environment variable

**Solution:**
```bash
# .env
DATABASE_URL=postgresql://localhost:5432/mydb
```

### Type errors with Repository

**Cause:** TypeScript can't infer table type

**Solution:**
```typescript
// ✅ Correct
const userRepo = new Repository(users);

// ❌ Wrong
const userRepo: Repository<any> = new Repository(users);
```

### Transaction not rolling back

**Cause:** Missing `Transactional()` middleware or swallowed error

**Solution:**
```typescript
// Ensure middleware is applied
app.bind(contract, Transactional(), async (c) => {
    // Don't catch and swallow errors
    throw error;  // Let it propagate
});
```

## Performance Tips

1. **Use batch operations** - `saveMany()` instead of multiple `save()`
2. **Paginate large datasets** - Always use `findPage()` for listings
3. **Filter in database** - Use `findWhere()` instead of filtering in memory
4. **Use `exists()`** - Don't `findById()` just to check existence
5. **Use `count()`** - Don't fetch all records to count them

## Best Practices

1. **Initialize once** - Call `createDatabaseFromEnv()` only at app startup
2. **Use `getDb()` everywhere** - Don't create new connections
3. **Apply `Transactional()`** - Wrap all write operations in transactions
4. **Use schema helpers** - `id()`, `timestamps()`, `foreignKey()` for consistency
5. **Type safety** - Let TypeScript infer types from schema
6. **Close in tests** - Call `closeDatabase()` in test cleanup

## Additional Resources

- [Database Manager →](./docs/database-manager.md) - Advanced configuration and testing
- [Repository Pattern →](./docs/repository.md) - Complete API reference
- [Transactions →](./docs/transactions.md) - Transaction management guide
- [Schema Helpers →](./docs/schema-helpers.md) - Reusable schema patterns
- [Drizzle ORM Docs](https://orm.drizzle.team) - Underlying ORM documentation
- [PostgreSQL Docs](https://www.postgresql.org/docs/) - Database reference