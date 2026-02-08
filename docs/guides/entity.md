---
title: "Entity"
description: "Database schema definition with Drizzle ORM and reusable column helpers"
order: 10
available: true
---

# Entity

Entities define your database schema using Drizzle ORM with SPFN's reusable column helpers. Helpers provide consistent naming, types, and conventions across all tables.

## Basic Entity

```typescript
// src/server/entities/users.ts
import { pgTable, text, boolean } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    role: text('role', { enum: ['admin', 'user', 'guest'] }).notNull().default('user'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
});

// Type inference from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

## Column Helpers

### id()

Auto-incrementing bigserial primary key.

```typescript
import { id } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),  // bigserial primary key
});
```

### uuid()

UUID primary key with auto-generation via `gen_random_uuid()`.

```typescript
import { uuid } from '@spfn/core/db';

export const sessions = pgTable('sessions', {
    id: uuid(),  // uuid with gen_random_uuid()
});
```

### timestamps()

Standard `createdAt`/`updatedAt` fields with `timestamptz`.

```typescript
import { timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    name: text('name'),
    ...timestamps(),
    // createdAt: timestamptz, not null, default now()
    // updatedAt: timestamptz, not null, default now()
});
```

### foreignKey()

Required foreign key with cascade delete (default).

```typescript
import { foreignKey } from '@spfn/core/db';

export const posts = pgTable('posts', {
    id: id(),
    authorId: foreignKey('author', () => users.id),
    // author_id bigserial NOT NULL REFERENCES users(id) ON DELETE CASCADE
});

// Custom options
authorId: foreignKey('author', () => users.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
})
```

### optionalForeignKey()

Nullable foreign key with set null on delete (default).

```typescript
import { optionalForeignKey } from '@spfn/core/db';

export const posts = pgTable('posts', {
    id: id(),
    categoryId: optionalForeignKey('category', () => categories.id),
    // category_id bigserial REFERENCES categories(id) ON DELETE SET NULL
});
```

### auditFields()

User tracking fields for create/update attribution.

```typescript
import { auditFields } from '@spfn/core/db';

export const posts = pgTable('posts', {
    id: id(),
    ...auditFields(),
    // createdBy: text (nullable)
    // updatedBy: text (nullable)
});
```

### publishingFields()

Content publishing timestamp and attribution.

```typescript
import { publishingFields } from '@spfn/core/db';

export const articles = pgTable('articles', {
    id: id(),
    ...publishingFields(),
    // publishedAt: timestamptz (nullable)
    // publishedBy: text (nullable)
});
```

### softDelete()

Soft deletion fields for recoverable deletes.

```typescript
import { softDelete } from '@spfn/core/db';

export const posts = pgTable('posts', {
    id: id(),
    ...softDelete(),
    // deletedAt: timestamptz (nullable)
    // deletedBy: text (nullable)
});
```

### verificationTimestamp()

Custom verification timestamp field.

```typescript
import { verificationTimestamp } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    ...verificationTimestamp('emailVerified'),  // emailVerifiedAt
    ...verificationTimestamp('phoneVerified'),  // phoneVerifiedAt
});
```

### utcTimestamp()

UTC timestamp field with optional string mode.

```typescript
import { utcTimestamp } from '@spfn/core/db';

export const events = pgTable('events', {
    id: id(),
    scheduledAt: utcTimestamp('scheduled_at').notNull(),
    processedAt: utcTimestamp('processed_at', 'string'),  // ISO string mode
});
```

### enumText()

Type-safe enum text field.

```typescript
import { enumText } from '@spfn/core/db';

const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;

export const users = pgTable('users', {
    id: id(),
    status: enumText('status', USER_STATUSES).default('active').notNull(),
});

// TypeScript type: 'active' | 'inactive' | 'suspended'
```

### typedJsonb()

Type-safe JSONB field with TypeScript inference.

```typescript
import { typedJsonb } from '@spfn/core/db';

type UserMetadata = {
    preferences: { theme: 'light' | 'dark' };
    settings: Record<string, any>;
};

export const users = pgTable('users', {
    id: id(),
    metadata: typedJsonb<UserMetadata>('metadata').notNull(),
});

// user.metadata.preferences.theme is typed
```

## Column Helper Summary

| Helper | Output | Description |
|--------|--------|-------------|
| `id()` | bigserial PK | Auto-incrementing primary key |
| `uuid()` | uuid PK | UUID with gen_random_uuid() |
| `timestamps()` | createdAt, updatedAt | Timestamptz with defaults |
| `foreignKey(name, ref)` | NOT NULL FK | Required foreign key (cascade delete) |
| `optionalForeignKey(name, ref)` | nullable FK | Optional foreign key (set null) |
| `auditFields()` | createdBy, updatedBy | User attribution fields |
| `publishingFields()` | publishedAt, publishedBy | Publishing metadata |
| `softDelete()` | deletedAt, deletedBy | Soft deletion fields |
| `verificationTimestamp(name)` | {name}At | Custom verification timestamp |
| `utcTimestamp(col, mode?)` | timestamptz | UTC timestamp column |
| `enumText(col, values)` | text enum | Type-safe enum text |
| `typedJsonb<T>(col)` | jsonb | Type-safe JSONB |

## Indexes & Constraints

### Column-level Constraints

```typescript
import { pgTable, text, integer, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),        // UNIQUE
    age: integer('age').notNull().default(0),        // DEFAULT
    isActive: boolean('is_active').notNull(),        // NOT NULL
    ...timestamps(),
});
```

### Table-level Indexes

```typescript
import { pgTable, text, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    organizationId: text('organization_id'),
    ...timestamps(),
}, (table) => [
    index('users_email_idx').on(table.email),
    uniqueIndex('users_email_unique').on(table.email),
    index('users_org_name_idx').on(table.organizationId, table.name),
]);
```

### Composite Primary Key

```typescript
import { pgTable, text, primaryKey } from 'drizzle-orm/pg-core';

export const userRoles = pgTable('user_roles', {
    userId: text('user_id').notNull(),
    roleId: text('role_id').notNull(),
}, (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
]);
```

### Composite Unique Constraint

```typescript
import { pgTable, text, unique } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
    id: id(),
    userId: text('user_id').notNull(),
    type: text('type').notNull(),
    ...timestamps(),
}, (table) => [
    unique('profiles_user_type_unique').on(table.userId, table.type),
]);
```

### Check Constraints

```typescript
import { pgTable, integer, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const products = pgTable('products', {
    id: id(),
    price: integer('price').notNull(),
    quantity: integer('quantity').notNull(),
    ...timestamps(),
}, (table) => [
    check('price_positive', sql`${table.price} > 0`),
    check('quantity_non_negative', sql`${table.quantity} >= 0`),
]);
```

### Partial Indexes

```typescript
import { pgTable, text, boolean, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
}, (table) => [
    index('users_active_email_idx')
        .on(table.email)
        .where(sql`${table.isActive} = true`),
]);
```

## Relations

### One-to-Many

```typescript
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ many }) => ({
    posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
    author: one(users, {
        fields: [posts.authorId],
        references: [users.id],
    }),
}));
```

### Many-to-Many

```typescript
export const users = pgTable('users', {
    id: id(),
    name: text('name').notNull(),
});

export const roles = pgTable('roles', {
    id: id(),
    name: text('name').notNull(),
});

// Junction table
export const userRoles = pgTable('user_roles', {
    userId: foreignKey('user', () => users.id),
    roleId: foreignKey('role', () => roles.id),
});

export const usersRelations = relations(users, ({ many }) => ({
    userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
    userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
    user: one(users, {
        fields: [userRoles.userId],
        references: [users.id],
    }),
    role: one(roles, {
        fields: [userRoles.roleId],
        references: [roles.id],
    }),
}));
```

## Schema Namespacing

For package-based schema isolation with PostgreSQL schemas:

```typescript
import { createSchema, packageNameToSchema } from '@spfn/core/db';

// Create namespaced schema
const schema = createSchema('@spfn/cms');
// Creates PostgreSQL schema: spfn_cms

export const labels = schema.table('labels', {
    id: id(),
    name: text('name').notNull(),
    ...timestamps(),
});
// Creates table: spfn_cms.labels

// Utility functions
packageNameToSchema('@spfn/cms');      // 'spfn_cms'
packageNameToSchema('@company/auth');  // 'company_auth'
packageNameToSchema('spfn-storage');   // 'spfn_storage'
```

## Entity Export Pattern

```typescript
// src/server/entities/index.ts
export * from './users';
export * from './posts';
export * from './categories';

// Re-export relations
export * from './relations';
```

## Migration Commands

```bash
# Generate migration from schema changes
npx spfn db generate

# Apply pending migrations
npx spfn db migrate

# View database with Drizzle Studio
pnpm drizzle-kit studio
```

## Best Practices

```typescript
// 1. Use column helpers for consistency
export const users = pgTable('users', {
    id: id(),
    ...timestamps(),
});

// 2. Define types from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// 3. Use enum helpers for type safety
status: enumText('status', ['active', 'inactive']).notNull()

// 4. Use foreignKey helpers
authorId: foreignKey('author', () => users.id)

// 5. Don't put business logic in entity files
// Entity = schema only. Logic belongs in repositories.
```

## Related

- [Database](/docs/guides/database) - Database setup and connection
- [Repository](/docs/guides/repository) - Data access layer
- [Route Definition](/docs/core-concepts/contracts) - Using entities in routes
