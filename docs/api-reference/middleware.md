---
title: "Middleware"
description: "Complete API reference for built-in middleware and custom middleware creation"
order: 4
available: true
---

# Middleware

Superfunction provides built-in middleware for common patterns and supports custom middleware creation for cross-cutting concerns.

## Built-in Middleware

### RequestLogger

Automatic API request/response logging with performance monitoring.

```typescript
import { RequestLogger } from '@spfn/core';

// Global middleware (server.config.ts)
export default {
  use: [RequestLogger()],
} satisfies ServerConfig;

// Route-specific middleware
export const middleware = [RequestLogger()];

// With configuration
export const middleware = [
  RequestLogger({
    excludePaths: ['/health', '/ping'],
    sensitiveFields: ['password', 'token', 'apiKey'],
    slowRequestThreshold: 1000, // ms
  }),
];
```

#### Configuration Options

| Option | Type | Default |
|--------|------|---------|
| `excludePaths` | `string[]` | ['/health', '/ping'] |
| `sensitiveFields` | `string[]` | ['password', 'token', ...] |
| `slowRequestThreshold` | `number` | 1000 (1 second) |

#### Log Output

```json
// Request log
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1705315800000_abc123",
  "method": "POST",
  "path": "/users",
  "query": {},
  "body": { "email": "user@example.com", "password": "***" }
}

// Response log
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "requestId": "req_1705315800000_abc123",
  "method": "POST",
  "path": "/users",
  "status": 201,
  "duration": 123,
  "message": "Request completed"
}

// Slow request warning
{
  "level": "warn",
  "requestId": "req_1705315800000_abc123",
  "duration": 2500,
  "message": "Slow request detected"
}
```

### ErrorHandler

Global error handler for consistent error responses.

```typescript
import { ErrorHandler } from '@spfn/core';

// Global middleware (server.config.ts)
export default {
  use: [ErrorHandler()],
} satisfies ServerConfig;

// With configuration
export const middleware = [
  ErrorHandler({
    includeStack: process.env.NODE_ENV === 'development',
  }),
];
```

#### Error Response Format

```json
// Validation error (400)
{
  "error": "ValidationError",
  "message": "Invalid email format",
  "statusCode": 400,
  "details": {
    "field": "email",
    "value": "invalid-email"
  }
}

// Not found error (404)
{
  "error": "NotFoundError",
  "message": "User not found",
  "statusCode": 404
}

// Internal server error (500)
{
  "error": "InternalServerError",
  "message": "An unexpected error occurred",
  "statusCode": 500,
  "stack": "..." // Only in development
}
```

### Transactional

Wraps route handler in a database transaction using AsyncLocalStorage.

```typescript
import { Transactional, getTransaction } from '@spfn/core';

// Route middleware
export const middleware = [Transactional()];

export const handler = async (c: RouteContext<typeof contract>) => {
  // Get transaction from context
  const tx = getTransaction();

  // All operations use same transaction
  const order = await create(orders, orderData, { tx });
  await create(orderItems, itemsData, { tx });
  await update(inventory, { id: productId }, { stock: newStock }, { tx });

  // Automatic commit on success, rollback on error
  return c.json(order);
};
```

#### Configuration Options

```typescript
export const middleware = [
  Transactional({
    isolationLevel: 'read committed', // Transaction isolation level
    timeout: 5000,                    // Transaction timeout (ms)
  }),
];
```

## Custom Middleware

### Basic Middleware

```typescript
import type { Context, Next } from 'hono';

// Simple middleware
export function customMiddleware() {
  return async (c: Context, next: Next) => {
    // Before handler
    console.log('Before:', c.req.path);

    await next(); // Call next middleware/handler

    // After handler
    console.log('After:', c.res.status);
  };
}

// Usage
export const middleware = [customMiddleware()];
```

### Authentication Middleware

```typescript
import type { Context, Next } from 'hono';
import { UnauthorizedError } from '@spfn/core';

export function auth() {
  return async (c: Context, next: Next) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedError('Missing authentication token');
    }

    // Verify token
    const user = await verifyToken(token);

    if (!user) {
      throw new UnauthorizedError('Invalid token');
    }

    // Store user in context
    c.set('user', user);

    await next();
  };
}

// Usage
export const middleware = [auth()];

export const handler = async (c: RouteContext<typeof contract>) => {
  // Access user from context
  const user = c.raw.get('user');
  return c.json({ userId: user.id });
};
```

### Rate Limiting Middleware

```typescript
import type { Context, Next } from 'hono';
import { TooManyRequestsError } from '@spfn/core';
import { getRedis } from '@spfn/core';

export function rateLimit(options: { limit: number; window: number }) {
  return async (c: Context, next: Next) => {
    const redis = getRedis();
    const ip = c.req.header('x-forwarded-for') || 'unknown';
    const key = `ratelimit:${ip}`;

    const current = await redis.incr(key);

    if (current === 1) {
      await redis.expire(key, options.window);
    }

    if (current > options.limit) {
      throw new TooManyRequestsError('Rate limit exceeded');
    }

    c.header('X-RateLimit-Limit', String(options.limit));
    c.header('X-RateLimit-Remaining', String(options.limit - current));

    await next();
  };
}

// Usage
export const middleware = [
  rateLimit({ limit: 100, window: 60 }), // 100 requests per minute
];
```

### Request ID Middleware

```typescript
import type { Context, Next } from 'hono';
import { randomUUID } from 'crypto';

export function requestId() {
  return async (c: Context, next: Next) => {
    const requestId = c.req.header('X-Request-ID') || randomUUID();

    // Store in context
    c.set('requestId', requestId);

    // Add to response headers
    c.header('X-Request-ID', requestId);

    await next();
  };
}

// Usage
export const middleware = [requestId()];
```

### Timing Middleware

```typescript
import type { Context, Next } from 'hono';

export function timing() {
  return async (c: Context, next: Next) => {
    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    c.header('X-Response-Time', `${duration}ms`);
  };
}

// Usage
export const middleware = [timing()];
```

## Middleware Application

### Global Middleware

```typescript
// src/server/server.config.ts
import { RequestLogger, ErrorHandler } from '@spfn/core';

export default {
  use: [
    RequestLogger(),
    ErrorHandler(),
  ],
} satisfies ServerConfig;
```

### Named Global Middleware

```typescript
// src/server/server.config.ts
import { auth, rateLimit } from '@/middleware';

export default {
  middlewares: [
    { name: 'auth', handler: auth() },
    { name: 'rateLimit', handler: rateLimit({ limit: 100, window: 60 }) },
  ],
} satisfies ServerConfig;

// Skip in route with meta
export const contract: RouteContract = {
  method: 'POST',
  path: '/login',
  meta: {
    skipMiddlewares: ['auth'], // Skip auth for login route
  },
  // ...
};
```

### Route-Specific Middleware

```typescript
// src/server/routes/users/[id]/delete.ts
import { auth } from '@/middleware';

export const middleware = [auth()];

export const handler = async (c: RouteContext<typeof contract>) => {
  // Only authenticated users can access
  const user = c.raw.get('user');
  // ...
};
```

### Contract-Level Middleware

```typescript
// Apply middleware via contract meta
export const contract: RouteContract = {
  method: 'POST',
  path: '/orders',
  body: OrderSchema,
  response: OrderResponseSchema,
  meta: {
    public: true, // Skip auth
    skipMiddlewares: ['rateLimit'], // Skip rate limiting
  },
};
```

## Middleware Order

Middleware execution order matters. They are executed in this order:

```typescript
// 1. Global middleware (server.config.ts - use)
export default {
  use: [timing(), requestId()],
};

// 2. Named global middleware (server.config.ts - middlewares)
export default {
  middlewares: [
    { name: 'auth', handler: auth() },
  ],
};

// 3. Route-specific middleware
export const middleware = [Transactional()];

// 4. Handler
export const handler = async (c) => { /* ... */ };
```

> **Note:** Execution Flow
> 1. Global middleware (use)
> 2. Named global middleware (middlewares)
> 3. Route-specific middleware
> 4. Route handler
> 5. Response (back through middleware chain)

## Best Practices

### 1. Keep Middleware Focused

```typescript
// ✅ Good: Single responsibility
export function auth() { /* only authentication */ }
export function rateLimit() { /* only rate limiting */ }

// ❌ Bad: Multiple responsibilities
export function authAndRateLimit() { /* authentication + rate limiting */ }
```

### 2. Use c.set() for Context Sharing

```typescript
// ✅ Good: Store in context
c.set('user', user);

// Handler access
const user = c.raw.get('user');
```

### 3. Always Call next()

```typescript
// ✅ Good: Call next()
export function middleware() {
  return async (c, next) => {
    // do work
    await next(); // Continue to next middleware
    // cleanup work
  };
}

// ❌ Bad: Missing next()
export function middleware() {
  return async (c, next) => {
    // do work
    // Forgot to call next() - request hangs!
  };
}
```

### 4. Handle Errors Properly

```typescript
// ✅ Good: Throw typed errors
if (!token) {
  throw new UnauthorizedError('Missing token');
}

// ❌ Bad: Generic error
if (!token) {
  throw new Error('Missing token');
}
```

> **✅ Success:** Next: CLI Commands
>
> Learn about Superfunction CLI commands for development and deployment.
>
> [CLI Commands →](/docs/api-reference/cli)
