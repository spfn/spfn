# @spfn/core/errors - Error Handling

Type-safe custom error classes with HTTP status codes and metadata for API responses.

## Features

- ✅ **Type-Safe**: Full TypeScript support with error hierarchy
- ✅ **HTTP Status Codes**: Automatic mapping to appropriate status codes
- ✅ **Error Metadata**: Additional context via `details` field
- ✅ **Timestamps**: Automatic error occurrence tracking
- ✅ **JSON Serialization**: Built-in `toJSON()` for API responses
- ✅ **PostgreSQL Integration**: Auto-convert Postgres error codes
- ✅ **Stack Traces**: Preserved for debugging

---

## Quick Start

### Basic Usage

```typescript
import { NotFoundError, ValidationError, DuplicateEntryError } from '@spfn/core';

// Not found
throw new NotFoundError('User', 123);
// NotFoundError: User with id 123 not found (404)

// Validation error
throw new ValidationError('Email is required');
// ValidationError: Email is required (400)

// Duplicate entry
throw new DuplicateEntryError('email', 'john@example.com');
// DuplicateEntryError: email 'john@example.com' already exists (409)
```

### With Error Handler Middleware

```typescript
import { errorHandler } from '@spfn/core';
import { app } from './app';

// Automatically converts errors to JSON responses
app.onError(errorHandler());
```

### API Response Example

```json
{
  "name": "NotFoundError",
  "message": "User with id 123 not found",
  "statusCode": 404,
  "details": {
    "resource": "User",
    "id": 123
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Classes

### Base: `DatabaseError`

Base class for all database-related errors.

```typescript
import { DatabaseError } from '@spfn/core';

throw new DatabaseError('Something went wrong', 500, {
  query: 'SELECT * FROM users',
  params: [123]
});
```

**Properties:**
- `message: string` - Error message
- `statusCode: number` - HTTP status code (default: 500)
- `details?: Record<string, any>` - Additional context
- `timestamp: Date` - When error occurred
- `stack?: string` - Stack trace

**Methods:**
- `toJSON()` - Serialize for API response

---

### `ConnectionError` (503)

Database connection failures.

```typescript
import { ConnectionError } from '@spfn/core';

throw new ConnectionError('Failed to connect to database', {
  host: 'localhost',
  port: 5432,
  retries: 3
});
```

**Use Cases:**
- Connection pool exhausted
- Database server unreachable
- Authentication failed
- Network timeout

---

### `QueryError` (500)

SQL query execution failures.

```typescript
import { QueryError } from '@spfn/core';

throw new QueryError('Syntax error in SQL query', 500, {
  query: 'SELCT * FROM users', // typo
  table: 'users'
});
```

**Use Cases:**
- SQL syntax errors
- Invalid table/column names
- Type mismatches
- General query failures

---

### `NotFoundError` (404)

Resource not found.

```typescript
import { NotFoundError } from '@spfn/core';

// Automatically includes resource and id in details
throw new NotFoundError('User', 123);

// Response
{
  "message": "User with id 123 not found",
  "statusCode": 404,
  "details": {
    "resource": "User",
    "id": 123
  }
}
```

**Use Cases:**
- Record doesn't exist
- Invalid ID provided
- Soft-deleted items

---

### `ValidationError` (400)

Input validation failures.

```typescript
import { ValidationError } from '@spfn/core';

throw new ValidationError('Invalid input data', {
  fields: {
    email: 'Invalid email format',
    age: 'Must be at least 18'
  }
});
```

**Use Cases:**
- Missing required fields
- Invalid data format
- Business rule violations
- Type validation failures

---

### `TransactionError` (500)

Transaction management failures.

```typescript
import { TransactionError } from '@spfn/core';

throw new TransactionError('Failed to commit transaction', 500, {
  operation: 'commit',
  affectedTables: ['users', 'profiles']
});
```

**Use Cases:**
- Transaction start failed
- Commit failed
- Rollback failed
- Nested transaction errors

---

### `DeadlockError` (409)

Database deadlock detected.

```typescript
import { DeadlockError } from '@spfn/core';

throw new DeadlockError('Deadlock detected, please retry', {
  tables: ['users', 'orders'],
  retryAfter: 1000
});
```

**Use Cases:**
- Concurrent transaction conflicts
- Lock timeout
- Circular lock dependencies

**Recommendation:** Implement retry logic for deadlock errors.

---

### `DuplicateEntryError` (409)

Unique constraint violation.

```typescript
import { DuplicateEntryError } from '@spfn/core';

// Automatically includes field and value in details
throw new DuplicateEntryError('email', 'john@example.com');

// Response
{
  "message": "email 'john@example.com' already exists",
  "statusCode": 409,
  "details": {
    "field": "email",
    "value": "john@example.com"
  }
}
```

**Use Cases:**
- Duplicate email/username
- Unique key violations
- Already exists errors

---

## Utility Functions

### `isDatabaseError(error)`

Type guard to check if error is a DatabaseError.

```typescript
import { isDatabaseError } from '@spfn/core';

try {
  await userRepo.save(data);
} catch (error) {
  if (isDatabaseError(error)) {
    console.log(`DB Error (${error.statusCode}): ${error.message}`);
    console.log('Details:', error.details);
  } else {
    console.error('Unknown error:', error);
  }
}
```

**Returns:** `boolean`

---

### `fromPostgresError(error)`

Convert PostgreSQL error to custom error type.

```typescript
import { fromPostgresError } from '@spfn/core';

try {
  await db.insert(users).values(data);
} catch (pgError) {
  const customError = fromPostgresError(pgError);
  throw customError;
}
```

**Supported PostgreSQL Error Codes:**
- `08000`, `08003`, `08006` → `ConnectionError`
- `23505` → `DuplicateEntryError`
- `23503` → `ValidationError` (foreign key)
- `40P01` → `DeadlockError`
- Others → `QueryError`

**Reference:** [PostgreSQL Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html)

---

## Advanced Usage

### Custom Error Classes

```typescript
import { DatabaseError } from '@spfn/core';

export class TimeoutError extends DatabaseError {
  constructor(message: string, timeoutMs: number) {
    super(message, 504, { timeoutMs });
    this.name = 'TimeoutError';
  }
}

// Usage
throw new TimeoutError('Query timeout exceeded', 5000);
```

### Error Metadata

```typescript
import { QueryError } from '@spfn/core';

throw new QueryError('Failed to update user', 500, {
  userId: 123,
  attemptedFields: ['email', 'name'],
  query: 'UPDATE users SET ...',
  executionTime: 1500
});
```

### Error Handler Integration

```typescript
import { errorHandler } from '@spfn/core';
import { Hono } from 'hono';

const app = new Hono();

// Custom error handling
app.onError(errorHandler({
  onError: (error, c) => {
    // Custom logging
    console.error('[Error]', {
      path: c.req.path,
      method: c.req.method,
      error: error.toJSON()
    });
  }
}));

// Route
app.get('/users/:id', async (c) => {
  const id = c.req.param('id');
  const user = await userRepo.findById(id);

  if (!user) {
    throw new NotFoundError('User', id);
  }

  return c.json(user);
});
```

### Repository Pattern Integration

```typescript
import { NotFoundError, DuplicateEntryError } from '@spfn/core';

class UserRepository {
  async findByIdOrFail(id: number) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }
    return user;
  }

  async createUnique(email: string, data: any) {
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new DuplicateEntryError('email', email);
    }
    return this.save(data);
  }
}
```

### Transaction Error Handling

```typescript
import { TransactionError } from '@spfn/core';
import { runWithTransaction } from '@spfn/core';

try {
  await runWithTransaction(async (tx) => {
    await tx.insert(users).values(userData);
    await tx.insert(profiles).values(profileData);
  });
} catch (error) {
  if (error instanceof TransactionError) {
    console.error('Transaction failed:', error.details);
    // Maybe retry or notify admin
  }
  throw error;
}
```

---

## Best Practices

### 1. Use Specific Error Types

```typescript
// ❌ Generic error
throw new Error('User not found');

// ✅ Specific error with context
throw new NotFoundError('User', userId);
```

### 2. Include Useful Details

```typescript
// ❌ Minimal context
throw new ValidationError('Validation failed');

// ✅ Rich context
throw new ValidationError('Validation failed', {
  fields: {
    email: 'Invalid format',
    age: 'Must be >= 18'
  },
  providedData: { email: 'invalid', age: 15 }
});
```

### 3. Handle Errors at the Right Level

```typescript
// In repository - throw specific errors
async findByIdOrFail(id: number) {
  const result = await this.findById(id);
  if (!result) {
    throw new NotFoundError('User', id);
  }
  return result;
}

// In route - let middleware handle
app.get('/users/:id', async (c) => {
  const user = await userRepo.findByIdOrFail(c.req.param('id'));
  return c.json(user);
});
```

### 4. Don't Leak Sensitive Information

```typescript
// ❌ Exposes internal details
throw new QueryError('SELECT * FROM users WHERE password = ?', 500, {
  password: 'secret123' // Don't include sensitive data!
});

// ✅ Safe error message
throw new QueryError('Failed to authenticate user', 401);
```

---

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { NotFoundError, ValidationError } from '@spfn/core';

describe('Error Handling', () => {
  it('should create NotFoundError with correct properties', () => {
    const error = new NotFoundError('User', 123);

    expect(error.name).toBe('NotFoundError');
    expect(error.message).toBe('User with id 123 not found');
    expect(error.statusCode).toBe(404);
    expect(error.details).toEqual({ resource: 'User', id: 123 });
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  it('should serialize to JSON correctly', () => {
    const error = new ValidationError('Invalid data', { field: 'email' });
    const json = error.toJSON();

    expect(json).toEqual({
      name: 'ValidationError',
      message: 'Invalid data',
      statusCode: 400,
      details: { field: 'email' },
      timestamp: expect.any(String)
    });
  });
});
```

---

## Troubleshooting

### Error not serializing in API response

**Cause:** Not using error handler middleware

**Solution:**
```typescript
import { errorHandler } from '@spfn/core';
app.onError(errorHandler());
```

### Stack trace missing in development

**Cause:** Error.captureStackTrace not called

**Solution:** All custom errors automatically capture stack traces. Check if extending DatabaseError properly.

### Wrong status code returned

**Cause:** Using generic Error class

**Solution:** Use specific error classes (NotFoundError, ValidationError, etc.)

---

## Related

- [Hono Error Handling](https://hono.dev/api/hono#error-handling) - Framework integration
- [PostgreSQL Error Codes](https://www.postgresql.org/docs/current/errcodes-appendix.html) - Reference
- [@spfn/core/middleware](../middleware/README.md) - Error handler middleware
- [@spfn/core](../../README.md) - Main package documentation
