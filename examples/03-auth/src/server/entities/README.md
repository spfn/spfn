# Entities

Define your Drizzle ORM entities here. These are your database table schemas.

## Defining Entities

Create entity files using Drizzle ORM's `pgTable` for the public schema:

```typescript
// src/server/entities/users.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type inference for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

## Entity with Relationships

```typescript
// src/server/entities/posts.ts
import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

export const posts = pgTable('posts', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
```

## Indexes and Constraints

Use the array callback pattern to define indexes and constraints:

```typescript
// src/server/entities/products.ts
import { pgTable, serial, text, numeric, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const products = pgTable('products', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    sku: text('sku').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    categoryId: integer('category_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    // Simple index on single column
    index('products_name_idx').on(table.name),

    // Unique index
    uniqueIndex('products_sku_unique_idx').on(table.sku),

    // Composite index on multiple columns
    index('products_category_price_idx').on(table.categoryId, table.price),

    // Index on expression (PostgreSQL)
    index('products_name_lower_idx').on(sql`lower(${table.name})`),
]);
```

**Common index patterns:**
- `index('name')` - Standard B-tree index
- `uniqueIndex('name')` - Unique constraint with index
- Composite indexes - Order columns by selectivity (most selective first)
- Lowercase indexes - For case-insensitive searches

## Database Migration

```bash
# Generate migration from your entities
npx spfn db generate

# Run migrations
npx spfn db migrate
```

## Learn More

- [Getting Started](https://spfn.dev/docs/getting-started)
- [Routing Guide](https://spfn.dev/docs/routing)
- [Database Helpers](https://spfn.dev/docs/database)
- [Transaction Management](https://spfn.dev/docs/transactions)