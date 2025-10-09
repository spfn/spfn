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
import { Repository } from '@spfn/core/db';
import { users } from './schema';

const userRepo = new Repository(users);

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

### new Repository(table)

Create a Repository instance for a table.

```typescript
import { Repository } from '@spfn/core/db';
import { users } from './schema';

const userRepo = new Repository(users);
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

---

### findOneWhere(filters)

Find a single record matching filter criteria.

```typescript
// Find user by email
const user = await userRepo.findOneWhere({
    email: 'john@example.com'
});

// Find with multiple filters
const activeAdmin = await userRepo.findOneWhere({
    role: 'admin',
    status: 'active'
});

if (user) {
    console.log('Found:', user);
} else {
    console.log('Not found');
}
```

**Parameters:**
- `filters: FilterMap<T>` - Field filters

**Returns:** `Promise<SelectType<T> | null>` - First matching record or null

---

### existsBy(filters)

Check if a record exists by filter criteria.

```typescript
// Check if email exists
const emailExists = await userRepo.existsBy({
    email: 'john@example.com'
});

// Check with multiple conditions
const activeAdminExists = await userRepo.existsBy({
    role: 'admin',
    status: 'active'
});

if (emailExists) {
    console.log('Email is already registered');
}
```

**Parameters:**
- `filters: FilterMap<T>` - Field filters

**Returns:** `Promise<boolean>` - true if exists, false otherwise

---

### countBy(filters)

Count records matching filter criteria.

```typescript
// Count active users
const activeCount = await userRepo.countBy({ status: 'active' });

// Count with multiple filters
const recentActiveUsers = await userRepo.countBy({
    status: 'active',
    createdAt: { gte: new Date('2024-01-01') }
});

console.log(`Found ${activeCount} active users`);
```

**Parameters:**
- `filters: FilterMap<T>` - Field filters

**Returns:** `Promise<number>` - Count of matching records

---

## Query Builder (Fluent Interface)

SPFN Repository provides a fluent query builder API for building complex queries with method chaining, similar to JPA's Criteria API or TypeORM's QueryBuilder.

### query()

Start a chainable query builder.

```typescript
import { Repository } from '@spfn/core/db';
import { users } from './schema';

const userRepo = new Repository<typeof users>(users);

// Simple chaining
const activeUsers = await userRepo
    .query()
    .where({ status: 'active' })
    .orderBy('createdAt', 'desc')
    .limit(10)
    .findMany();

// Multiple conditions (AND)
const activeAdmins = await userRepo
    .query()
    .where({ role: 'admin' })
    .where({ status: 'active' })
    .findMany();
```

**Returns:** `QueryBuilder<T>` - Chainable query builder instance

---

### where(filters)

Add WHERE conditions to the query. Multiple `where()` calls are combined with AND logic.

```typescript
// Single condition
const users = await userRepo
    .query()
    .where({ email: { like: 'gmail' } })
    .findMany();

// Multiple where() calls (AND)
const results = await userRepo
    .query()
    .where({ status: 'active' })
    .where({ role: 'admin' })
    .where({ createdAt: { gte: new Date('2024-01-01') } })
    .findMany();
```

**Parameters:**
- `filters: FilterMap<T>` - Field filters (same as `findWhere()`)

**Returns:** `QueryBuilder<T>` - For chaining

**Filter Operators:** Same as `findWhere()` - eq, gt, gte, lt, lte, like, ilike, in, notIn, isNull, isNotNull

---

### orderBy(field, direction)

Add ORDER BY clause. Multiple `orderBy()` calls create multi-column sorting.

```typescript
// Single sort
const users = await userRepo
    .query()
    .orderBy('createdAt', 'desc')
    .findMany();

// Multiple columns
const sortedUsers = await userRepo
    .query()
    .orderBy('isPremium', 'desc')  // Premium users first
    .orderBy('createdAt', 'desc')  // Then by creation date
    .findMany();
```

**Parameters:**
- `field: string` - Column name to sort by
- `direction: 'asc' | 'desc'` - Sort direction (default: 'asc')

**Returns:** `QueryBuilder<T>` - For chaining

---

### limit(n)

Set maximum number of records to return (LIMIT clause).

```typescript
// Get first 10 users
const users = await userRepo
    .query()
    .limit(10)
    .findMany();

// Combine with orderBy for top N
const topUsers = await userRepo
    .query()
    .orderBy('score', 'desc')
    .limit(5)
    .findMany();
```

**Parameters:**
- `n: number` - Maximum records to return

**Returns:** `QueryBuilder<T>` - For chaining

---

### offset(n)

Skip N records (OFFSET clause). Useful for pagination.

```typescript
// Skip first 20 records
const users = await userRepo
    .query()
    .offset(20)
    .findMany();

// Pagination (page 3, 10 per page)
const page3 = await userRepo
    .query()
    .orderBy('id', 'asc')
    .limit(10)
    .offset(20)  // Skip first 2 pages
    .findMany();
```

**Parameters:**
- `n: number` - Number of records to skip

**Returns:** `QueryBuilder<T>` - For chaining

---

### findMany()

Execute query and return array of records.

```typescript
const users = await userRepo
    .query()
    .where({ status: 'active' })
    .orderBy('createdAt', 'desc')
    .limit(10)
    .findMany();

console.log(users); // Array of user objects
```

**Returns:** `Promise<SelectType<T>[]>` - Array of matching records

---

### findOne()

Execute query and return first record only. Automatically applies `limit(1)`.

```typescript
// Find first matching record
const user = await userRepo
    .query()
    .where({ email: { like: 'john' } })
    .orderBy('createdAt', 'desc')
    .findOne();

if (user) {
    console.log('Found:', user);
} else {
    console.log('Not found');
}
```

**Returns:** `Promise<SelectType<T> | null>` - First record or null

---

### count()

Execute query and return count of matching records.

```typescript
// Count active users
const activeCount = await userRepo
    .query()
    .where({ status: 'active' })
    .count();

// Count with multiple conditions
const complexCount = await userRepo
    .query()
    .where({ role: 'user' })
    .where({ status: 'active' })
    .where({ createdAt: { gte: new Date('2024-01-01') } })
    .count();

console.log(`Found ${activeCount} active users`);
```

**Returns:** `Promise<number>` - Count of matching records

---

### Complex Query Examples

**Pagination:**

```typescript
const page = 2;
const pageSize = 20;

const users = await userRepo
    .query()
    .where({ role: 'user' })
    .orderBy('createdAt', 'desc')
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .findMany();
```

**Multiple Filters with Sorting:**

```typescript
const premiumUsers = await userRepo
    .query()
    .where({ isPremium: true })
    .where({ status: 'active' })
    .where({ createdAt: { gte: new Date('2024-01-01') } })
    .orderBy('lastLoginAt', 'desc')
    .limit(50)
    .findMany();
```

**Search with Pagination:**

```typescript
const searchResults = await userRepo
    .query()
    .where({ email: { like: searchTerm } })
    .where({ deletedAt: { isNull: true } })
    .orderBy('email', 'asc')
    .limit(10)
    .offset(0)
    .findMany();
```

---

### Query Reuse

Query builders can be reused and composed:

```typescript
// Create base query
const activeUsersQuery = userRepo
    .query()
    .where({ status: 'active' })
    .orderBy('createdAt', 'desc');

// Reuse for different operations
const users = await activeUsersQuery.findMany();
const count = await activeUsersQuery.count();
const firstUser = await activeUsersQuery.findOne();

// Compose queries
const adminQuery = userRepo
    .query()
    .where({ role: 'admin' });

const activeAdmins = await adminQuery
    .where({ status: 'active' })
    .findMany();

const inactiveAdmins = await adminQuery
    .where({ status: 'inactive' })
    .findMany();
```

---

### Query Builder Best Practices

**1. Use query() for complex filtering:**

```typescript
// ✅ Good: Fluent and readable
const users = await userRepo
    .query()
    .where({ status: 'active' })
    .where({ role: 'admin' })
    .orderBy('createdAt', 'desc')
    .limit(10)
    .findMany();

// ❌ Less readable: Nested options
const users = await userRepo.findWhere(
    { status: 'active', role: 'admin' },
    { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 10 }
);
```

**2. Build queries conditionally:**

```typescript
// ✅ Good: Build query dynamically
let query = userRepo.query();

if (filters.status) {
    query = query.where({ status: filters.status });
}

if (filters.role) {
    query = query.where({ role: filters.role });
}

if (sortBy) {
    query = query.orderBy(sortBy, sortDirection);
}

const results = await query.limit(20).findMany();
```

**3. Reuse common queries:**

```typescript
// ✅ Good: Define reusable base queries
class UserRepository extends Repository<typeof users> {
    private activeUsersQuery() {
        return this.query().where({ status: 'active' });
    }

    async findActiveUsers(limit = 10) {
        return this.activeUsersQuery().limit(limit).findMany();
    }

    async countActiveUsers() {
        return this.activeUsersQuery().count();
    }
}
```

**4. Use findOne() instead of findMany()[0]:**

```typescript
// ✅ Good: Uses LIMIT 1 in SQL
const user = await userRepo
    .query()
    .where({ email: 'john@example.com' })
    .findOne();

// ❌ Bad: Fetches all, takes first in JS
const users = await userRepo
    .query()
    .where({ email: 'john@example.com' })
    .findMany();
const user = users[0];
```

---

## JPA-Style Relation Loading

SPFN Repository supports JPA-style relation loading using Drizzle's relational query API. This allows you to eagerly load related entities in a single query, similar to Spring JPA's `@EntityGraph`.

### Setup

To use relation loading, you need to:

1. **Define relations** using Drizzle's `relations()` function
2. **Initialize database with schema** containing your relations

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { id, timestamps } from '@spfn/core/db';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

// Define tables
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    name: text('name'),
    ...timestamps()
});

export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    content: text('content'),
    authorId: foreignKey('author', () => users.id),
    ...timestamps()
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
    posts: many(posts)
}));

export const postsRelations = relations(posts, ({ one }) => ({
    author: one(users, {
        fields: [posts.authorId],
        references: [users.id]
    })
}));

// Initialize database WITH schema
const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, {
    schema: {
        users,
        posts,
        usersRelations,
        postsRelations
    }
});
```

### findByIdWith(id, options)

Find record by ID with related entities.

```typescript
import { Repository } from '@spfn/core/db';
import { users } from './schema';

const userRepo = new Repository(users);

// Load user with posts
const user = await userRepo.findByIdWith(1, {
    with: { posts: true }
});

console.log(user.posts); // Array of post objects

// Load nested relations
const userWithPostComments = await userRepo.findByIdWith(1, {
    with: {
        posts: {
            with: { comments: true }
        }
    }
});

// Load multiple relations
const userWithAll = await userRepo.findByIdWith(1, {
    with: {
        posts: true,
        profile: true,
        followers: true
    }
});
```

**Parameters:**
- `id: number | string` - Primary key value
- `options: FindByIdOptions` - Relation loading options
  - `with?: Record<string, boolean | WithOptions>` - Relations to load

**Returns:** `Promise<T & Relations>` - Record with loaded relations

**Throws:** `QueryError` if db.query API is not configured

---

### findManyWith(options)

Find multiple records with related entities.

```typescript
// Load all users with their posts
const users = await userRepo.findManyWith({
    with: { posts: true }
});

// With where clause
import { eq } from 'drizzle-orm';
const activeUsers = await userRepo.findManyWith({
    where: eq(users.status, 'active'),
    with: { posts: true, profile: true }
});

// Nested relations
const usersWithData = await userRepo.findManyWith({
    with: {
        posts: {
            with: { comments: true }
        },
        profile: true
    }
});
```

**Parameters:**
- `options: FindManyWithOptions`
  - `where?: SQL<unknown>` - Optional WHERE condition
  - `with?: Record<string, boolean | WithOptions>` - Relations to load

**Returns:** `Promise<Array<T & Relations>>` - Array of records with relations

**Throws:** `QueryError` if db.query API is not configured

---

### findOneWith(options)

Find single record with related entities.

```typescript
import { eq } from 'drizzle-orm';

// Find user by email with posts
const user = await userRepo.findOneWith({
    where: eq(users.email, 'john@example.com'),
    with: { posts: true }
});

// With nested relations
const userWithData = await userRepo.findOneWith({
    where: eq(users.id, 1),
    with: {
        posts: {
            with: { comments: { with: { author: true } } }
        },
        profile: true
    }
});
```

**Parameters:**
- `options: FindOneWithOptions`
  - `where: SQL<unknown>` - WHERE condition (required)
  - `with?: Record<string, boolean | WithOptions>` - Relations to load

**Returns:** `Promise<(T & Relations) | undefined>` - Record with relations or undefined

**Throws:** `QueryError` if db.query API is not configured

---

### Relation Loading Best Practices

**1. Configure schema during initialization**

```typescript
// ✅ Good: Include schema with relations
const db = drizzle(client, {
    schema: { users, posts, usersRelations, postsRelations }
});

// ❌ Bad: No schema
const db = drizzle(client); // Relation methods will throw errors
```

**2. Define bidirectional relations**

```typescript
// ✅ Good: Define both sides
export const usersRelations = relations(users, ({ many }) => ({
    posts: many(posts)
}));

export const postsRelations = relations(posts, ({ one }) => ({
    author: one(users, { fields: [posts.authorId], references: [users.id] })
}));
```

**3. Use selective loading**

```typescript
// ✅ Good: Load only what you need
const user = await userRepo.findByIdWith(1, {
    with: { posts: true }
});

// ❌ Bad: Loading everything
const user = await userRepo.findByIdWith(1, {
    with: {
        posts: true,
        followers: true,
        following: true,
        comments: true,
        likes: true
    }
});
```

**4. Avoid N+1 queries**

```typescript
// ❌ Bad: N+1 queries
const users = await userRepo.findAll();
for (const user of users) {
    const posts = await postRepo.findWhere({ authorId: user.id });
}

// ✅ Good: Single query with relations
const users = await userRepo.findManyWith({
    with: { posts: true }
});
```

---

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
import { Transactional, Repository } from '@spfn/core/db';
import { users, profiles } from './schema';

const app = createApp();

app.bind(
    createUserContract,
    Transactional(),
    async (c) => {
        const userRepo = new Repository(users);
        const profileRepo = new Repository(profiles);

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
import { Repository, id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    name: text('name'),
    ...timestamps()
});

const userRepo = new Repository(users);

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