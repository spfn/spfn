---
title: "Error Handling"
description: "Learn how to handle errors effectively in SPFN applications"
order: 2
available: true
---

# Error Handling

SPFN provides type-safe custom error classes with HTTP status codes, metadata, and automatic JSON serialization for consistent API error responses.

## Features

- **Type-Safe** - Full TypeScript support with error hierarchy
- **HTTP Status Codes** - Automatic mapping to appropriate status codes
- **Error Metadata** - Additional context via details field
- **JSON Serialization** - Built-in toJSON() for API responses
- **PostgreSQL Integration** - Auto-convert Postgres error codes
- **Stack Traces** - Preserved for debugging

## Error Classes

SPFN provides pre-built error classes for common scenarios:

### Database Errors

```typescript
import {
  NotFoundError,
  ValidationError,
  DuplicateEntryError,
  ConnectionError,
  QueryError,
  TransactionError,
  DeadlockError
} from '@spfn/core';

// Resource not found (404)
throw new NotFoundError('User', 123);
// → "User with id 123 not found"

// Input validation failure (400)
throw new ValidationError('Email is required');

// Unique constraint violation (409)
throw new DuplicateEntryError('email', 'john@example.com');
// → "email 'john@example.com' already exists"

// Database connection failure (503)
throw new ConnectionError('Failed to connect to database');

// SQL query error (500)
throw new QueryError('Syntax error in SQL query');

// Transaction failure (500)
throw new TransactionError('Failed to commit transaction');

// Deadlock detected (409)
throw new DeadlockError('Deadlock detected, please retry');
```

### HTTP Errors

```typescript
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  TooManyRequestsError,
  InternalServerError,
  ServiceUnavailableError
} from '@spfn/core';

// Malformed request (400)
throw new BadRequestError('Invalid request format');

// Authentication required (401)
throw new UnauthorizedError('Invalid token');

// Insufficient permissions (403)
throw new ForbiddenError('Insufficient permissions');

// Resource conflict (409)
throw new ConflictError('Order already processed');

// Rate limit exceeded (429)
throw new TooManyRequestsError('Rate limit exceeded', 60);  // retry after 60s

// Generic server error (500)
throw new InternalServerError('Unexpected error occurred');

// Service unavailable (503)
throw new ServiceUnavailableError('Service under maintenance', 3600);  // retry after 1h
```

## Using Errors in Routes

Simply throw errors in your route handlers - SPFN automatically converts them to JSON responses:

### Basic Example

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { NotFoundError } from '@spfn/core';
import { getUserContract } from '@/lib/contracts/users';
import { findOne } from '@spfn/core/db';
import { users } from '@/server/entities/users';

const app = createApp();

app.bind(getUserContract, async (c) => {
  const { id } = c.params;

  const user = await findOne(users, { id });

  // Throw error if not found
  if (!user) {
    throw new NotFoundError('User', id);
  }

  return c.json(user);
});

export default app;
```

### Error Response Format

SPFN automatically serializes errors to a consistent JSON format:

```json
// Request: GET /users/999
// Response: 404 Not Found
{
  "name": "NotFoundError",
  "message": "User with id 999 not found",
  "statusCode": 404,
  "details": {
    "resource": "User",
    "id": 999
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Error Metadata

Include additional context using the `details` parameter:

### Validation Errors with Field Details

```typescript
import { ValidationError } from '@spfn/core';

app.bind(createUserContract, async (c) => {
  const data = await c.data();

  // Business logic validation
  if (data.age < 18) {
    throw new ValidationError('Validation failed', {
      fields: {
        age: 'Must be at least 18 years old'
      },
      providedValue: data.age
    });
  }

  // Check for duplicate email
  const existing = await findOne(users, { email: data.email });
  if (existing) {
    throw new DuplicateEntryError('email', data.email);
  }

  const user = await create(users, data);
  return c.json(user);
});
```

### Authorization Errors with Context

```typescript
import { ForbiddenError } from '@spfn/core';

app.bind(deleteUserContract, async (c) => {
  const user = c.raw.get('user');  // From auth middleware
  const { id } = c.params;

  // Check permissions
  if (user.role !== 'admin' && user.id !== id) {
    throw new ForbiddenError('Insufficient permissions', {
      required: 'admin or owner',
      current: user.role,
      userId: user.id,
      targetId: id
    });
  }

  await deleteOne(users, { id });
  return c.json({ success: true });
});
```

## PostgreSQL Error Conversion

SPFN automatically converts PostgreSQL errors to appropriate custom error types:

```typescript
import { fromPostgresError } from '@spfn/core';

app.bind(createUserContract, async (c) => {
  const data = await c.data();

  try {
    const user = await create(users, data);
    return c.json(user);
  } catch (error) {
    // Automatically converts Postgres errors
    const customError = fromPostgresError(error);
    throw customError;
  }
});

// PostgreSQL Error Code → SPFN Error
// 23505 (unique_violation) → DuplicateEntryError
// 23503 (foreign_key_violation) → ValidationError
// 40P01 (deadlock_detected) → DeadlockError
// 08000/08003/08006 (connection) → ConnectionError
// Others → QueryError
```

> **Automatic Conversion**
>
> SPFN's database helpers automatically convert PostgreSQL errors, so you don't need to manually call `fromPostgresError()` in most cases.

## Error Handling in Transactions

Errors thrown within transactional routes automatically trigger rollback:

```typescript
import { Transactional } from '@spfn/core/db';
import { ValidationError } from '@spfn/core';

app.bind(
  transferMoneyContract,
  [Transactional()],
  async (c) => {
    const { fromUserId, toUserId, amount } = await c.data();

    // 1. Withdraw from sender
    const sender = await updateOne(users, { id: fromUserId }, {
      balance: sql`balance - ${amount}`
    });

    // Check balance
    if (!sender || sender.balance < 0) {
      // This error triggers automatic rollback!
      throw new ValidationError('Insufficient funds', {
        userId: fromUserId,
        balance: sender?.balance,
        requested: amount
      });
    }

    // 2. Deposit to receiver
    await updateOne(users, { id: toUserId }, {
      balance: sql`balance + ${amount}`
    });

    // Success → Automatic commit
    return c.json({ success: true });
  }
);
```

> **Important: Re-throw Errors**
>
> If you catch errors within a transactional route, you must re-throw them to trigger rollback. Silently catching errors will commit the transaction!

## Custom Error Classes

Create custom error classes for domain-specific errors:

```typescript
// src/server/errors/payment-error.ts
import { HttpError } from '@spfn/core';

export class PaymentFailedError extends HttpError {
  constructor(message: string, paymentDetails?: any) {
    super(message, 402, paymentDetails);  // 402 Payment Required
    this.name = 'PaymentFailedError';
  }
}

export class InsufficientCreditsError extends HttpError {
  constructor(required: number, current: number) {
    super(
      `Insufficient credits: ${required} required, ${current} available`,
      402,
      { required, current }
    );
    this.name = 'InsufficientCreditsError';
  }
}

// Usage in routes
import { PaymentFailedError, InsufficientCreditsError } from '@/server/errors';

app.bind(purchaseContract, async (c) => {
  const { productId } = await c.data();
  const user = c.raw.get('user');

  const product = await findOne(products, { id: productId });
  if (!product) {
    throw new NotFoundError('Product', productId);
  }

  // Check credits
  if (user.credits < product.price) {
    throw new InsufficientCreditsError(product.price, user.credits);
  }

  // Process payment
  try {
    await processPayment(user.id, product.price);
  } catch (error) {
    throw new PaymentFailedError('Payment processing failed', {
      userId: user.id,
      productId,
      amount: product.price,
      error: error.message
    });
  }

  return c.json({ success: true });
});
```

## Type Guards

Use type guards to check error types:

```typescript
import { isDatabaseError } from '@spfn/core';

try {
  await create(users, data);
} catch (error) {
  if (isDatabaseError(error)) {
    console.log(`DB Error (${error.statusCode}): ${error.message}`);
    console.log('Details:', error.details);

    // Handle specific database errors
    if (error instanceof DuplicateEntryError) {
      // Handle duplicate entry
    } else if (error instanceof DeadlockError) {
      // Retry logic
    }
  } else {
    // Unknown error
    console.error('Unknown error:', error);
  }
}
```

## Rate Limiting Errors

Use `TooManyRequestsError` for rate limiting:

```typescript
// src/server/middlewares/rate-limit.ts
import { TooManyRequestsError } from '@spfn/core';

export function rateLimitMiddleware(options = { max: 100, windowMs: 60000 }) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || 'unknown';
    const record = rateLimitMap.get(ip);

    if (record && record.count > options.max) {
      const retryAfter = Math.ceil((record.resetAt - Date.now()) / 1000);

      throw new TooManyRequestsError(
        'Rate limit exceeded',
        retryAfter,
        {
          limit: options.max,
          window: '1 minute',
          retryAfter: `${retryAfter}s`
        }
      );
    }

    await next();
  };
}
```

## Best Practices

### 1. Use Specific Error Types

```typescript
// ❌ Bad: Generic error
throw new Error('User not found');

// ✅ Good: Specific error with context
throw new NotFoundError('User', userId);
```

### 2. Include Useful Details

```typescript
// ❌ Bad: Minimal context
throw new ValidationError('Validation failed');

// ✅ Good: Rich context
throw new ValidationError('Validation failed', {
  fields: {
    email: 'Invalid format',
    age: 'Must be >= 18'
  },
  providedData: { email: 'invalid', age: 15 }
});
```

### 3. Don't Leak Sensitive Information

```typescript
// ❌ Bad: Exposes sensitive data
throw new QueryError('SELECT * FROM users WHERE password = ?', 500, {
  password: 'secret123'  // Don't include passwords!
});

// ✅ Good: Safe error message
throw new ValidationError('Authentication failed');
```

### 4. Handle Errors at the Right Level

```typescript
// ✅ Good: Throw errors early, let middleware handle
app.bind(getUserContract, async (c) => {
  const { id } = c.params;

  const user = await findOne(users, { id });

  if (!user) {
    throw new NotFoundError('User', id);  // Thrown here
  }

  return c.json(user);  // Middleware converts to JSON response
});

// ❌ Bad: Manually handling errors
app.bind(getUserContract, async (c) => {
  try {
    const { id } = c.params;
    const user = await findOne(users, { id });

    if (!user) {
      return c.json({ error: 'Not found' }, 404);  // Don't do this!
    }

    return c.json(user);
  } catch (error) {
    return c.json({ error: 'Internal error' }, 500);  // Don't do this!
  }
});
```

### 5. Use Appropriate Status Codes

```typescript
// Resource not found → 404
throw new NotFoundError('User', id);

// Invalid input → 400
throw new ValidationError('Email is required');

// Duplicate entry → 409
throw new DuplicateEntryError('email', email);

// Not authenticated → 401
throw new UnauthorizedError('Invalid token');

// Authenticated but no permission → 403
throw new ForbiddenError('Insufficient permissions');

// Rate limited → 429
throw new TooManyRequestsError('Rate limit exceeded');
```

## Error Response Examples

### NotFoundError Response

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

### ValidationError Response

```json
{
  "name": "ValidationError",
  "message": "Validation failed",
  "statusCode": 400,
  "details": {
    "fields": {
      "email": "Invalid email format",
      "age": "Must be at least 18"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### DuplicateEntryError Response

```json
{
  "name": "DuplicateEntryError",
  "message": "email 'john@example.com' already exists",
  "statusCode": 409,
  "details": {
    "field": "email",
    "value": "john@example.com"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

> **Next: Testing**
>
> Learn how to test your SPFN application with comprehensive testing strategies.
>
> [Testing Guide →](/docs/guides/testing)