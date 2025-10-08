# Repository Pattern

Complete API reference for the Repository pattern in SPFN.

## Overview

The Repository pattern provides a high-level, type-safe interface for database operations. It wraps Drizzle ORM with convenient methods for CRUD operations, pagination, filtering, and sorting.

**Benefits:**
- Reduces boilerplate code
- Type-safe queries and results
- Consistent error handling
- Built-in pagination and filtering
- Transaction-aware (works with `Transactional()` middleware)

## Quick Start

```typescript
import { getDb } from '@spfn/core/db';
import { users } from './schema';

const db = getDb();
const userRepo = db.for(users);

// Create
const user = await userRepo.save({ email: 'test@example.com', name: 'John' });

// Read
const found = await userRepo.findById(user.id);
const all = await userRepo.findAll();

// Update
await userRepo.update(user.id, { name: 'Jane' });

// Delete
await userRepo.delete(user.id);
```

## API Reference

### db.for(table)

Create a Repository instance for a table.

```typescript
import { getDb } from '@spfn/core/db';
import { users } from './schema';

const db = getDb();
const userRepo = db.for(users);
```

**Parameters:**
- `table: PgTable` - Drizzle table schema

**Returns:** `Repository<T>` where `T` is inferred from the table schema

---

### save(data)

Insert a new record.

```typescript
const user = await userRepo.save({
    email: 'john@example.com',
    name: 'John Doe',
    role: 'user'
});

console.log(user.id); // Auto-generated ID
console.log(user.createdAt); // Auto-generated timestamp
```

**Parameters:**
- `data: InsertType<T>` - Data to insert (matches table schema)

**Returns:** `Promise<SelectType<T>>` - The created record with all fields

**Throws:** `DatabaseError` if insertion fails (e.g., unique constraint violation)

---

### saveMany(data[])

Insert multiple records in a single query.

```typescript
const users = await userRepo.saveMany([
    { email: 'user1@example.com', name: 'User 1' },
    { email: 'user2@example.com', name: 'User 2' },
    { email: 'user3@example.com', name: 'User 3' }
]);

console.log(users.length); // 3
```

**Parameters:**
- `data: InsertType<T>[]` - Array of records to insert

**Returns:** `Promise<SelectType<T>[]>` - Array of created records

**Performance:** More efficient than multiple `save()` calls - uses single INSERT statement

---

### findById(id)

Find a single record by primary key.

```typescript
const user = await userRepo.findById(123);

if (user) {
    console.log(user.email);
} else {
    console.log('User not found');
}
```

**Parameters:**
- `id: number | string` - Primary key value

**Returns:** `Promise<SelectType<T> | null>` - Record if found, null otherwise

**Note:** Assumes primary key column is named `id`. For custom primary keys, use `findWhere()`.

---

### findAll(options?)

Fetch all records with optional pagination and sorting.

```typescript
// Get all records
const allUsers = await userRepo.findAll();

// With pagination
const page1 = await userRepo.findAll({
    limit: 10,
    offset: 0
});

// With sorting
const sorted = await userRepo.findAll({
    orderBy: { field: 'createdAt', direction: 'desc' }
});

// Combined
const results = await userRepo.findAll({
    limit: 20,
    offset: 40,
    orderBy: { field: 'email', direction: 'asc' }
});
```

**Parameters:**
- `options?: FindAllOptions`
  - `limit?: number` - Maximum records to return
  - `offset?: number` - Number of records to skip
  - `orderBy?: SortOption` - Sort configuration

**Returns:** `Promise<SelectType<T>[]>` - Array of records

---

### findWhere(filters, options?)

Find records matching filter criteria.

```typescript
// Simple equality
const admins = await userRepo.findWhere({
    role: 'admin'
});

// Multiple filters (AND)
const activeAdmins = await userRepo.findWhere({
    role: 'admin',
    status: 'active'
});

// With operators
const recentUsers = await userRepo.findWhere({
    createdAt: { gte: new Date('2024-01-01') }
});

// With pagination and sorting
const results = await userRepo.findWhere(
    { role: 'user' },
    {
        limit: 10,
        offset: 0,
        orderBy: { field: 'createdAt', direction: 'desc' }
    }
);
```

**Parameters:**
- `filters: FilterMap<T>` - Field filters (see Filter Operators below)
- `options?: FindAllOptions` - Pagination and sorting

**Returns:** `Promise<SelectType<T>[]>` - Matching records

**Filter Operators:**

```typescript
{
    // Equality
    role: 'admin'

    // Comparison
    age: { gt: 18 }           // greater than
    age: { gte: 18 }          // greater than or equal
    age: { lt: 65 }           // less than
    age: { lte: 65 }          // less than or equal

    // Pattern matching
    email: { like: '@gmail.com' }         // LIKE '%@gmail.com%'
    email: { ilike: '@GMAIL.COM' }        // Case-insensitive LIKE

    // Array operations
    id: { in: [1, 2, 3] }                 // IN (1, 2, 3)
    status: { notIn: ['deleted', 'banned'] }  // NOT IN (...)

    // Null checks
    deletedAt: { isNull: true }           // IS NULL
    deletedAt: { isNotNull: true }        // IS NOT NULL
}
```

---

### findPage(options)

Paginate through records with full metadata.

```typescript
const result = await userRepo.findPage({
    pagination: { page: 1, limit: 10 },
    sort: [{ field: 'createdAt', direction: 'desc' }],
    filters: { role: 'user', status: 'active' }
});

console.log(result);
// {
//   items: [...],           // Records for current page
//   total: 150,             // Total matching records
//   page: 1,                // Current page
//   limit: 10,              // Records per page
//   totalPages: 15,         // Total pages
//   hasNext: true,          // Has next page
//   hasPrev: false          // Has previous page
// }
```

**Parameters:**
- `options: FindPageOptions<T>`
  - `pagination: { page: number, limit: number }` - Required
  - `filters?: FilterMap<T>` - Optional filters
  - `sort?: SortOption[]` - Optional sorting (multiple fields)

**Returns:** `Promise<Page<T>>` - Paginated result with metadata

**Page Type:**
```typescript
interface Page<T> {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
}
```

---

### update(id, data)

Update a record by primary key.

```typescript
const updated = await userRepo.update(123, {
    name: 'Updated Name',
    status: 'active'
});

if (updated) {
    console.log('Updated:', updated);
} else {
    console.log('User not found');
}
```

**Parameters:**
- `id: number | string` - Primary key value
- `data: Partial<InsertType<T>>` - Fields to update

**Returns:** `Promise<SelectType<T> | null>` - Updated record or null if not found

**Note:** Partial update - only specified fields are changed

---

### updateWhere(filters, data)

Update multiple records matching filters.

```typescript
// Update all inactive users
const count = await userRepo.updateWhere(
    { status: 'inactive' },
    { status: 'archived' }
);

console.log(`Updated ${count} users`);
```

**Parameters:**
- `filters: FilterMap<T>` - Records to update
- `data: Partial<InsertType<T>>` - Fields to update

**Returns:** `Promise<number>` - Number of records updated

---

### delete(id)

Delete a record by primary key.

```typescript
const deleted = await userRepo.delete(123);

if (deleted) {
    console.log('Deleted user:', deleted);
} else {
    console.log('User not found');
}
```

**Parameters:**
- `id: number | string` - Primary key value

**Returns:** `Promise<SelectType<T> | null>` - Deleted record or null if not found

---

### deleteWhere(filters)

Delete multiple records matching filters.

```typescript
// Delete all banned users
const count = await userRepo.deleteWhere({ status: 'banned' });

console.log(`Deleted ${count} users`);
```

**Parameters:**
- `filters: FilterMap<T>` - Records to delete

**Returns:** `Promise<number>` - Number of records deleted

---

### exists(id)

Check if a record exists by primary key.

```typescript
const exists = await userRepo.exists(123);

if (exists) {
    console.log('User exists');
}
```

**Parameters:**
- `id: number | string` - Primary key value

**Returns:** `Promise<boolean>` - true if exists, false otherwise

---

### count(filters?)

Count records, optionally with filters.

```typescript
// Total users
const total = await userRepo.count();

// Active users
const activeCount = await userRepo.count({ status: 'active' });

// Admins created after specific date
const recentAdmins = await userRepo.count({
    role: 'admin',
    createdAt: { gte: new Date('2024-01-01') }
});
```

**Parameters:**
- `filters?: FilterMap<T>` - Optional filters

**Returns:** `Promise<number>` - Count of matching records

## Advanced Patterns

### Complex Filtering

```typescript
// Multiple conditions
const results = await userRepo.findWhere({
    role: 'user',
    status: { in: ['active', 'pending'] },
    createdAt: { gte: new Date('2024-01-01') },
    email: { like: '@company.com' },
    deletedAt: { isNull: true }
});
```

### Pagination with Total Count

```typescript
const { items, total, totalPages } = await userRepo.findPage({
    pagination: { page: 1, limit: 20 },
    filters: { role: 'user' },
    sort: [
        { field: 'isPremium', direction: 'desc' },  // Premium users first
        { field: 'createdAt', direction: 'desc' }   // Then by creation date
    ]
});

console.log(`Showing ${items.length} of ${total} users (${totalPages} pages)`);
```

### Batch Operations

```typescript
// Batch create
const newUsers = await userRepo.saveMany([
    { email: 'user1@example.com', name: 'User 1' },
    { email: 'user2@example.com', name: 'User 2' },
    { email: 'user3@example.com', name: 'User 3' }
]);

// Batch update
const updatedCount = await userRepo.updateWhere(
    { status: 'pending' },
    { status: 'active', activatedAt: new Date() }
);

// Batch delete
const deletedCount = await userRepo.deleteWhere({
    status: 'banned',
    createdAt: { lt: new Date('2023-01-01') }
});
```

### Transaction Integration

Repository methods automatically participate in transactions when used with `Transactional()` middleware:

```typescript
import { createApp } from '@spfn/core/route';
import { Transactional, getDb } from '@spfn/core/db';
import { users, profiles } from './schema';

const app = createApp();

app.bind(
    createUserContract,
    Transactional(),
    async (c) => {
        const db = getDb();
        const userRepo = db.for(users);
        const profileRepo = db.for(profiles);

        // Both operations in same transaction
        const user = await userRepo.save({ email: 'test@example.com' });
        const profile = await profileRepo.save({ userId: user.id, bio: 'Hello' });

        return c.json({ user, profile });
    }
);
```

### Custom Queries

For complex queries beyond Repository capabilities, use raw Drizzle:

```typescript
import { getDb } from '@spfn/core/db';
import { users, posts } from './schema';
import { eq, sql } from 'drizzle-orm';

const db = getDb();

// Join query
const usersWithPostCount = await db
    .select({
        id: users.id,
        email: users.email,
        postCount: sql<number>`count(${posts.id})`.as('post_count')
    })
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId))
    .groupBy(users.id);

// Subquery
const activeUsersWithPosts = await db
    .select()
    .from(users)
    .where(
        sql`EXISTS (
            SELECT 1 FROM ${posts}
            WHERE ${posts.authorId} = ${users.id}
            AND ${posts.status} = 'published'
        )`
    );
```

## Performance Tips

### 1. Use Batch Operations

```typescript
// ❌ Slow: N queries
for (const userData of usersData) {
    await userRepo.save(userData);
}

// ✅ Fast: 1 query
await userRepo.saveMany(usersData);
```

### 2. Limit Results

```typescript
// ❌ Memory intensive
const allUsers = await userRepo.findAll();

// ✅ Paginate
const page = await userRepo.findPage({
    pagination: { page: 1, limit: 100 }
});
```

### 3. Use Specific Filters

```typescript
// ❌ Fetches all, filters in memory
const all = await userRepo.findAll();
const admins = all.filter(u => u.role === 'admin');

// ✅ Filters in database
const admins = await userRepo.findWhere({ role: 'admin' });
```

### 4. Use exists() for Existence Checks

```typescript
// ❌ Fetches entire record
const user = await userRepo.findById(123);
if (user) { /* ... */ }

// ✅ Just checks existence
const exists = await userRepo.exists(123);
if (exists) { /* ... */ }
```

### 5. Use count() Instead of length

```typescript
// ❌ Fetches all records
const all = await userRepo.findAll();
const total = all.length;

// ✅ COUNT query only
const total = await userRepo.count();
```

## Error Handling

Repository methods throw `DatabaseError` for database-related failures:

```typescript
import { DatabaseError } from '@spfn/core/errors';

try {
    await userRepo.save({ email: 'duplicate@example.com' });
} catch (error) {
    if (error instanceof DatabaseError) {
        if (error.message.includes('unique constraint')) {
            console.error('Email already exists');
        }
    }
}
```

Common error scenarios:
- Unique constraint violations
- Foreign key constraint violations
- Invalid data types
- Connection failures

## Type Safety

Repository is fully type-safe based on your Drizzle schema:

```typescript
import { pgTable, text, bigserial } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    name: text('name'),
    ...timestamps()
});

const userRepo = db.for(users);

// ✅ Type-safe
await userRepo.save({
    email: 'test@example.com',
    name: 'John'
});

// ❌ TypeScript error: 'role' doesn't exist on users table
await userRepo.save({
    email: 'test@example.com',
    role: 'admin'
});

// ✅ Type-safe filters
const results = await userRepo.findWhere({
    email: { like: '@example.com' }
});

// ❌ TypeScript error: invalid filter operator
await userRepo.findWhere({
    email: { contains: 'example' }
});
```