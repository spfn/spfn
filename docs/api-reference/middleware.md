---
title: "Middleware"
description: "Complete API reference for built-in middleware and custom middleware creation"
order: 4
available: true
---

# Middleware

Superfunction provides built-in middleware for common patterns and supports custom middleware creation using `defineMiddleware`.

## defineMiddleware

Create named middleware that can be referenced in `.skip()` calls.

```typescript
import { defineMiddleware } from '@spfn/core/route';

export const authMiddleware = defineMiddleware('auth', async (c, next) =>
{
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token)
    {
        throw new UnauthorizedError({ message: 'No token provided' });
    }

    const user = await verifyToken(token);
    c.set('user', user);

    await next();
});
```

### Signature

```typescript
function defineMiddleware<TName extends string>(
    name: TName,
    handler: MiddlewareHandler,
    options?: DefineMiddlewareOptions
): NamedMiddleware<TName>;

// Factory pattern for parameterized middleware
function defineMiddleware<TName extends string, TArgs extends any[]>(
    name: TName,
    factory: (...args: TArgs) => MiddlewareHandler,
    options?: DefineMiddlewareOptions
): (...args: TArgs) => NamedMiddleware<TName>;
```

### Options

```typescript
interface DefineMiddlewareOptions
{
    /**
     * Server-level middleware names to auto-skip when this middleware is used at route level.
     */
    skips?: string[];
}
```

The `skips` option allows a middleware to automatically skip specified global middlewares when used at route level. This eliminates the need for manual `.skip()` calls.

```typescript
// optionalAuth auto-skips the global 'auth' middleware
export const optionalAuth = defineMiddleware('optionalAuth', handler, {
    skips: ['auth']
});

// No need for .skip(['auth']) — handled automatically
route.get('/products')
    .use([optionalAuth])
    .handler(async (c) => { /* ... */ });
```

### Factory Middleware

Create parameterized middleware:

```typescript
export const requirePermissions = defineMiddleware('permission',
    (...permissions: string[]) => async (c, next) =>
    {
        const user = c.get('user');

        const hasAll = permissions.every(p => user.permissions.includes(p));
        if (!hasAll)
        {
            throw new ForbiddenError({ message: 'Insufficient permissions' });
        }

        await next();
    }
);

// Usage
export const deletePost = route.delete('/posts/:id')
    .use([requirePermissions('posts:delete', 'admin:write')])
    .handler(async (c) => { /* ... */ });
```

## Built-in Middleware

### RequestLogger

Automatic API request/response logging with performance monitoring.

```typescript
import { RequestLogger } from '@spfn/core';

// In server config
export default defineServerConfig()
    .middlewares([
        RequestLogger()
    ])
    .routes(appRouter)
    .build();

// With configuration
RequestLogger({
    excludePaths: ['/health', '/ping'],
    sensitiveFields: ['password', 'token', 'apiKey'],
    slowRequestThreshold: 1000, // ms
})
```

#### Configuration Options

| Option | Type | Default |
|--------|------|---------|
| `excludePaths` | `string[]` | `['/health', '/ping']` |
| `sensitiveFields` | `string[]` | `['password', 'token', ...]` |
| `slowRequestThreshold` | `number` | `1000` (1 second) |

#### Log Output

```json
// Request log
{
  "level": "info",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1705315800000_abc123",
  "method": "POST",
  "path": "/users",
  "body": { "email": "user@example.com", "password": "***" }
}

// Response log
{
  "level": "info",
  "requestId": "req_1705315800000_abc123",
  "status": 201,
  "duration": 123,
  "message": "Request completed"
}
```

### ErrorHandler

Global error handler for consistent error responses.

```typescript
import { ErrorHandler } from '@spfn/core';

export default defineServerConfig()
    .middlewares([
        ErrorHandler({
            includeStack: process.env.NODE_ENV === 'development'
        })
    ])
    .routes(appRouter)
    .build();
```

#### Configuration Options

| Option | Type | Default |
|--------|------|---------|
| `includeStack` | `boolean` | `NODE_ENV !== 'production'` |
| `enableLogging` | `boolean` | `true` |
| `onError` | `(err, context) => void \| Promise<void>` | `undefined` |

#### onError Callback

Asynchronous callback invoked when an error occurs. Does not block the response. Useful for external notifications (Slack, PagerDuty, etc.).

Can also be configured via `ServerConfig.middleware.onError`:

```typescript
export default defineServerConfig()
    .middleware({
        onError: (err, ctx) =>
        {
            console.log(ctx.statusCode, ctx.method, ctx.path, err.message);
        },
    })
    .routes(appRouter)
    .build();
```

#### OnErrorContext

Context object passed to the `onError` callback:

```typescript
interface OnErrorContext
{
    statusCode: number;           // HTTP status code
    path: string;                 // Request path
    method: string;               // HTTP method
    requestId?: string;           // Request ID generated by RequestLogger
    timestamp: string;            // ISO 8601 timestamp
    userId?: string;              // Authenticated user ID (when auth middleware is used)
    request: {
        headers: Record<string, string>;  // Request headers (sensitive values masked)
        query: Record<string, string>;    // Query parameters
    };
}
```

Sensitive headers (`authorization`, `cookie`, `x-api-key`, `x-auth-token`) are automatically masked with `***`.

#### Error Response Format

```json
// Validation error (400)
{
  "error": "ValidationError",
  "message": "Invalid email format",
  "statusCode": 400,
  "details": { "field": "email" }
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

export const createOrder = route.post('/orders')
    .input({
        body: OrderSchema
    })
    .use([Transactional()])
    .handler(async (c) =>
    {
        const { body } = await c.data();

        // Get transaction from context
        const tx = getTransaction();

        // All operations use same transaction
        const order = await create(orders, body, { tx });
        await create(orderItems, body.items, { tx });

        // Automatic commit on success, rollback on error
        return c.created(order);
    });
```

#### Configuration Options

```typescript
Transactional({
    isolationLevel: 'read committed', // Transaction isolation level
    timeout: 5000,                    // Transaction timeout (ms)
})
```

## @spfn/auth Middleware

`@spfn/auth` provides pre-built authentication and role-based access control middleware.

### authenticate

Verifies client-signed JWT token and attaches `AuthContext` (user, userId, keyId, role) to the request context. The role is fetched from DB alongside the user in a single query (leftJoin).

```typescript
import { authenticate } from '@spfn/auth/server/middleware';
import { getUser, getUserId, getRole } from '@spfn/auth/server';

// Global registration
export default defineServerConfig()
    .middlewares([authenticate])
    .routes(appRouter)
    .build();

// Access auth data in handlers
export const profileRoute = route.get('/profile')
    .handler(async (c) =>
    {
        const user = getUser(c);          // User entity
        const userId = getUserId(c);      // string
        const role = getRole(c);          // 'admin' | null
        return { email: user.email, role };
    });
```

### requireRole

Require the authenticated user to have one of the specified roles. Uses `auth.role` from the context (no additional DB query).

```typescript
import { authenticate, requireRole } from '@spfn/auth/server/middleware';

// Single role
export const configRoute = route.get('/admin/config')
    .use([authenticate, requireRole('superadmin')])
    .handler(async (c) => { /* ... */ });

// Multiple roles (OR condition)
export const dashboardRoute = route.get('/admin/dashboard')
    .use([authenticate, requireRole('admin', 'superadmin')])
    .handler(async (c) => { /* ... */ });
```

### optionalAuth

Optional authentication middleware for routes that serve both authenticated and unauthenticated users. Automatically skips the global `auth` middleware — no need for `.skip(['auth'])`.

- No token → continues without auth context
- Invalid/expired token → continues without auth context
- Valid token → sets `AuthContext` normally

```typescript
import { optionalAuth } from '@spfn/auth/server/middleware';
import { getOptionalAuth } from '@spfn/auth/server';

// .skip(['auth']) is NOT needed — optionalAuth handles it automatically
export const getProducts = route.get('/products')
    .use([optionalAuth])
    .handler(async (c) =>
    {
        const auth = getOptionalAuth(c);  // AuthContext | undefined

        if (auth)
        {
            // Authenticated user: personalized response
            return getPersonalizedProducts(auth.userId);
        }

        // Unauthenticated user: public response
        return getPublicProducts();
    });
```

#### Context Helpers

| Helper | Return Type | Description |
|--------|------------|-------------|
| `getOptionalAuth(c)` | `AuthContext \| undefined` | Returns auth context or undefined |
| `getAuth(c)` | `AuthContext` | Use only when auth is guaranteed |

### roleGuard

Advanced role-based access control with allow/deny options. Uses `auth.role` from the context (no additional DB query).

```typescript
import { authenticate, roleGuard } from '@spfn/auth/server/middleware';

// Allow specific roles
export const adminRoute = route.get('/admin')
    .use([authenticate, roleGuard({ allow: ['admin', 'superadmin'] })])
    .handler(async (c) => { /* ... */ });

// Deny specific roles
export const contentRoute = route.get('/content')
    .use([authenticate, roleGuard({ deny: ['banned'] })])
    .handler(async (c) => { /* ... */ });

// Combined allow and deny
export const manageRoute = route.get('/manage')
    .use([authenticate, roleGuard({ allow: ['admin', 'manager'], deny: ['suspended'] })])
    .handler(async (c) => { /* ... */ });
```

## Custom Middleware

### Basic Middleware

```typescript
import { defineMiddleware } from '@spfn/core/route';

export const timingMiddleware = defineMiddleware('timing', async (c, next) =>
{
    const start = Date.now();

    await next();

    const duration = Date.now() - start;
    c.header('X-Response-Time', `${duration}ms`);
});
```

### Authentication Middleware

```typescript
import { defineMiddleware } from '@spfn/core/route';
import { UnauthorizedError } from '@spfn/core/errors';

export const authMiddleware = defineMiddleware('auth', async (c, next) =>
{
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token)
    {
        throw new UnauthorizedError({ message: 'Missing authentication token' });
    }

    const user = await verifyToken(token);

    if (!user)
    {
        throw new UnauthorizedError({ message: 'Invalid token' });
    }

    c.set('user', user);
    await next();
});
```

### Rate Limiting Middleware

```typescript
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
        throw new TooManyRequestsError({ message: 'Rate limit exceeded' });
    }

    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', (max - record.count).toString());

    await next();
});
```

### Request ID Middleware

```typescript
import { defineMiddleware } from '@spfn/core/route';
import { randomUUID } from 'crypto';

export const requestIdMiddleware = defineMiddleware('requestId', async (c, next) =>
{
    const requestId = c.req.header('X-Request-ID') || randomUUID();

    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);

    await next();
});
```

## Middleware Application

### Global Middleware (Server Config)

```typescript
// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './router';
import { loggingMiddleware, authMiddleware, rateLimitMiddleware } from './middlewares';

export default defineServerConfig()
    .middlewares([
        loggingMiddleware,
        authMiddleware,
        rateLimitMiddleware,
    ])
    .routes(appRouter)
    .build();
```

### Route-Specific Middleware

```typescript
// Apply middleware to specific routes using .use()
export const deleteUser = route.delete('/admin/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .use([adminOnlyMiddleware, auditLogMiddleware])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        await deleteUserById(params.id);
        return c.noContent();
    });
```

### Skipping Global Middleware

```typescript
// Skip specific global middlewares using .skip()
export const healthCheck = route.get('/health')
    .skip(['auth'])  // Skip auth middleware
    .handler(async (c) =>
    {
        return { status: 'ok' };
    });

// Skip all global middlewares
export const internalHealthCheck = route.get('/_internal/health')
    .skip('*')  // Skip all middlewares
    .handler(async (c) =>
    {
        return { status: 'ok', timestamp: Date.now() };
    });
```

## Middleware Execution Order

Middleware executes in this order:

```typescript
// 1. Global middleware (from server config)
export default defineServerConfig()
    .middlewares([
        loggingMiddleware,    // First
        authMiddleware,       // Second
        rateLimitMiddleware,  // Third
    ])

// 2. Route-specific middleware (.use())
export const route = route.post('/orders')
    .use([validateOrderMiddleware])  // Fourth
    .handler(async (c) => { ... });  // Fifth (handler)

// Response flows back through middleware in reverse order
```

## Middleware Types

### MiddlewareHandler

```typescript
type MiddlewareHandler = (
    c: Context,
    next: () => Promise<void>
) => Promise<void | Response>;
```

### NamedMiddleware

```typescript
interface NamedMiddleware<TName extends string = string> {
    name: TName;
    handler: MiddlewareHandler;
    skips?: string[];  // Server-level middlewares to auto-skip
}
```

## Best Practices

### 1. Keep Middleware Focused

```typescript
// ✅ Good: Single responsibility
export const authMiddleware = defineMiddleware('auth', ...);
export const rateLimitMiddleware = defineMiddleware('rateLimit', ...);

// ❌ Bad: Multiple responsibilities
export const authAndRateLimitMiddleware = defineMiddleware('authAndRateLimit', ...);
```

### 2. Always Call next()

```typescript
// ✅ Good: Call next()
export const middleware = defineMiddleware('example', async (c, next) =>
{
    // Before handler
    console.log('Before');

    await next();  // Continue to next middleware/handler

    // After handler
    console.log('After');
});

// ❌ Bad: Missing next()
export const badMiddleware = defineMiddleware('bad', async (c, next) =>
{
    console.log('Before');
    // Forgot to call next() - request hangs!
});
```

### 3. Use c.set() for Context Sharing

```typescript
// ✅ Good: Store in context
c.set('user', user);
c.set('requestId', requestId);

// Handler access via c.raw.get()
const user = c.raw.get('user');
```

### 4. Handle Errors with Typed Errors

```typescript
import { UnauthorizedError, ForbiddenError } from '@spfn/core/errors';

// ✅ Good: Throw typed errors
if (!token)
{
    throw new UnauthorizedError({ message: 'Missing token' });
}

// ❌ Bad: Generic error
if (!token)
{
    throw new Error('Missing token');
}
```

### 5. Use Named Middleware for Skip Support

```typescript
// ✅ Good: Named middleware can be skipped
export const authMiddleware = defineMiddleware('auth', ...);

// Routes can skip by name
export const publicRoute = route.get('/public')
    .skip(['auth'])
    .handler(...);
```

### 6. Order Matters

Place logging first, then auth, then rate limiting:

```typescript
export default defineServerConfig()
    .middlewares([
        loggingMiddleware,       // First - logs all requests
        timingMiddleware,        // Timing for all requests
        corsMiddleware,          // CORS before auth
        authMiddleware,          // Authentication
        rateLimitMiddleware,     // Rate limiting last
    ])
    .routes(appRouter)
    .build();
```

> **Next: CLI Commands**
>
> Learn about Superfunction CLI commands for development and deployment.
>
> [CLI Commands →](/docs/api-reference/cli)