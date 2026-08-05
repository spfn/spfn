# Entities

Define your Drizzle ORM entities here. These are your database table schemas.

## What is already in this directory

| File | Role |
| --- | --- |
| `example.entity.ts` | The `examples` table this app's repository and routes use |
| `config.ts` | Barrel that re-exports every table — this is the path drizzle-kit reads (`DRIZZLE_SCHEMA_PATH`, default `./src/server/entities/config.ts`) |

`example.entity.ts` uses SPFN's column helpers rather than hand-written columns —
prefer these in new entities so every table gets the same primary key and timestamps:

```typescript
// src/server/entities/example.entity.ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const examples = pgTable('examples', {
    id: id(),                 // bigserial primary key
    name: text('name').notNull(),
    description: text('description').notNull(),
    ...timestamps(),          // createdAt + updatedAt, timezone-aware
});

export type Example = typeof examples.$inferSelect;
export type NewExample = typeof examples.$inferInsert;
```

Add every new table to `config.ts`, or drizzle-kit will not see it.

## Defining Entities

The examples below are plain Drizzle, spelling out what `id()` and `timestamps()`
generate for you.

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
# Generate migration from your entities → src/server/drizzle/
pnpm spfn db generate

# Run migrations
pnpm spfn db migrate

# See which migrations are applied vs pending
pnpm spfn db status
```

## Learn More

- [Schema & column helpers](../../../../../packages/core/src/db/schema/README.md) — `id()`, `timestamps()`, `foreignKey()`
- [Database package](https://superfunction.xyz/docs/packages/core/db)
- [Transactions](https://superfunction.xyz/docs/packages/core/db/transaction)
- [Routing](https://superfunction.xyz/docs/packages/core/route)
- [Full-stack tutorial](https://superfunction.xyz/docs/tutorial)