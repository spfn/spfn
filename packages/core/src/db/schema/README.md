# Schema Helper Module

Reusable column definitions and schema helper functions for Drizzle ORM to reduce boilerplate and ensure consistency across database schemas.

## 📁 Architecture

```
schema/
├── helpers.ts (186줄)           # Schema helper functions
├── index.ts (6줄)               # Public API exports
└── __tests__/
    └── helpers.test.ts (266줄)  # 23 tests - 100% coverage
```

## 🚀 Quick Start

### Import

```typescript
import { id, timestamps, foreignKey, optionalForeignKey } from '@spfn/core/db/schema';
// or from @spfn/core
import { id, timestamps, foreignKey, optionalForeignKey } from '@spfn/core';
```

### Basic Usage

```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name'),
    ...timestamps(),
});

export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    content: text('content'),
    authorId: foreignKey('author', () => users.id),
    ...timestamps({ autoUpdate: true }),
});
```

## 📚 Helper Functions

### `id()`

Standard auto-incrementing primary key using `bigserial`.

**Returns:** `bigserial` column with `number` mode as primary key

**Example:**
```typescript
export const users = pgTable('users', {
    id: id(),
    email: text('email'),
});
```

**Generated SQL:**
```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT
);
```

### `timestamps(options?)`

Standard timestamp fields (`createdAt`, `updatedAt`).

**Parameters:**
- `options.autoUpdate?: boolean` - Automatically update `updatedAt` on record updates (default: `false`)

**Returns:** Object with `createdAt` and `updatedAt` columns

**Example:**
```typescript
// Without auto-update
export const users = pgTable('users', {
    id: id(),
    email: text('email'),
    ...timestamps(),
});

// With auto-update
export const posts = pgTable('posts', {
    id: id(),
    title: text('title'),
    ...timestamps({ autoUpdate: true }),
});
```

**Generated SQL:**
```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

**Auto-Update Behavior:**
- `createdAt`: Always set on creation, never updated
- `updatedAt`: Set on creation, optionally auto-updated on record updates
- Auto-update is implemented via custom marker (`__autoUpdate: true`)

### `autoUpdateTimestamp(fieldName?)`

Create custom auto-updating timestamp field.

**Parameters:**
- `fieldName?: string` - Field name in camelCase (default: `'updatedAt'`)

**Returns:** Object with timestamp column (converts camelCase to snake_case)

**Example:**
```typescript
export const posts = pgTable('posts', {
    id: id(),
    title: text('title'),
    ...timestamps(),
    ...autoUpdateTimestamp('modifiedAt'),  // Creates 'modified_at' column
});

export const articles = pgTable('articles', {
    id: id(),
    ...autoUpdateTimestamp(),  // Creates 'updated_at' column
});
```

**Generated SQL:**
```sql
CREATE TABLE posts (
    id BIGSERIAL PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);
```

**Use Cases:**
- Custom field names like `publishedAt`, `lastSeen`, `modifiedAt`
- Multiple auto-updating timestamps in one table
- Domain-specific timestamp fields

### `foreignKey(name, reference, options?)`

Required foreign key reference to another table.

**Parameters:**
- `name: string` - Column name prefix (e.g., `'author'` creates `'author_id'`)
- `reference: () => T` - Reference to parent table column
- `options.onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action'` - On delete action (default: `'cascade'`)

**Returns:** `bigserial` column with `.notNull().references()`

**Example:**
```typescript
export const posts = pgTable('posts', {
    id: id(),
    title: text('title'),
    authorId: foreignKey('author', () => users.id),
    categoryId: foreignKey('category', () => categories.id, { onDelete: 'restrict' }),
});
```

**Generated SQL:**
```sql
CREATE TABLE posts (
    id BIGSERIAL PRIMARY KEY,
    title TEXT,
    author_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id BIGSERIAL NOT NULL REFERENCES categories(id) ON DELETE RESTRICT
);
```

### `optionalForeignKey(name, reference, options?)`

Optional (nullable) foreign key reference.

**Parameters:**
- `name: string` - Column name prefix (e.g., `'reviewer'` creates `'reviewer_id'`)
- `reference: () => T` - Reference to parent table column
- `options.onDelete?: 'cascade' | 'set null' | 'restrict' | 'no action'` - On delete action (default: `'set null'`)

**Returns:** `bigserial` column with `.references()` (nullable)

**Example:**
```typescript
export const posts = pgTable('posts', {
    id: id(),
    title: text('title'),
    authorId: foreignKey('author', () => users.id),
    reviewerId: optionalForeignKey('reviewer', () => users.id),
});
```

**Generated SQL:**
```sql
CREATE TABLE posts (
    id BIGSERIAL PRIMARY KEY,
    title TEXT,
    author_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reviewer_id BIGSERIAL REFERENCES users(id) ON DELETE SET NULL
);
```

**Difference from `foreignKey()`:**
- **`foreignKey()`**: `.notNull()` - Required relationship, default `onDelete: 'cascade'`
- **`optionalForeignKey()`**: Nullable - Optional relationship, default `onDelete: 'set null'`

## 🎯 Design Patterns

### Basic Entity

```typescript
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name'),
    ...timestamps(),
});
```

### Entity with Auto-Update

```typescript
export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    content: text('content'),
    status: text('status').default('draft'),
    ...timestamps({ autoUpdate: true }),
});
```

### Entity with Relationships

```typescript
export const comments = pgTable('comments', {
    id: id(),
    content: text('content').notNull(),
    authorId: foreignKey('author', () => users.id),
    postId: foreignKey('post', () => posts.id),
    parentId: optionalForeignKey('parent', () => comments.id),
    ...timestamps(),
});
```

### Entity with Custom Timestamps

```typescript
export const articles = pgTable('articles', {
    id: id(),
    title: text('title').notNull(),
    status: text('status').default('draft'),
    ...timestamps(),
    ...autoUpdateTimestamp('publishedAt'),
    ...autoUpdateTimestamp('lastViewedAt'),
});
```

### Complex Entity

```typescript
export const orders = pgTable('orders', {
    id: id(),
    orderNumber: text('order_number').notNull().unique(),

    // Relationships
    userId: foreignKey('user', () => users.id),
    shippingAddressId: foreignKey('shipping_address', () => addresses.id, {
        onDelete: 'restrict'
    }),
    billingAddressId: optionalForeignKey('billing_address', () => addresses.id),

    // Status tracking
    status: text('status').default('pending'),

    // Timestamps
    ...timestamps(),
    ...autoUpdateTimestamp('paidAt'),
    ...autoUpdateTimestamp('shippedAt'),
    ...autoUpdateTimestamp('deliveredAt'),
});
```

## 🔧 Advanced Features

### Type Safety

All helpers are fully type-safe:

```typescript
// ✅ Type-safe foreign key
const postId = foreignKey('post', () => posts.id);  // T = PgColumn<...>

// ❌ Compile error - invalid reference
const badRef = foreignKey('post', () => 'invalid');  // Type error
```

### CamelCase to snake_case Conversion

Field names in camelCase are automatically converted to snake_case:

```typescript
const cols = autoUpdateTimestamp('publishedAt');
// Creates column: published_at

const cols2 = autoUpdateTimestamp('lastViewedAt');
// Creates column: last_viewed_at
```

### Auto-Update Marker

Columns marked for auto-update have a special `__autoUpdate` property:

```typescript
const cols = timestamps({ autoUpdate: true });
console.log(cols.updatedAt.__autoUpdate);  // true

const customCol = autoUpdateTimestamp('modifiedAt');
console.log(customCol.modifiedAt.__autoUpdate);  // true
```

This marker can be used by middleware or ORM plugins to automatically update these fields on record updates.

### Foreign Key Cascading

Different cascade behaviors for different relationships:

```typescript
export const posts = pgTable('posts', {
    // Cascade: Delete posts when user is deleted
    authorId: foreignKey('author', () => users.id, {
        onDelete: 'cascade'
    }),

    // Restrict: Prevent category deletion if posts exist
    categoryId: foreignKey('category', () => categories.id, {
        onDelete: 'restrict'
    }),

    // Set null: Clear reviewer when reviewer is deleted
    reviewerId: optionalForeignKey('reviewer', () => users.id, {
        onDelete: 'set null'
    }),
});
```

## 🧪 Testing

The schema module has comprehensive test coverage:

### Test Structure

```
schema/__tests__/
└── helpers.test.ts    # 23 tests - 100% coverage
```

### Test Coverage

- **helpers.ts**: 100% coverage (100% Stmts, 100% Branch, 100% Funcs, 100% Lines)
- **index.ts**: Export-only file (no testing required)

### Running Tests

```bash
# Run all schema tests
pnpm vitest run src/db/schema/__tests__

# Run with coverage
pnpm vitest run src/db/schema/__tests__ --coverage
```

### What's Tested

**Function Tests:**
- ✅ `id()` - bigserial primary key creation
- ✅ `timestamps()` - createdAt/updatedAt fields
- ✅ `timestamps({ autoUpdate: true })` - auto-update marker
- ✅ `autoUpdateTimestamp()` - custom timestamp fields
- ✅ `autoUpdateTimestamp(name)` - camelCase to snake_case conversion
- ✅ `foreignKey()` - required foreign key with cascade options
- ✅ `optionalForeignKey()` - optional foreign key with set null default

**Integration Tests:**
- ✅ Complete table schemas with all helpers
- ✅ Multiple foreign keys in one table
- ✅ Auto-updating timestamps combination
- ✅ Custom timestamp fields with timestamps()

### Example Test

```typescript
describe('timestamps()', () => {
    it('should create createdAt and updatedAt columns', () => {
        const cols = timestamps();

        expect(cols.createdAt).toBeDefined();
        expect(cols.updatedAt).toBeDefined();
    });

    it('should mark updatedAt for auto-update when enabled', () => {
        const cols = timestamps({ autoUpdate: true });

        expect((cols.updatedAt as any).__autoUpdate).toBe(true);
    });
});
```

## 📊 Benefits

### Code Reduction

**Before (without helpers):**
```typescript
export const users = pgTable('users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
});

export const posts = pgTable('posts', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    title: text('title').notNull(),
    authorId: bigserial('author_id', { mode: 'number' })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
});
```

**After (with helpers):**
```typescript
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),
    ...timestamps(),
});

export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),
    ...timestamps(),
});
```

**Result:**
- 📉 **60% less code**
- ✨ **More readable**
- 🔒 **Consistent patterns**
- 🛡️ **Type-safe**

### Consistency

All tables follow the same patterns:
- `id` is always bigserial number mode primary key
- Timestamps always have timezone and default to NOW()
- Foreign keys follow consistent naming (`{name}_id`)

### Maintainability

Changes to common patterns only need to be made in one place:

```typescript
// Want to change all IDs to UUID?
// Just update id() helper function
export function id() {
    return uuid('id').defaultRandom().primaryKey();
}

// All tables now use UUID automatically
```

## 🔗 Related Modules

- `../manager/` - Database connection management
- `../transaction/` - Transaction middleware
- `../repository/` - Repository pattern implementation
- `../../logger/` - Structured logging

## 📚 Additional Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [PostgreSQL Data Types](https://www.postgresql.org/docs/current/datatype.html)
- [Foreign Key Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)