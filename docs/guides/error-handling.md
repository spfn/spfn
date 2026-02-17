---
title: "Error Handling"
description: "Learn how to handle errors effectively in Superfunction applications"
order: 2
available: true
---

# Error Handling

Superfunction provides type-safe custom error classes with HTTP status codes, metadata, and automatic JSON serialization for consistent API error responses.

## Features

- **Type-Safe** - Full TypeScript support with error hierarchy
- **HTTP Status Codes** - Automatic mapping to appropriate status codes
- **Error Metadata** - Additional context via details field
- **JSON Serialization** - Built-in toJSON() for API responses
- **PostgreSQL Integration** - Auto-convert Postgres error codes
- **Stack Traces** - Preserved for debugging

## Error Classes

Superfunction provides pre-built error classes for common scenarios:

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
} from '@spfn/core/errors';

// Resource not found (404)
throw new NotFoundError({ resource: 'User' });
// → "User not found"

// Input validation failure (400)
throw new ValidationError({ message: 'Email is required' });

// Unique constraint violation (409)
throw new DuplicateEntryError({ field: 'email', value: 'john@example.com' });
// → "email 'john@example.com' already exists"

// Database connection failure (503)
throw new ConnectionError({ message: 'Failed to connect to database' });

// SQL query error (500)
throw new QueryError({ message: 'Syntax error in SQL query' });

// Transaction failure (500)
throw new TransactionError({ message: 'Failed to commit transaction' });

// Deadlock detected (409)
throw new DeadlockError({ message: 'Deadlock detected, please retry' });
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
} from '@spfn/core/errors';

// Malformed request (400)
throw new BadRequestError({ message: 'Invalid request format' });

// Authentication required (401)
throw new UnauthorizedError({ message: 'Invalid token' });

// Insufficient permissions (403)
throw new ForbiddenError({ message: 'Insufficient permissions' });

// Resource conflict (409)
throw new ConflictError({ message: 'Order already processed' });

// Rate limit exceeded (429)
throw new TooManyRequestsError({ message: 'Rate limit exceeded', retryAfter: 60 });

// Generic server error (500)
throw new InternalServerError({ message: 'Unexpected error occurred' });

// Service unavailable (503)
throw new ServiceUnavailableError({ message: 'Service under maintenance', retryAfter: 3600 });
```

## Using Errors in Routes

Simply throw errors in your route handlers - Superfunction automatically converts them to JSON responses:

### Basic Example

```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { NotFoundError } from '@spfn/core/errors';
import { findOne } from '@spfn/core/db';
import { users } from '@/server/entities/users';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();

        const user = await findOne(users, { id: params.id });

        // Throw error if not found
        if (!user)
        {
            throw new NotFoundError({ resource: 'User' });
        }

        return user;
    });
```

### Error Response Format

Superfunction automatically serializes errors to a consistent JSON format:

```json
// Request: GET /users/999
// Response: 404 Not Found
{
    "name": "NotFoundError",
    "message": "User not found",
    "statusCode": 404,
    "details": {
        "resource": "User"
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Error Metadata

Include additional context using the error constructor:

### Validation Errors with Field Details

```typescript
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { ValidationError, DuplicateEntryError } from '@spfn/core/errors';
import { findOne, create } from '@spfn/core/db';
import { users } from '@/server/entities/users';

export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            name: Type.String(),
            email: Type.String(),
            age: Type.Number()
        })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // Business logic validation
        if (body.age < 18)
        {
            throw new ValidationError({
                message: 'Validation failed',
                details: {
                    fields: {
                        age: 'Must be at least 18 years old'
                    },
                    providedValue: body.age
                }
            });
        }

        // Check for duplicate email
        const existing = await findOne(users, { email: body.email });
        if (existing)
        {
            throw new DuplicateEntryError({ field: 'email', value: body.email });
        }

        const user = await create(users, body);
        return c.created(user, `/users/${user.id}`);
    });
```

### Authorization Errors with Context

```typescript
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { ForbiddenError } from '@spfn/core/errors';
import { deleteOne } from '@spfn/core/db';
import { users } from '@/server/entities/users';

export const deleteUser = route.delete('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const user = c.raw.get('user');  // From auth middleware
        const { params } = await c.data();

        // Check permissions
        if (user.role !== 'admin' && user.id !== params.id)
        {
            throw new ForbiddenError({
                message: 'Insufficient permissions',
                details: {
                    required: 'admin or owner',
                    current: user.role,
                    userId: user.id,
                    targetId: params.id
                }
            });
        }

        await deleteOne(users, { id: params.id });
        return c.noContent();
    });
```

## PostgreSQL Error Conversion

Superfunction automatically converts PostgreSQL errors to appropriate custom error types:

```typescript
import { fromPostgresError } from '@spfn/core/errors';

export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            email: Type.String(),
            name: Type.String()
        })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();

        try
        {
            const user = await create(users, body);
            return c.created(user);
        }
        catch (error)
        {
            // Automatically converts Postgres errors
            const customError = fromPostgresError(error);
            throw customError;
        }
    });

// PostgreSQL Error Code → Superfunction Error
// 23505 (unique_violation) → DuplicateEntryError
// 23503 (foreign_key_violation) → ValidationError
// 40P01 (deadlock_detected) → DeadlockError
// 08000/08003/08006 (connection) → ConnectionError
// Others → QueryError
```

> **Automatic Conversion**
>
> Superfunction's database helpers automatically convert PostgreSQL errors, so you don't need to manually call `fromPostgresError()` in most cases.

## Error Handling in Transactions

Errors thrown within transactional routes automatically trigger rollback:

```typescript
import { route, defineMiddleware } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { Transactional } from '@spfn/core/db';
import { ValidationError } from '@spfn/core/errors';
import { updateOne } from '@spfn/core/db';
import { users } from '@/server/entities/users';
import { sql } from 'drizzle-orm';

export const transferMoney = route.post('/transfer')
    .input({
        body: Type.Object({
            fromUserId: Type.String(),
            toUserId: Type.String(),
            amount: Type.Number()
        })
    })
    .use([Transactional()])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const { fromUserId, toUserId, amount } = body;

        // 1. Withdraw from sender
        const sender = await updateOne(users, { id: fromUserId }, {
            balance: sql`balance - ${amount}`
        });

        // Check balance
        if (!sender || sender.balance < 0)
        {
            // This error triggers automatic rollback!
            throw new ValidationError({
                message: 'Insufficient funds',
                details: {
                    userId: fromUserId,
                    balance: sender?.balance,
                    requested: amount
                }
            });
        }

        // 2. Deposit to receiver
        await updateOne(users, { id: toUserId }, {
            balance: sql`balance + ${amount}`
        });

        // Success → Automatic commit
        return c.success({ success: true });
    });
```

> **Important: Re-throw Errors**
>
> If you catch errors within a transactional route, you must re-throw them to trigger rollback. Silently catching errors will commit the transaction!

## Custom Error Classes

Create custom error classes for domain-specific errors:

```typescript
// src/server/errors/payment-error.ts
import { HttpError } from '@spfn/core/errors';

export class PaymentFailedError extends HttpError
{
    constructor(message: string, paymentDetails?: any)
    {
        super(message, 402, paymentDetails);  // 402 Payment Required
        this.name = 'PaymentFailedError';
    }
}

export class InsufficientCreditsError extends HttpError
{
    constructor(required: number, current: number)
    {
        super(
            `Insufficient credits: ${required} required, ${current} available`,
            402,
            { required, current }
        );
        this.name = 'InsufficientCreditsError';
    }
}

// Usage in routes
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { NotFoundError } from '@spfn/core/errors';
import { PaymentFailedError, InsufficientCreditsError } from '@/server/errors';

export const purchase = route.post('/purchase')
    .input({
        body: Type.Object({ productId: Type.String() })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const user = c.raw.get('user');

        const product = await findOne(products, { id: body.productId });
        if (!product)
        {
            throw new NotFoundError({ resource: 'Product' });
        }

        // Check credits
        if (user.credits < product.price)
        {
            throw new InsufficientCreditsError(product.price, user.credits);
        }

        // Process payment
        try
        {
            await processPayment(user.id, product.price);
        }
        catch (error)
        {
            throw new PaymentFailedError('Payment processing failed', {
                userId: user.id,
                productId: body.productId,
                amount: product.price,
                error: error.message
            });
        }

        return c.success({ success: true });
    });
```

## Type Guards

Use type guards to check error types:

```typescript
import { isDatabaseError, DuplicateEntryError, DeadlockError } from '@spfn/core/errors';

try
{
    await create(users, data);
}
catch (error)
{
    if (isDatabaseError(error))
    {
        console.log(`DB Error (${error.statusCode}): ${error.message}`);
        console.log('Details:', error.details);

        // Handle specific database errors
        if (error instanceof DuplicateEntryError)
        {
            // Handle duplicate entry
        }
        else if (error instanceof DeadlockError)
        {
            // Retry logic
        }
    }
    else
    {
        // Unknown error
        console.error('Unknown error:', error);
    }
}
```

## Rate Limiting Errors

Use `TooManyRequestsError` for rate limiting:

```typescript
// src/server/middlewares/rate-limit.ts
import { defineMiddleware } from '@spfn/core/route';
import { TooManyRequestsError } from '@spfn/core/errors';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export const rateLimitMiddleware = defineMiddleware('rateLimit', async (c, next) =>
{
    const ip = c.req.header('x-forwarded-for') || 'unknown';
    const now = Date.now();
    const windowMs = 60000;  // 1 minute
    const max = 100;

    let record = rateLimitMap.get(ip);

    if (!record || now > record.resetAt)
    {
        record = { count: 0, resetAt: now + windowMs };
        rateLimitMap.set(ip, record);
    }

    record.count++;

    if (record.count > max)
    {
        const retryAfter = Math.ceil((record.resetAt - now) / 1000);

        throw new TooManyRequestsError({
            message: 'Rate limit exceeded',
            retryAfter,
            details: {
                limit: max,
                window: '1 minute',
                retryAfter: `${retryAfter}s`
            }
        });
    }

    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', (max - record.count).toString());

    await next();
});
```

## Best Practices

### 1. Use Specific Error Types

```typescript
// ❌ Bad: Generic error
throw new Error('User not found');

// ✅ Good: Specific error with context
throw new NotFoundError({ resource: 'User' });
```

### 2. Include Useful Details

```typescript
// ❌ Bad: Minimal context
throw new ValidationError({ message: 'Validation failed' });

// ✅ Good: Rich context
throw new ValidationError({
    message: 'Validation failed',
    details: {
        fields: {
            email: 'Invalid format',
            age: 'Must be >= 18'
        },
        providedData: { email: 'invalid', age: 15 }
    }
});
```

### 3. Don't Leak Sensitive Information

```typescript
// ❌ Bad: Exposes sensitive data
throw new QueryError({
    message: 'SELECT * FROM users WHERE password = ?',
    details: { password: 'secret123' }  // Don't include passwords!
});

// ✅ Good: Safe error message
throw new ValidationError({ message: 'Authentication failed' });
```

### 4. Handle Errors at the Right Level

```typescript
// ✅ Good: Throw errors early, let middleware handle
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();

        const user = await findOne(users, { id: params.id });

        if (!user)
        {
            throw new NotFoundError({ resource: 'User' });  // Thrown here
        }

        return user;  // Middleware converts to JSON response
    });

// ❌ Bad: Manually handling errors
export const badGetUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        try
        {
            const { params } = await c.data();
            const user = await findOne(users, { id: params.id });

            if (!user)
            {
                return c.json({ error: 'Not found' }, 404);  // Don't do this!
            }

            return user;
        }
        catch (error)
        {
            return c.json({ error: 'Internal error' }, 500);  // Don't do this!
        }
    });
```

### 5. Use Appropriate Status Codes

```typescript
// Resource not found → 404
throw new NotFoundError({ resource: 'User' });

// Invalid input → 400
throw new ValidationError({ message: 'Email is required' });

// Duplicate entry → 409
throw new DuplicateEntryError({ field: 'email', value: email });

// Not authenticated → 401
throw new UnauthorizedError({ message: 'Invalid token' });

// Authenticated but no permission → 403
throw new ForbiddenError({ message: 'Insufficient permissions' });

// Rate limited → 429
throw new TooManyRequestsError({ message: 'Rate limit exceeded' });
```

## Error Response Examples

### NotFoundError Response

```json
{
    "name": "NotFoundError",
    "message": "User not found",
    "statusCode": 404,
    "details": {
        "resource": "User"
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

## Error Notifications (Slack)

Send error alerts to Slack using the `@spfn/notification` package. The `createErrorSlackNotifier` factory creates an `onError` callback compatible with `ErrorHandler`.

### Setup

```typescript
// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { createErrorSlackNotifier } from '@spfn/notification/server';

export default defineServerConfig()
    .middleware({
        onError: createErrorSlackNotifier({
            webhookUrl: 'https://hooks.slack.com/services/xxx/xxx/xxx',
            minStatusCode: 500,       // Only 5xx errors (default)
            // minStatusCode: 400,    // Include 4xx errors
        }),
    })
    .routes(appRouter)
    .build();
```

The webhook URL can also be set via the `SPFN_NOTIFICATION_SLACK_WEBHOOK_URL` environment variable instead of passing it directly.

### Default Message Format

Notifications are sent using Slack Block Kit with the following information:

- Error type and status code
- Error message
- HTTP method and path
- Authenticated user ID (if available)
- Request ID (for log correlation)
- Timestamp
- Request headers (sensitive values masked)
- Query parameters
- Stack trace (first 3 frames)

### Custom Message Format

Override the default format with the `formatMessage` option:

```typescript
createErrorSlackNotifier({
    formatMessage: (err, ctx) => ({
        text: `[${ctx.statusCode}] ${err.message} — ${ctx.path}`,
        // Or use Slack Block Kit:
        // blocks: [{ type: 'section', text: { type: 'mrkdwn', text: '...' } }]
    }),
})
```

### ErrorSlackOptions

| Option | Type | Default |
|--------|------|---------|
| `minStatusCode` | `number` | `500` |
| `webhookUrl` | `string` | `env.SPFN_NOTIFICATION_SLACK_WEBHOOK_URL` |
| `formatMessage` | `(err, ctx) => { text?, blocks? }` | Block Kit format |

### Using sendSlack Directly

For custom notification logic beyond error handling, use `sendSlack` directly:

```typescript
import { sendSlack } from '@spfn/notification/server';

await sendSlack({
    text: 'Deployment completed successfully',
    webhookUrl: 'https://hooks.slack.com/services/xxx/xxx/xxx',
});

// With Block Kit
await sendSlack({
    blocks: [
        { type: 'header', text: { type: 'plain_text', text: 'New User Signup' } },
        { type: 'section', text: { type: 'mrkdwn', text: `*Email:* user@example.com` } },
    ],
});

// With templates
await sendSlack({
    template: 'alert',
    data: { level: 'critical', message: 'Database connection lost' },
});
```

> **Next: Testing**
>
> Learn how to test your Superfunction application with comprehensive testing strategies.
>
> [Testing Guide →](/docs/guides/testing)
