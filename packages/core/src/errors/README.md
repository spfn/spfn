# @spfn/core/errors - Error Handling

Type-safe custom error classes with HTTP status codes and metadata for API responses.

## Core Components

```
errors/
├── index.ts              # Module exports
├── serializable-error.ts # SerializableError base class
├── error-registry.ts     # ErrorRegistry for deserialization
├── http-errors.ts        # HTTP error classes
├── database-errors.ts    # Database error classes
├── error-utils.ts        # Type guard utilities
└── __tests__/
    ├── database-errors.test.ts
    ├── http-errors.test.ts
    └── error-utils.test.ts
```

## Features

- ✅ **Type-Safe**: Full TypeScript support with error hierarchy
- ✅ **HTTP Status Codes**: Automatic mapping to appropriate status codes
- ✅ **Error Metadata**: Additional context via `details` field
- ✅ **JSON Serialization**: HTTP errors (SerializableError) have built-in `toJSON()`
- ✅ **Error Registry**: Client-side error deserialization with ErrorRegistry
- ✅ **Stack Traces**: Preserved for debugging

---

## Quick Start

### Basic Usage

```typescript
import {
  EntityNotFoundError,
  ValidationError,
  DuplicateEntryError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError
} from '@spfn/core';

// Database errors
throw new EntityNotFoundError('User', 123);
// NotFoundError: User with id 123 not found (404)

throw new ValidationError({
  message: 'Invalid input',
  fields: [{ path: '/email', message: 'Email is required' }]
});
// ValidationError: Invalid input (400)

throw new DuplicateEntryError('email', 'john@example.com');
// DuplicateEntryError: email 'john@example.com' already exists (409)

// HTTP errors
throw new UnauthorizedError({ message: 'Invalid token' });
// UnauthorizedError: Invalid token (401)

throw new ForbiddenError({ message: 'Insufficient permissions' });
// ForbiddenError: Insufficient permissions (403)

throw new NotFoundError({ message: 'User not found', resource: 'User' });
// NotFoundError: User not found (404)
```

### With Error Handler Middleware

```typescript
import { ErrorHandler } from '@spfn/core';
import { app } from './app';

// Automatically converts errors to JSON responses
app.onError(ErrorHandler());
```

### API Response Example (SerializableError)

```json
{
  "__type": "NotFoundError",
  "message": "User not found",
  "resource": "User"
}
```

**Note:** SerializableError automatically serializes all public fields via `toJSON()`. The response format varies based on error type and fields.

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
- `stack?: string` - Stack trace (automatically captured)

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

### `EntityNotFoundError` (404)

Database entity not found.

```typescript
import { EntityNotFoundError } from '@spfn/core';

// Automatically generates message and includes resource/id in details
throw new EntityNotFoundError('User', 123);

// Message: "User with id 123 not found"
// Details: { resource: 'User', id: 123 }
```

**Use Cases:**
- Database record doesn't exist
- Invalid entity ID provided
- Soft-deleted items

---

### `ConstraintViolationError` (400)

Database constraint violation.

```typescript
import { ConstraintViolationError } from '@spfn/core';

throw new ConstraintViolationError('Foreign key constraint failed', {
  constraint: 'fk_user_id',
  table: 'orders'
});
```

**Use Cases:**
- NOT NULL violation
- CHECK constraint failure
- FOREIGN KEY violation

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

## HTTP Error Classes

HTTP errors extend `SerializableError` and use object-based constructors for explicit field naming.

### Base: `SerializableError`

Abstract base class for all serializable errors.

```typescript
import { SerializableError } from '@spfn/core';

// Custom serializable error
export class PaymentFailedError extends SerializableError
{
    readonly statusCode = 402;
    transactionId!: string;
    reason!: 'insufficient_funds' | 'card_declined';

    constructor(data: {
        message: string;
        transactionId: string;
        reason: 'insufficient_funds' | 'card_declined';
    })
    {
        super(data.message);
        this.name = 'PaymentFailedError';
        Object.assign(this, data);
    }
}
```

**Features:**
- `toJSON()` auto-serializes all public fields with `__type` for deserialization
- `statusCode` is abstract (must be defined in subclass)

---

### `HttpError`

Base class for all HTTP-related errors.

```typescript
import { HttpError } from '@spfn/core';

throw new HttpError({
  message: 'Custom error',
  statusCode: 418,
  details: { reason: 'I am a teapot' }
});
```

---

### `BadRequestError` (400)

Generic bad request error.

```typescript
import { BadRequestError } from '@spfn/core';

throw new BadRequestError({
  message: 'Invalid request format',
  details: { expected: 'application/json', received: 'text/plain' }
});

// With default message
throw new BadRequestError(); // "Bad request"
```

**Use Cases:**
- Malformed request syntax
- Invalid request parameters
- Missing required headers

---

### `ValidationError` (400)

Input validation failure with field-level errors.

```typescript
import { ValidationError } from '@spfn/core';

throw new ValidationError({
  message: 'Invalid input data',
  fields: [
    { path: '/email', message: 'Invalid email format' },
    { path: '/age', message: 'Must be at least 18', value: 15 }
  ]
});
```

**Properties:**
- `fields?: Array<{ path: string; message: string; value?: any }>` - Field-level errors

**Use Cases:**
- Request body validation failure
- Query/params validation failure
- TypeBox schema validation

---

### `UnauthorizedError` (401)

Authentication required or failed.

```typescript
import { UnauthorizedError } from '@spfn/core';

throw new UnauthorizedError({
  message: 'Invalid token',
  details: { reason: 'expired' }
});

// With default message
throw new UnauthorizedError(); // "Authentication required"
```

**Use Cases:**
- Missing authentication token
- Invalid credentials
- Expired token
- Token verification failed

---

### `ForbiddenError` (403)

Authenticated but lacks permission.

```typescript
import { ForbiddenError } from '@spfn/core';

throw new ForbiddenError({
  message: 'Insufficient permissions',
  details: { required: 'admin', current: 'user' }
});

// With default message
throw new ForbiddenError(); // "Access forbidden"
```

**Use Cases:**
- Insufficient role/permissions
- Access to restricted resource
- Operation not allowed for user

---

### `NotFoundError` (404)

HTTP resource not found.

```typescript
import { NotFoundError } from '@spfn/core';

throw new NotFoundError({
  message: 'User not found',
  resource: 'User'
});

// With default message
throw new NotFoundError(); // "Resource not found"
```

**Properties:**
- `resource?: string` - Resource type that was not found

**Use Cases:**
- API endpoint not found
- Resource not found (HTTP layer)
- For database entities, use `EntityNotFoundError` instead

---

### `ConflictError` (409)

Generic resource conflict.

```typescript
import { ConflictError } from '@spfn/core';

throw new ConflictError({
  message: 'Order already processed',
  details: { orderId: '123', status: 'completed' }
});

// With default message
throw new ConflictError(); // "Resource conflict"
```

**Use Cases:**
- Resource state conflict
- Concurrent modification
- Business logic conflict

---

### `GoneError` (410)

Resource permanently deleted.

```typescript
import { GoneError } from '@spfn/core';

throw new GoneError({
  message: 'This API version has been retired',
  resource: 'v1/users'
});

// With default message
throw new GoneError(); // "Resource permanently deleted"
```

**Properties:**
- `resource?: string` - Resource that was deleted

**Use Cases:**
- Deprecated API endpoints
- Permanently deleted resources
- Retired features

---

### `UnsupportedMediaTypeError` (415)

Media type not supported.

```typescript
import { UnsupportedMediaTypeError } from '@spfn/core';

throw new UnsupportedMediaTypeError({
  message: 'Unsupported file type',
  mediaType: 'video/avi',
  supportedTypes: ['video/mp4', 'video/webm']
});
```

**Properties:**
- `mediaType?: string` - The unsupported media type
- `supportedTypes?: string[]` - List of supported types

**Use Cases:**
- Invalid file upload types
- Wrong Content-Type header
- Unsupported encoding

---

### `UnprocessableEntityError` (422)

Request well-formed but contains semantic errors.

```typescript
import { UnprocessableEntityError } from '@spfn/core';

throw new UnprocessableEntityError({
  message: 'Cannot process this order',
  details: { reason: 'Insufficient inventory' }
});

// With default message
throw new UnprocessableEntityError(); // "Unprocessable entity"
```

**Use Cases:**
- Semantic validation errors
- Business logic violations
- Invalid state transitions

---

### `TooManyRequestsError` (429)

Rate limit exceeded.

```typescript
import { TooManyRequestsError } from '@spfn/core';

throw new TooManyRequestsError({
  message: 'Rate limit exceeded',
  retryAfter: 60,
  details: { limit: 100, window: '1 minute' }
});

// With default message
throw new TooManyRequestsError(); // "Too many requests"
```

**Properties:**
- `retryAfter?: number` - Seconds to wait before retry

**Use Cases:**
- API rate limiting
- Request throttling
- Abuse prevention

---

### `InternalServerError` (500)

Generic server error.

```typescript
import { InternalServerError } from '@spfn/core';

throw new InternalServerError({
  message: 'Unexpected error occurred',
  details: { component: 'payment-processor' }
});

// With default message
throw new InternalServerError(); // "Internal server error"
```

**Use Cases:**
- Unexpected server errors
- Unhandled exceptions
- Generic 500 errors

---

### `ServiceUnavailableError` (503)

Service temporarily unavailable.

```typescript
import { ServiceUnavailableError } from '@spfn/core';

throw new ServiceUnavailableError({
  message: 'Service under maintenance',
  retryAfter: 3600,
  details: { reason: 'scheduled_maintenance' }
});

// With default message
throw new ServiceUnavailableError(); // "Service unavailable"
```

**Properties:**
- `retryAfter?: number` - Seconds to wait before retry

**Use Cases:**
- Scheduled maintenance
- Service overload
- Temporary outage

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

### `isHttpError(error)`

Type guard to check if error is an HttpError.

```typescript
import { isHttpError } from '@spfn/core';

try {
  await api.call();
} catch (error) {
  if (isHttpError(error)) {
    console.log(`HTTP Error (${error.statusCode}): ${error.message}`);
  }
}
```

**Returns:** `boolean`

---

### `hasStatusCode(error)`

Type guard to check if error has a statusCode property.

```typescript
import { hasStatusCode } from '@spfn/core';

if (hasStatusCode(error)) {
  console.log(`Status: ${error.statusCode}`);
}
```

**Returns:** `boolean`

---

## ErrorRegistry

Client-side error deserialization registry.

```typescript
import { ErrorRegistry, ValidationError, NotFoundError, errorRegistry } from '@spfn/core';

// Use pre-configured registry (includes all built-in HTTP errors)
const error = errorRegistry.deserialize({
  __type: 'ValidationError',
  message: 'Invalid email',
  fields: [{ path: '/email', message: 'Invalid format' }]
});
// error instanceof ValidationError === true

// Or create custom registry
const customRegistry = new ErrorRegistry();
customRegistry
  .append(ValidationError)
  .append([NotFoundError, PaymentFailedError]);

// Safely try to deserialize (returns null if unknown type)
const maybeError = customRegistry.tryDeserialize(data);

// Merge registries
customRegistry.concat(errorRegistry);
```

**Methods:**
- `append(ErrorClass)` - Add error class to registry
- `concat(registry)` - Merge another registry
- `has(name)` - Check if error type is registered
- `deserialize(data)` - Deserialize error (throws if unknown)
- `tryDeserialize(data)` - Safely deserialize (returns null if unknown)
- `getRegisteredTypes()` - Get all registered type names

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
import { ErrorHandler, NotFoundError } from '@spfn/core';
import { Hono } from 'hono';

const app = new Hono();

// Apply error handler
app.onError(ErrorHandler());

// Route
app.get('/users/:id', async (c) => {
  const id = c.req.param('id');
  const user = await userRepo.findById(id);

  if (!user) {
    throw new NotFoundError({ message: 'User not found', resource: 'User' });
  }

  return c.json(user);
});
```

### Repository Pattern Integration

```typescript
import { EntityNotFoundError, DuplicateEntryError } from '@spfn/core';

class UserRepository {
  async findByIdOrFail(id: number) {
    const user = await this.findById(id);
    if (!user) {
      throw new EntityNotFoundError('User', id);
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

// ✅ Specific error with context (database)
throw new EntityNotFoundError('User', userId);

// ✅ Specific error with context (HTTP)
throw new NotFoundError({ message: 'User not found', resource: 'User' });
```

### 2. Include Useful Details

```typescript
// ❌ Minimal context
throw new ValidationError({ message: 'Validation failed' });

// ✅ Rich context
throw new ValidationError({
  message: 'Validation failed',
  fields: [
    { path: '/email', message: 'Invalid format', value: 'invalid' },
    { path: '/age', message: 'Must be >= 18', value: 15 }
  ]
});
```

### 3. Handle Errors at the Right Level

```typescript
// In repository - throw database errors
async findByIdOrFail(id: number) {
  const result = await this.findById(id);
  if (!result) {
    throw new EntityNotFoundError('User', id);
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

## Test Coverage

The errors module has comprehensive test coverage with **71 tests** (all passing ✅).

### Database Errors Tests (20 tests)
**File:** `src/errors/__tests__/database-errors.test.ts`

- **DatabaseError** (3 tests)
- **ConnectionError** (2 tests)
- **QueryError** (3 tests)
- **EntityNotFoundError** (3 tests)
- **ConstraintViolationError** (2 tests)
- **TransactionError** (3 tests)
- **DeadlockError** (2 tests)
- **DuplicateEntryError** (2 tests)

### HTTP Errors Tests (36 tests)
**File:** `src/errors/__tests__/http-errors.test.ts`

- **HttpError** - Properties, JSON serialization
- **BadRequestError** - Status code, default message, details
- **ValidationError** - Status code, fields handling
- **UnauthorizedError** - Status code, default message, details
- **ForbiddenError** - Status code, default message, details
- **NotFoundError** - Status code, resource field, default message
- **ConflictError** - Status code, default message, details
- **TooManyRequestsError** - Status code, retryAfter handling
- **InternalServerError** - Status code, default message, details
- **ServiceUnavailableError** - Status code, retryAfter handling

### Error Utils Tests (15 tests)
**File:** `src/errors/__tests__/error-utils.test.ts`

- **isDatabaseError()** (4 tests)
- **isHttpError()** (5 tests)
- **hasStatusCode()** (6 tests)

### Running Tests

```bash
# Run all errors tests
pnpm test src/errors

# Run specific test file
pnpm test src/errors/__tests__/database-errors.test.ts
pnpm test src/errors/__tests__/http-errors.test.ts
pnpm test src/errors/__tests__/error-utils.test.ts
```

---

## Troubleshooting

### Error not serializing in API response

**Cause:** Not using error handler middleware

**Solution:**
```typescript
import { ErrorHandler } from '@spfn/core';
app.onError(ErrorHandler());
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
