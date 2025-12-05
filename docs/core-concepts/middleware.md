---
title: "Middleware"
description: "Learn how to create and manage middleware for authentication, logging, and more"
order: 6
available: true
---

# Middleware

Middleware allows you to run code before and after route handlers, enabling features like authentication, logging, rate limiting, and more.

## Middleware Types

Superfunction supports three types of middleware:

- **Global**: Runs on all routes (defined in server config)
- **Route-Specific**: Runs on specific routes only (using `.use()`)
- **Skip Control**: Routes can skip global middlewares (using `.skip()`)

## Defining Named Middleware

Use `defineMiddleware` to create named middlewares that can be referenced in `.skip()` calls:

```typescript
// src/server/middlewares/auth.ts
import { defineMiddleware } from '@spfn/core/route';
import { UnauthorizedError } from '@spfn/core/errors';

export const authMiddleware = defineMiddleware('auth', async (c, next) =>
{
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token)
    {
        throw new UnauthorizedError({ message: 'No token provided' });
    }

    try
    {
        const user = await verifyToken(token);
        c.set('user', user);
        await next();
    }
    catch (error)
    {
        throw new UnauthorizedError({ message: 'Invalid token' });
    }
});
```

```typescript
// src/server/middlewares/logging.ts
import { defineMiddleware } from '@spfn/core/route';

export const loggingMiddleware = defineMiddleware('logging', async (c, next) =>
{
    const start = Date.now();
    const { method, url } = c.req;

    console.log(`→ ${method} ${url}`);

    await next();

    const duration = Date.now() - start;
    console.log(`← ${method} ${url} ${c.res.status} (${duration}ms)`);
});
```

## Global Middleware

Configure global middlewares via router's `.use()` method (recommended):

```typescript
// src/server/router.ts
import { defineRouter } from '@spfn/core/route';
import { loggingMiddleware } from './middlewares/logging';
import { authMiddleware } from './middlewares/auth';
import { rateLimitMiddleware } from './middlewares/rate-limit';

export const appRouter = defineRouter({
    createUser,
    getUser,
})
.use([loggingMiddleware, authMiddleware, rateLimitMiddleware]);

// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './router';

export default defineServerConfig()
    .routes(appRouter)  // middlewares auto-applied from router
    .build();
```

Or configure explicitly in server config:

```typescript
// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { appRouter } from './router';
import { loggingMiddleware } from './middlewares/logging';
import { authMiddleware } from './middlewares/auth';
import { rateLimitMiddleware } from './middlewares/rate-limit';

export default defineServerConfig()
    .middlewares([
        loggingMiddleware,
        authMiddleware,
        rateLimitMiddleware,
    ])
    .routes(appRouter)
    .build();
```

> **Execution Order**
>
> Middlewares run in the order they are defined. In this example: logging → auth → rateLimit → route handler → rateLimit → auth → logging

## Route-Specific Middleware

Apply middleware to specific routes using `.use()`:

```typescript
// src/server/routes/admin.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { adminOnlyMiddleware } from '../middlewares/admin-only';
import { auditLogMiddleware } from '../middlewares/audit-log';

// Route with specific middleware
export const deleteUser = route.delete('/admin/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .use([adminOnlyMiddleware, auditLogMiddleware])  // ← Only runs for this route
    .handler(async (c) =>
    {
        const { params } = await c.data();
        await deleteUserById(params.id);
        return c.noContent();
    });
```

## Skipping Global Middleware

Routes can skip specific global middlewares using `.skip()`:

```typescript
// src/server/routes/public.ts
import { route } from '@spfn/core/route';

// Public endpoint - skip auth middleware
export const healthCheck = route.get('/health')
    .skip(['auth'])  // ← Auth middleware won't run
    .handler(async (c) =>
    {
        return { status: 'ok' };
    });

// Public data - skip auth but keep rate limiting
export const getPublicStats = route.get('/stats')
    .skip(['auth'])
    .handler(async (c) =>
    {
        return { users: 1000, posts: 5000 };
    });

// Skip all global middlewares
export const internalHealthCheck = route.get('/_internal/health')
    .skip('*')  // ← Skip all middlewares
    .handler(async (c) =>
    {
        return { status: 'ok', timestamp: Date.now() };
    });
```

> **Type-Safe Skip**
>
> When using `defineMiddleware`, the middleware name is preserved for type safety. Your IDE will provide autocomplete for middleware names in `.skip()` calls.

## Factory Middleware

Create parameterized middleware using factory pattern:

```typescript
// src/server/middlewares/permissions.ts
import { defineMiddleware } from '@spfn/core/route';
import { ForbiddenError } from '@spfn/core/errors';

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
```

```typescript
// Usage in routes
export const deletePost = route.delete('/posts/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .use([requirePermissions('posts:delete', 'admin:write')])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        await deletePostById(params.id);
        return c.noContent();
    });
```

### Factory with Exactly 2 Parameters

When your factory has exactly 2 parameters, use `defineMiddlewareFactory` to avoid misdetection:

```typescript
// src/server/middlewares/rate-limit.ts
import { defineMiddlewareFactory } from '@spfn/core/route';
import { TooManyRequestsError } from '@spfn/core/errors';

// Factory with 2 params needs defineMiddlewareFactory
export const rateLimiter = defineMiddlewareFactory('rateLimit',
    (limit: number, windowMs: number) => async (c, next) =>
    {
        // Rate limiting logic using limit and windowMs
        await next();
    }
);

// Usage
route.get('/api')
    .use([rateLimiter(100, 60000)])  // 100 requests per minute
    .handler(...);
```

> **Why defineMiddlewareFactory?**
>
> `defineMiddleware` detects factory vs regular middleware by checking parameter count. A 2-parameter function is assumed to be a regular middleware handler `(c, next) => ...`. Use `defineMiddlewareFactory` when your factory explicitly takes 2 parameters.

## Middleware Examples

### Rate Limiting

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
        throw new TooManyRequestsError({ message: 'Rate limit exceeded' });
    }

    c.header('X-RateLimit-Limit', max.toString());
    c.header('X-RateLimit-Remaining', (max - record.count).toString());

    await next();
});
```

### CORS

```typescript
// src/server/middlewares/cors.ts
import { defineMiddleware } from '@spfn/core/route';

export const corsMiddleware = defineMiddleware('cors', async (c, next) =>
{
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Allow-Credentials', 'true');

    // Handle preflight
    if (c.req.method === 'OPTIONS')
    {
        return c.text('', 204);
    }

    await next();
});
```

### Request ID

```typescript
// src/server/middlewares/request-id.ts
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

### Timing

```typescript
// src/server/middlewares/timing.ts
import { defineMiddleware } from '@spfn/core/route';

export const timingMiddleware = defineMiddleware('timing', async (c, next) =>
{
    const start = performance.now();

    await next();

    const duration = performance.now() - start;
    c.header('X-Response-Time', `${duration.toFixed(2)}ms`);
});
```

## Accessing Context in Handlers

Middleware can store data in context for handlers to use:

### Setting Context Variables

```typescript
// src/server/middlewares/auth.ts
export const authMiddleware = defineMiddleware('auth', async (c, next) =>
{
    const user = await authenticateUser(c);

    // Store user in context
    c.set('user', user);
    c.set('userId', user.id);

    await next();
});
```

### Reading Context in Handlers

```typescript
// src/server/routes/teams.ts
export const createTeam = route.post('/teams')
    .input({
        body: Type.Object({
            name: Type.String(),
            slug: Type.String()
        })
    })
    .handler(async (c) =>
    {
        // Access user from context (set by auth middleware)
        const user = c.raw.get('user');
        const userId = c.raw.get('userId');

        const { body } = await c.data();

        const team = await createTeamInDb({
            ...body,
            createdBy: userId
        });

        return c.created(team, `/teams/${team.id}`);
    });
```

## Error Handling in Middleware

Throw errors in middleware to stop request processing:

```typescript
import { UnauthorizedError, ForbiddenError } from '@spfn/core/errors';

export const authMiddleware = defineMiddleware('auth', async (c, next) =>
{
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    // No token → 401 Unauthorized
    if (!token)
    {
        throw new UnauthorizedError({ message: 'Authentication required' });
    }

    try
    {
        const user = await verifyToken(token);

        // Token valid but user inactive → 403 Forbidden
        if (!user.isActive)
        {
            throw new ForbiddenError({ message: 'Account is inactive' });
        }

        c.set('user', user);
        await next();
    }
    catch (error)
    {
        // Invalid token → 401 Unauthorized
        throw new UnauthorizedError({ message: 'Invalid token' });
    }
});
```

## Conditional Middleware

Create middleware that conditionally executes:

```typescript
// src/server/middlewares/conditional-logger.ts
export const conditionalLogger = defineMiddleware('devLogger', async (c, next) =>
{
    // Only log in development
    if (process.env.NODE_ENV === 'development')
    {
        console.log(`${c.req.method} ${c.req.url}`);
    }

    await next();
});
```

```typescript
// src/server/middlewares/feature-flag.ts
import { NotFoundError } from '@spfn/core/errors';

export const featureFlagMiddleware = defineMiddleware('featureFlag',
    (flagName: string) => async (c, next) =>
    {
        const isEnabled = await checkFeatureFlag(flagName);

        if (!isEnabled)
        {
            throw new NotFoundError({ resource: 'Feature' });
        }

        await next();
    }
);

// Usage
export const betaFeature = route.get('/beta/new-feature')
    .use([featureFlagMiddleware('new-feature')])
    .handler(async (c) =>
    {
        return { feature: 'enabled' };
    });
```

## Best Practices

### 1. Order Matters

Place logging first and auth/rate-limit after:

```typescript
// ✅ Good order
export default defineServerConfig()
    .middlewares([
        loggingMiddleware,       // First - logs all requests
        timingMiddleware,        // Timing for all requests
        corsMiddleware,          // CORS before other checks
        authMiddleware,          // Authentication
        rateLimitMiddleware,     // Rate limiting last
    ])
    .routes(appRouter)
    .build();
```

### 2. Always Call next()

Unless you're returning early, always call `await next()`:

```typescript
// ✅ Good: Call next()
export const middleware = defineMiddleware('example', async (c, next) =>
{
    console.log('Before');
    await next();
    console.log('After');
});

// ❌ Bad: Forgot to call next()
export const badMiddleware = defineMiddleware('bad', async (c, next) =>
{
    console.log('Before');
    // Request hangs! Handler never runs
});
```

### 3. Use Named Middlewares

Give middlewares clear names for `.skip()`:

```typescript
// ✅ Good: Clear names
export const authMiddleware = defineMiddleware('auth', ...);
export const rateLimitMiddleware = defineMiddleware('rateLimit', ...);

// In routes
export const publicRoute = route.get('/public')
    .skip(['auth'])  // Clear what's being skipped
    .handler(...);
```

### 4. Keep Middleware Focused

Each middleware should do one thing well:

```typescript
// ✅ Good: Separate concerns
loggingMiddleware     // Just logs requests
authMiddleware        // Just handles auth
rateLimitMiddleware   // Just rate limits

// ❌ Bad: Does too much
monolithicMiddleware  // Logs, auth, rate limit, and more
```

### 5. Handle Errors Properly

Don't swallow errors in middleware:

```typescript
// ✅ Good: Let errors propagate
export const middleware = defineMiddleware('example', async (c, next) =>
{
    // Validation
    if (!isValid(c))
    {
        throw new ValidationError({ message: 'Invalid request' });
    }

    await next();  // Errors from handler will propagate
});

// ❌ Bad: Swallowing errors
export const badMiddleware = defineMiddleware('bad', async (c, next) =>
{
    try
    {
        await next();
    }
    catch (e)
    {
        // Silent failure - bad!
    }
});
```

> **Core Concepts Complete!**
>
> You've completed all Core Concepts. Now explore practical guides for database, authentication, and deployment.
>
> [Database Guide →](/docs/guides/database)