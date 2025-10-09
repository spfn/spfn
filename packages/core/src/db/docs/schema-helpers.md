# Schema Helpers

Reusable helpers for common Drizzle ORM schema patterns.

## Overview

Schema helpers provide standardized, reusable column definitions for common patterns like primary keys, timestamps, and foreign keys. They ensure consistency across your database schema.

**Benefits:**
- Consistent column types and constraints
- Less boilerplate code
- Type-safe foreign key references
- Built-in best practices (e.g., timezone-aware timestamps)

## Quick Reference

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey, optionalForeignKey } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),                    // Primary key
    email: text('email').notNull(),
    ...timestamps()              // createdAt + updatedAt
});

export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),  // Required FK
    categoryId: optionalForeignKey('category', () => categories.id),  // Optional FK
    ...timestamps()
});
```

## id()

Generate a standard primary key column.

```typescript
import { id } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull()
});
```

**Generated Column:**
```typescript
bigserial('id', { mode: 'number' }).primaryKey()
```

**Properties:**
- Type: `bigserial` (PostgreSQL `BIGSERIAL`)
- Mode: `number` (TypeScript `number` type)
- Constraint: Primary key
- Auto-increment: Yes

**Usage in Queries:**
```typescript
const user = await db.select().from(users).where(eq(users.id, 123));
```

**Type Safety:**
```typescript
type User = typeof users.$inferSelect;
// { id: number; email: string; ... }

type InsertUser = typeof users.$inferInsert;
// { id?: number; email: string; ... } - id is optional
```

---

## timestamps()

Generate `createdAt` and `updatedAt` timestamp columns.

```typescript
import { timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    ...timestamps()  // Spreads createdAt and updatedAt
});
```

**Generated Columns:**
```typescript
{
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull()
}
```

**Properties:**
- `createdAt`: Set automatically on insert, never changes
- `updatedAt`: Set automatically on insert and update
- Type: `timestamp with time zone`
- Mode: `date` (TypeScript `Date` type)
- Default: `NOW()` (current timestamp)
- Nullable: No

**Usage in Queries:**
```typescript
// Filter by date
const recentUsers = await db
    .select()
    .from(users)
    .where(gte(users.createdAt, new Date('2024-01-01')));

// Sort by date
const sorted = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));
```

**Updating updatedAt:**

You must manually update `updatedAt` when modifying records:

```typescript
// ✅ Correct: Explicitly update updatedAt
await db
    .update(users)
    .set({
        name: 'New Name',
        updatedAt: new Date()  // Manual update
    })
    .where(eq(users.id, 123));

// ❌ Wrong: updatedAt not updated
await db
    .update(users)
    .set({ name: 'New Name' })
    .where(eq(users.id, 123));
```

**Repository handles this automatically:**
```typescript
const userRepo = new Repository(users);

// updatedAt is automatically set
await userRepo.update(123, { name: 'New Name' });
```

---

## foreignKey(name, reference, options?)

Create a type-safe foreign key reference.

```typescript
import { foreignKey } from '@spfn/core/db';

export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),
    ...timestamps()
});
```

**Parameters:**
- `name: string` - Descriptive name for the column (becomes `{name}_id`)
- `reference: () => Column` - Function returning the referenced column
- `options?: ForeignKeyOptions` - Optional configuration

**Generated Column:**
```typescript
bigserial('author_id', { mode: 'number' })
    .notNull()
    .references(() => users.id)
```

**Column Name:** `{name}_id` (e.g., `author_id`, `category_id`)

**Properties:**
- Type: `bigserial` (matches primary key type)
- Mode: `number`
- Constraint: Foreign key to referenced table
- Nullable: No (required relationship)

**Usage in Queries:**
```typescript
// Join tables
const postsWithAuthors = await db
    .select({
        post: posts,
        author: users
    })
    .from(posts)
    .leftJoin(users, eq(posts.authorId, users.id));

// Filter by foreign key
const userPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.authorId, 123));
```

**Type Safety:**
```typescript
type Post = typeof posts.$inferSelect;
// { id: number; title: string; authorId: number; ... }

// TypeScript ensures authorId is a number matching users.id type
const post: Post = {
    id: 1,
    title: 'Hello',
    authorId: 123,  // Must be number
    createdAt: new Date(),
    updatedAt: new Date()
};
```

**Referential Integrity:**
```typescript
// ❌ Error: Foreign key constraint violation
await db.insert(posts).values({
    title: 'Post',
    authorId: 999  // User 999 doesn't exist
});

// ✅ Valid: User exists
const user = await db.insert(users).values({ email: 'test@example.com' });
await db.insert(posts).values({
    title: 'Post',
    authorId: user[0].id
});
```

---

## optionalForeignKey(name, reference, options?)

Create an optional (nullable) foreign key reference.

```typescript
import { optionalForeignKey } from '@spfn/core/db';

export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),  // Required
    categoryId: optionalForeignKey('category', () => categories.id),  // Optional
    ...timestamps()
});
```

**Parameters:**
- `name: string` - Descriptive name for the column
- `reference: () => Column` - Function returning the referenced column
- `options?: ForeignKeyOptions` - Optional configuration

**Generated Column:**
```typescript
bigserial('category_id', { mode: 'number' })
    .references(() => categories.id)
// Note: No .notNull() - can be null
```

**Difference from foreignKey():**
- `foreignKey()`: `.notNull()` - relationship is required
- `optionalForeignKey()`: No `.notNull()` - relationship is optional

**Usage in Queries:**
```typescript
// Posts without category
const uncategorized = await db
    .select()
    .from(posts)
    .where(isNull(posts.categoryId));

// Posts with category
const categorized = await db
    .select()
    .from(posts)
    .where(isNotNull(posts.categoryId));

// Left join (includes posts without category)
const postsWithCategories = await db
    .select({
        post: posts,
        category: categories
    })
    .from(posts)
    .leftJoin(categories, eq(posts.categoryId, categories.id));
```

**Type Safety:**
```typescript
type Post = typeof posts.$inferSelect;
// { id: number; title: string; authorId: number; categoryId: number | null; ... }

// TypeScript allows null for optional foreign keys
const post: Post = {
    id: 1,
    title: 'Uncategorized Post',
    authorId: 123,
    categoryId: null,  // OK - optional
    createdAt: new Date(),
    updatedAt: new Date()
};
```

## Advanced Usage

### Custom Foreign Key Options

```typescript
export const posts = pgTable('posts', {
    id: id(),
    authorId: foreignKey('author', () => users.id, {
        onDelete: 'cascade',   // Delete posts when user is deleted
        onUpdate: 'cascade'    // Update posts when user.id changes
    }),
    ...timestamps()
});
```

**Available Options:**
```typescript
interface ForeignKeyOptions {
    onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action';
    onUpdate?: 'cascade' | 'set null' | 'restrict' | 'no action';
}
```

**Cascading Behaviors:**
- `cascade`: Automatically delete/update referencing rows
- `set null`: Set foreign key to null (requires optional FK)
- `restrict`: Prevent deletion/update if references exist
- `no action`: Like restrict, but check is deferred

### Multiple Foreign Keys

```typescript
export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),
    editorId: optionalForeignKey('editor', () => users.id),
    categoryId: optionalForeignKey('category', () => categories.id),
    ...timestamps()
});
```

### Self-Referencing Foreign Keys

```typescript
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    managerId: optionalForeignKey('manager', () => users.id),  // Self-reference
    ...timestamps()
});

// Query organization hierarchy
const usersWithManagers = await db
    .select({
        user: users,
        manager: aliasedTable(users, 'manager')
    })
    .from(users)
    .leftJoin(
        aliasedTable(users, 'manager'),
        eq(users.managerId, aliasedTable(users, 'manager').id)
    );
```

### PostgreSQL Schema Namespaces

Use `pgSchema` to organize tables into separate PostgreSQL schemas (namespaces):

```typescript
import { pgSchema, text } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core/db';

// Define schema namespace
export const authSchema = pgSchema('app_auth');

// Tables in app_auth schema
export const users = authSchema.table('users', {
    id: id(),
    email: text('email').notNull().unique(),
    ...timestamps()
});

export const sessions = authSchema.table('sessions', {
    id: id(),
    userId: foreignKey('user', () => users.id),
    token: text('token').notNull(),
    ...timestamps()
});
```

**Benefits:**
- Namespace isolation (e.g., `app_auth.users` vs `public.users`)
- Avoid table name conflicts
- Organize related tables together
- Better permission management

**Cross-Schema References:**

You can reference tables from different schemas:

```typescript
import { pgSchema } from 'drizzle-orm/pg-core';
import { id, foreignKey } from '@spfn/core/db';

// Auth schema
export const authSchema = pgSchema('app_auth');
export const users = authSchema.table('users', {
    id: id(),
    email: text('email').notNull()
});

// Main schema (public)
export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    // Reference table from different schema
    authorId: foreignKey('author', () => users.id),
    ...timestamps()
});
```

**Generated SQL:**
```sql
CREATE SCHEMA IF NOT EXISTS "app_auth";

CREATE TABLE "app_auth"."users" (
  "id" BIGSERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE "public"."posts" (
  "id" BIGSERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "author_id" BIGSERIAL NOT NULL REFERENCES "app_auth"."users"("id"),
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

**Real-World Example (@spfn/auth):**

```typescript
import { pgSchema, text, boolean } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core/db';

// Dedicated schema for auth module
export const spfnAuth = pgSchema('spfn_auth');

export const users = spfnAuth.table('users', {
    id: id(),
    email: text('email').notNull().unique(),
    password: text('password'),
    emailVerified: boolean('email_verified').default(false).notNull(),
    ...timestamps()
});

export const userKeys = spfnAuth.table('user_keys', {
    id: id(),
    userId: foreignKey('user', () => users.id),
    keyId: text('key_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    ...timestamps()
});
```

### Composite Foreign Keys

For composite foreign keys, use raw Drizzle:

```typescript
import { pgTable, text, bigserial, foreignKey } from 'drizzle-orm/pg-core';

export const orderItems = pgTable('order_items', {
    orderId: bigserial('order_id', { mode: 'number' }).notNull(),
    productId: bigserial('product_id', { mode: 'number' }).notNull(),
    quantity: integer('quantity').notNull(),
    ...timestamps()
}, (table) => ({
    // Composite foreign key
    orderProductFk: foreignKey({
        columns: [table.orderId, table.productId],
        foreignColumns: [orders.id, products.id]
    })
}));
```

## Common Patterns

### User Profile (One-to-One)

```typescript
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    ...timestamps()
});

export const profiles = pgTable('profiles', {
    id: id(),
    userId: foreignKey('user', () => users.id),  // One-to-one
    bio: text('bio'),
    avatar: text('avatar'),
    ...timestamps()
});
```

### Blog Posts (One-to-Many)

```typescript
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    ...timestamps()
});

export const posts = pgTable('posts', {
    id: id(),
    authorId: foreignKey('author', () => users.id),  // Many posts per user
    title: text('title').notNull(),
    content: text('content'),
    ...timestamps()
});
```

### Tags (Many-to-Many)

```typescript
export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    ...timestamps()
});

export const tags = pgTable('tags', {
    id: id(),
    name: text('name').notNull().unique(),
    ...timestamps()
});

// Junction table
export const postTags = pgTable('post_tags', {
    id: id(),
    postId: foreignKey('post', () => posts.id),
    tagId: foreignKey('tag', () => tags.id),
    ...timestamps()
});
```

### Soft Deletes

```typescript
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    ...timestamps()
});

// Query only active users
const activeUsers = await db
    .select()
    .from(users)
    .where(isNull(users.deletedAt));

// Soft delete
await db
    .update(users)
    .set({ deletedAt: new Date() })
    .where(eq(users.id, 123));
```

## Type Inference

Schema helpers work seamlessly with Drizzle's type inference:

```typescript
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    ...timestamps()
});

// Infer select type (what you get from database)
type User = typeof users.$inferSelect;
// {
//   id: number;
//   email: string;
//   createdAt: Date;
//   updatedAt: Date;
// }

// Infer insert type (what you provide for insert)
type InsertUser = typeof users.$inferInsert;
// {
//   id?: number;           // Optional - auto-generated
//   email: string;
//   createdAt?: Date;      // Optional - has default
//   updatedAt?: Date;      // Optional - has default
// }

// Use in functions
async function createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
}
```

## Best Practices

### 1. Always Use id()

```typescript
// ✅ Good: Consistent primary key
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull()
});

// ❌ Bad: Manual primary key definition
export const users = pgTable('users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').notNull()
});
```

### 2. Always Use timestamps()

```typescript
// ✅ Good: Automatic audit trail
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    ...timestamps()
});

// ❌ Bad: Manual timestamp definition or missing
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull()
});
```

### 3. Use foreignKey() for Required Relationships

```typescript
// ✅ Good: Required relationship
export const posts = pgTable('posts', {
    id: id(),
    authorId: foreignKey('author', () => users.id),  // Every post has author
    ...timestamps()
});

// ❌ Bad: Optional when it should be required
export const posts = pgTable('posts', {
    id: id(),
    authorId: optionalForeignKey('author', () => users.id),
    ...timestamps()
});
```

### 4. Use optionalForeignKey() for Optional Relationships

```typescript
// ✅ Good: Optional relationship
export const posts = pgTable('posts', {
    id: id(),
    categoryId: optionalForeignKey('category', () => categories.id),
    ...timestamps()
});

// ❌ Bad: Required when it should be optional
export const posts = pgTable('posts', {
    id: id(),
    categoryId: foreignKey('category', () => categories.id),
    ...timestamps()
});
```

### 5. Use Descriptive Names

```typescript
// ✅ Good: Clear, descriptive names
export const posts = pgTable('posts', {
    id: id(),
    authorId: foreignKey('author', () => users.id),
    editorId: optionalForeignKey('editor', () => users.id),
    ...timestamps()
});

// ❌ Bad: Generic names
export const posts = pgTable('posts', {
    id: id(),
    userId1: foreignKey('user1', () => users.id),
    userId2: optionalForeignKey('user2', () => users.id),
    ...timestamps()
});
```

## Migration Generation

Schema helpers work with Drizzle Kit migrations:

```bash
# Generate migration
npm run db:generate

# Resulting migration
CREATE TABLE "users" (
  "id" BIGSERIAL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE "posts" (
  "id" BIGSERIAL PRIMARY KEY,
  "author_id" BIGSERIAL NOT NULL REFERENCES "users"("id"),
  "category_id" BIGSERIAL REFERENCES "categories"("id"),
  "title" TEXT NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```