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

## Loading Relations (Manual Joins)

SPFN Repository uses manual joins for loading related data. This provides full control and works without additional configuration.

### Basic Join Pattern

Use Drizzle's query builder for join operations:

```typescript
import { getDb } from '@spfn/core/db';
import { users, posts } from './schema';
import { eq } from 'drizzle-orm';

const db = getDb();

// Load user with posts
const userWithPosts = await db
    .select({
        user: users,
        posts: posts
    })
    .from(users)
    .leftJoin(posts, eq(posts.authorId, users.id))
    .where(eq(users.id, 1));
```

### Custom Repository Methods

Create dedicated methods in custom repositories:

```typescript
import { Repository } from '@spfn/core/db';
import { users, posts } from './schema';
import { eq } from 'drizzle-orm';

class UserRepository extends Repository<typeof users> {
    async findWithPosts(userId: number) {
        const db = this.getReadDb();

        // Get user and their posts separately
        const user = await this.findById(userId);
        if (!user) return null;

        const userPosts = await db
            .select()
            .from(posts)
            .where(eq(posts.authorId, userId));

        return {
            ...user,
            posts: userPosts
        };
    }

    async findAllWithPostCount() {
        const db = this.getReadDb();
        const { sql } = await import('drizzle-orm');

        return db
            .select({
                id: users.id,
                email: users.email,
                name: users.name,
                postCount: sql<number>`count(${posts.id})`.as('post_count')
            })
            .from(users)
            .leftJoin(posts, eq(users.id, posts.authorId))
            .groupBy(users.id);
    }
}
```

### Common Join Patterns

**One-to-Many (User has many Posts):**

```typescript
import { getDb } from '@spfn/core/db';
import { users, posts } from './schema';
import { eq, sql } from 'drizzle-orm';

const db = getDb();

// Get users with post count
const usersWithCounts = await db
    .select({
        user: users,
        postCount: sql<number>`count(${posts.id})`.as('post_count')
    })
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId))
    .groupBy(users.id);

// Get user's posts separately (cleaner)
const user = await userRepo.findById(1);
const userPosts = await postRepo.findWhere({ authorId: user.id });
```

**Many-to-One (Post belongs to User):**

```typescript
// Load post with author
const postWithAuthor = await db
    .select({
        post: posts,
        author: users
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .where(eq(posts.id, 1))
    .then(results => results[0]);
```

**Many-to-Many (via junction table):**

```typescript
// Example: Users and Tags through user_tags table
import { userTags, tags } from './schema';

const userWithTags = await db
    .select({
        user: users,
        tag: tags
    })
    .from(users)
    .leftJoin(userTags, eq(users.id, userTags.userId))
    .leftJoin(tags, eq(userTags.tagId, tags.id))
    .where(eq(users.id, 1));
```

### Advanced Queries

**Subqueries:**

```typescript
// Get users who have published posts
const activeAuthors = await db
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

**Multiple Joins:**

```typescript
// Load posts with authors and categories
const enrichedPosts = await db
    .select({
        post: posts,
        author: users,
        category: categories
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id))
    .leftJoin(categories, eq(posts.categoryId, categories.id));
```

### Best Practices

**1. Avoid N+1 Queries:**

```typescript
// ❌ Bad: N+1 queries
const users = await userRepo.findAll();
for (const user of users) {
    const posts = await postRepo.findWhere({ authorId: user.id });
}

// ✅ Good: Single aggregation query
const usersWithPostCount = await db
    .select({
        user: users,
        postCount: sql<number>`count(${posts.id})`
    })
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId))
    .groupBy(users.id);

// ✅ Good: Batch load with IN query
const userIds = users.map(u => u.id);
const allPosts = await postRepo.findWhere({ authorId: { in: userIds } });
const postsGrouped = allPosts.reduce((acc, post) => {
    if (!acc[post.authorId]) acc[post.authorId] = [];
    acc[post.authorId].push(post);
    return acc;
}, {});
```

**2. Use Repository for Simple Queries, Raw Drizzle for Complex:**

```typescript
// ✅ Good: Simple = Repository
const user = await userRepo.findById(1);
const posts = await postRepo.findWhere({ authorId: 1 });

// ✅ Good: Complex = Raw Drizzle
const stats = await db
    .select({
        authorName: users.name,
        totalPosts: sql<number>`count(${posts.id})`,
        avgPostLength: sql<number>`avg(length(${posts.content}))`
    })
    .from(users)
    .leftJoin(posts, eq(users.id, posts.authorId))
    .groupBy(users.id)
    .having(sql`count(${posts.id}) > 5`);
```

**3. Extract to Custom Repository Methods:**

```typescript
// ✅ Good: Reusable methods
class PostRepository extends Repository<typeof posts> {
    async findByAuthor(authorId: number) {
        return this.findWhere({ authorId });
    }

    async findPublishedWithAuthor() {
        const db = this.getReadDb();
        return db
            .select({ post: posts, author: users })
            .from(posts)
            .leftJoin(users, eq(posts.authorId, users.id))
            .where(eq(posts.status, 'published'));
    }
}
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