# @spfn/core/query - Query Parameter Parser

URL query parameter parsing for dynamic filtering, sorting, and pagination with Drizzle ORM.

## Features

- ✅ **Dynamic Filtering**: Support for 10+ filter operators (eq, ne, gt, like, in, etc.)
- ✅ **Multiple Sort Fields**: Sort by multiple fields with asc/desc directions
- ✅ **Pagination**: Automatic pagination with metadata generation
- ✅ **Type-Safe**: Full TypeScript support with Drizzle ORM integration
- ✅ **Security**: Whitelist-based field validation
- ✅ **Auto Type Conversion**: Automatic conversion of numbers and booleans

---

## Quick Start

### Basic Usage

```typescript
import { QueryParser, buildFilters, buildSort, applyPagination } from '@spfn/core';
import { users } from './schema';

// 1. Apply middleware to parse query parameters
export const middlewares = [
  QueryParser({
    filters: ['email', 'role', 'status'],
    sort: ['createdAt', 'name'],
    pagination: { default: 20, max: 100 }
  })
];

// 2. Use in handler
export async function GET(c: RouteContext) {
  const { filters, sort, pagination } = c.get('queryParams');

  const whereCondition = buildFilters(filters, users);
  const orderBy = buildSort(sort, users);
  const { offset, limit } = applyPagination(pagination);

  const data = await db
    .select()
    .from(users)
    .where(whereCondition)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  const total = await countTotal(db, users, whereCondition);
  const meta = createPaginationMeta(pagination, total);

  return c.json({ data, meta });
}
```

### URL Examples

```bash
# Filter by email (equals)
GET /users?email[eq]=john@example.com

# Filter by age range
GET /users?age[gte]=18&age[lte]=65

# Filter by role (IN array)
GET /users?role[in]=admin,user

# Sort by creation date (descending) and name (ascending)
GET /users?sort=createdAt:desc,name:asc

# Pagination
GET /users?page=2&limit=50

# Combined
GET /users?status[eq]=active&role[in]=admin,user&sort=createdAt:desc&page=1&limit=20
```

---

## Filter Operators

### Comparison Operators

| Operator | Description | Example | SQL |
|----------|-------------|---------|-----|
| `eq` | Equals | `email[eq]=john@example.com` | `email = 'john@example.com'` |
| `ne` | Not equals | `status[ne]=deleted` | `status != 'deleted'` |
| `gt` | Greater than | `age[gt]=18` | `age > 18` |
| `gte` | Greater than or equal | `age[gte]=18` | `age >= 18` |
| `lt` | Less than | `score[lt]=100` | `score < 100` |
| `lte` | Less than or equal | `score[lte]=100` | `score <= 100` |

### String Operators

| Operator | Description | Example | SQL |
|----------|-------------|---------|-----|
| `like` | Partial match | `name[like]=john` | `name LIKE '%john%'` |

### Array Operators

| Operator | Description | Example | SQL |
|----------|-------------|---------|-----|
| `in` | IN array | `role[in]=admin,user` | `role IN ('admin', 'user')` |
| `nin` | NOT IN array | `status[nin]=deleted,archived` | `status NOT IN ('deleted', 'archived')` |

### NULL Operators

| Operator | Description | Example | SQL |
|----------|-------------|---------|-----|
| `is` | IS NULL / IS NOT NULL | `deletedAt[is]=null` | `deletedAt IS NULL` |
| | | `deletedAt[is]=notnull` | `deletedAt IS NOT NULL` |

---

## Filtering

### Basic Filtering

```typescript
// URL: ?email[eq]=john@example.com&status[eq]=active

const { filters } = c.get('queryParams');
// {
//   email: { eq: 'john@example.com' },
//   status: { eq: 'active' }
// }

const whereCondition = buildFilters(filters, users);
const data = await db.select().from(users).where(whereCondition);
```

### Range Filtering

```typescript
// URL: ?age[gte]=18&age[lte]=65&score[gt]=50

const whereCondition = buildFilters(filters, users);
// WHERE age >= 18 AND age <= 65 AND score > 50
```

### IN Filtering

```typescript
// URL: ?role[in]=admin,user,moderator

const whereCondition = buildFilters(filters, users);
// WHERE role IN ('admin', 'user', 'moderator')
```

### LIKE Filtering

```typescript
// URL: ?name[like]=john

const whereCondition = buildFilters(filters, users);
// WHERE name LIKE '%john%'
```

### NULL Filtering

```typescript
// URL: ?deletedAt[is]=null

const whereCondition = buildFilters(filters, users);
// WHERE deletedAt IS NULL

// URL: ?deletedAt[is]=notnull
// WHERE deletedAt IS NOT NULL
```

### OR Conditions

```typescript
import { buildFilters, orFilters } from '@spfn/core';

// (status = 'active') OR (role = 'admin')
const condition1 = buildFilters({ status: { eq: 'active' } }, users);
const condition2 = buildFilters({ role: { eq: 'admin' } }, users);
const orCondition = orFilters(condition1, condition2);

const data = await db.select().from(users).where(orCondition);
```

---

## Sorting

### Single Field Sort

```typescript
// URL: ?sort=createdAt:desc

const { sort } = c.get('queryParams');
// [{ field: 'createdAt', direction: 'desc' }]

const orderBy = buildSort(sort, users);
const data = await db.select().from(users).orderBy(...orderBy);
```

### Multiple Field Sort

```typescript
// URL: ?sort=createdAt:desc,name:asc,email:asc

const orderBy = buildSort(sort, users);
// ORDER BY createdAt DESC, name ASC, email ASC
```

### Default Direction

```typescript
// URL: ?sort=name  (defaults to 'asc')

const orderBy = buildSort(sort, users);
// ORDER BY name ASC
```

---

## Pagination

### Basic Pagination

```typescript
// URL: ?page=2&limit=20

const { pagination } = c.get('queryParams');
// { page: 2, limit: 20 }

const { offset, limit } = applyPagination(pagination);
// { offset: 20, limit: 20 }

const data = await db.select().from(users).limit(limit).offset(offset);
```

### Pagination with Total Count

```typescript
import { countTotal, createPaginationMeta } from '@spfn/core';

const total = await countTotal(db, users, whereCondition);
const meta = createPaginationMeta(pagination, total);

return c.json({
  data,
  meta: {
    page: 2,
    limit: 20,
    total: 156,
    totalPages: 8,
    hasNext: true,
    hasPrev: true
  }
});
```

### Configuration

```typescript
QueryParser({
  pagination: {
    default: 20,  // Default page size
    max: 100      // Maximum page size (enforced)
  }
})
```

---

## Complete Examples

### User List with Filters

```typescript
import { QueryParser, buildFilters, buildSort, applyPagination, countTotal, createPaginationMeta } from '@spfn/core';
import { users } from './schema';

export const middlewares = [
  QueryParser({
    filters: ['email', 'role', 'status', 'createdAt'],
    sort: ['createdAt', 'name', 'email'],
    pagination: { default: 20, max: 100 }
  })
];

export async function GET(c: RouteContext) {
  const { filters, sort, pagination } = c.get('queryParams');

  // Build WHERE condition
  const whereCondition = buildFilters(filters, users);

  // Build ORDER BY
  const orderBy = buildSort(sort, users);

  // Apply pagination
  const { offset, limit } = applyPagination(pagination);

  // Execute query
  const data = await db
    .select()
    .from(users)
    .where(whereCondition)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);

  // Get total count
  const total = await countTotal(db, users, whereCondition);

  // Create pagination metadata
  const meta = createPaginationMeta(pagination, total);

  return c.json({ data, meta });
}
```

**Example Request:**
```bash
GET /users?status[eq]=active&role[in]=admin,user&sort=createdAt:desc&page=1&limit=20
```

**Example Response:**
```json
{
  "data": [
    { "id": "1", "email": "john@example.com", "role": "admin", "status": "active" },
    { "id": "2", "email": "jane@example.com", "role": "user", "status": "active" }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Advanced Filtering with OR

```typescript
import { buildFilters, orFilters } from '@spfn/core';

export async function GET(c: RouteContext) {
  // Find users who are either:
  // 1. Admin role OR
  // 2. Active status with user role
  const adminCondition = buildFilters({ role: { eq: 'admin' } }, users);
  const activeUserCondition = buildFilters({
    status: { eq: 'active' },
    role: { eq: 'user' }
  }, users);

  const whereCondition = orFilters(adminCondition, activeUserCondition);

  const data = await db.select().from(users).where(whereCondition);

  return c.json({ data });
}
```

---

## Security

### Field Whitelisting

Only specified fields are allowed in filters and sort:

```typescript
QueryParser({
  filters: ['email', 'role', 'status'],  // Only these fields allowed in filters
  sort: ['createdAt', 'name']            // Only these fields allowed in sort
})
```

**Blocked Example:**
```bash
# This will be ignored (password not in whitelist)
GET /users?password[eq]=secret
# Console warning: [QueryParser] Field 'password' is not allowed
```

### Pagination Limits

Maximum page size is enforced:

```typescript
QueryParser({
  pagination: {
    default: 20,
    max: 100  // Users cannot request more than 100 items
  }
})
```

**Example:**
```bash
# Requested 500, but limited to 100
GET /users?limit=500
# Result: { page: 1, limit: 100 }
```

---

## Type Safety

### Filter Types

```typescript
import type { Filters, FilterOperator } from '@spfn/core';

const filters: Filters = {
  email: { eq: 'john@example.com' },
  age: { gte: 18, lte: 65 },
  role: { in: ['admin', 'user'] }
};
```

### Sort Types

```typescript
import type { SortCondition } from '@spfn/core';

const sort: SortCondition[] = [
  { field: 'createdAt', direction: 'desc' },
  { field: 'name', direction: 'asc' }
];
```

### Pagination Types

```typescript
import type { PaginationParams, PaginationMeta } from '@spfn/core';

const pagination: PaginationParams = { page: 1, limit: 20 };

const meta: PaginationMeta = {
  page: 1,
  limit: 20,
  total: 156,
  totalPages: 8,
  hasNext: true,
  hasPrev: false
};
```

---

## API Reference

### `QueryParser(options)`

Parse URL query parameters and store in context.

**Options:**
- `filters?: string[]` - Allowed filter fields
- `sort?: string[]` - Allowed sort fields
- `pagination?: { default?: number; max?: number }` - Pagination config

**Returns:** Hono middleware

---

### `buildFilters(filters, table)`

Build Drizzle WHERE conditions from filter object.

**Parameters:**
- `filters: Filters` - Parsed filter object
- `table: DrizzleTable` - Drizzle table schema

**Returns:** `SQL<unknown> | undefined`

---

### `buildSort(sortConditions, table)`

Build Drizzle ORDER BY conditions.

**Parameters:**
- `sortConditions: SortCondition[]` - Sort condition array
- `table: DrizzleTable` - Drizzle table schema

**Returns:** `SQL<unknown>[]`

---

### `orFilters(...conditions)`

Combine filter conditions with OR.

**Parameters:**
- `...conditions: FilterResult[]` - Filter conditions to combine

**Returns:** `SQL<unknown> | undefined`

---

### `applyPagination(pagination)`

Calculate offset and limit for pagination.

**Parameters:**
- `pagination: PaginationParams` - Pagination parameters

**Returns:** `{ offset: number; limit: number }`

---

### `countTotal(db, table, whereCondition?)`

Count total records.

**Parameters:**
- `db: PostgresJsDatabase` - Drizzle DB instance
- `table: DrizzleTable` - Table schema
- `whereCondition?: SQL` - Optional WHERE condition

**Returns:** `Promise<number>`

---

### `createPaginationMeta(pagination, total)`

Create pagination metadata.

**Parameters:**
- `pagination: PaginationParams` - Pagination parameters
- `total: number` - Total count

**Returns:** `PaginationMeta`

---

## Best Practices

### 1. Always Whitelist Fields

```typescript
// ✅ Good: Explicit whitelist
QueryParser({
  filters: ['email', 'role', 'status'],
  sort: ['createdAt', 'name']
})

// ❌ Bad: Empty whitelist (allows all fields)
QueryParser({})
```

### 2. Set Pagination Limits

```typescript
// ✅ Good: Set reasonable limits
QueryParser({
  pagination: { default: 20, max: 100 }
})

// ❌ Bad: No limits (users can request unlimited data)
QueryParser({})
```

### 3. Handle Empty Results

```typescript
// ✅ Good: Check for empty filters
const whereCondition = buildFilters(filters, users);
const query = db.select().from(users);

if (whereCondition) {
  query.where(whereCondition);
}

const data = await query;
```

### 4. Validate Total Count

```typescript
// ✅ Good: Use same WHERE condition for count
const whereCondition = buildFilters(filters, users);
const data = await db.select().from(users).where(whereCondition);
const total = await countTotal(db, users, whereCondition);
```

---

## Related

- [DB Module](../db/README.md) - Database layer with Repository pattern
- [Middleware Module](../middleware/README.md) - HTTP middleware
- [@spfn/core](../../README.md) - Main package documentation