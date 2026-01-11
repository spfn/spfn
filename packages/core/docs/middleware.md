# Middleware

Named middleware system with route-level skip control.

## Define Middleware

### Regular Middleware

```typescript
import { defineMiddleware } from '@spfn/core/route';

export const authMiddleware = defineMiddleware('auth', async (c, next) => {
    const token = c.req.header('authorization');

    if (!token)
    {
        return c.json({ error: 'Unauthorized' }, 401);
    }

    const user = await verifyToken(token);
    c.set('user', user);

    await next();
});
```

### Factory Middleware

Middleware with parameters:

```typescript
export const requireRole = defineMiddleware('role',
    (...roles: string[]) => async (c, next) => {
        const user = c.get('user');

        if (!roles.includes(user.role))
        {
            return c.json({ error: 'Forbidden' }, 403);
        }

        await next();
    }
);

// Usage
route.get('/admin')
    .use([requireRole('admin', 'superadmin')])
    .handler(...)
```

### Two-Parameter Factory

For factory with exactly 2 parameters, use `defineMiddlewareFactory`:

```typescript
import { defineMiddlewareFactory } from '@spfn/core/route';

export const rateLimiter = defineMiddlewareFactory('rateLimit',
    (limit: number, windowMs: number) => async (c, next) => {
        // Rate limit logic
        await next();
    }
);

// Usage
route.get('/api')
    .use([rateLimiter(100, 60000)])  // 100 requests per minute
    .handler(...)
```

---

## Register Global Middleware

```typescript
// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { authMiddleware, loggerMiddleware, corsMiddleware } from './middlewares';

export default defineServerConfig()
    .middlewares([
        loggerMiddleware,
        corsMiddleware,
        authMiddleware
    ])
    .routes(appRouter)
    .build();
```

**Execution order:**
1. Global middlewares (in registration order)
2. Route-level middlewares (from `.use()`)
3. Validation middleware (automatic)
4. Route handler

---

## Use in Routes

### Add Middleware

```typescript
import { Transactional } from '@spfn/core/db';
import { authMiddleware, requireRole } from './middlewares';

route.post('/admin/users')
    .use([authMiddleware, requireRole('admin'), Transactional()])
    .handler(async (c) => {
        const user = c.raw.get('user');  // From authMiddleware
        // ...
    });
```

### Skip Global Middleware

```typescript
// Skip specific middlewares by name
route.get('/public/health')
    .skip(['auth', 'rateLimit'])
    .handler(async (c) => {
        return { status: 'ok' };
    });

// Skip all global middlewares
route.get('/webhooks/stripe')
    .skip('*')
    .handler(async (c) => {
        // No global middleware applied
    });
```

**Note:** Route-level middlewares (`.use()`) are never skipped.

---

## Common Middleware Patterns

### Authentication

```typescript
export const authMiddleware = defineMiddleware('auth', async (c, next) => {
    const token = c.req.header('authorization')?.replace('Bearer ', '');

    if (!token)
    {
        return c.json({ error: 'Missing token' }, 401);
    }

    try
    {
        const payload = await verifyJWT(token);
        c.set('userId', payload.sub);
        c.set('user', await userRepo.findById(payload.sub));
        await next();
    }
    catch
    {
        return c.json({ error: 'Invalid token' }, 401);
    }
});
```

### Role-based Access

```typescript
export const requirePermissions = defineMiddleware('permission',
    (...permissions: string[]) => async (c, next) => {
        const user = c.get('user');

        const hasPermission = permissions.every(p =>
            user.permissions.includes(p)
        );

        if (!hasPermission)
        {
            return c.json({ error: 'Insufficient permissions' }, 403);
        }

        await next();
    }
);

// Usage
route.delete('/posts/:id')
    .use([requirePermissions('posts:delete')])
    .handler(...)
```

### Rate Limiting

```typescript
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export const rateLimiter = defineMiddlewareFactory('rateLimit',
    (limit: number, windowMs: number) => async (c, next) => {
        const key = c.req.header('x-forwarded-for') || 'unknown';
        const now = Date.now();

        const record = requestCounts.get(key);

        if (!record || now > record.resetAt)
        {
            requestCounts.set(key, { count: 1, resetAt: now + windowMs });
        }
        else if (record.count >= limit)
        {
            return c.json({ error: 'Too many requests' }, 429);
        }
        else
        {
            record.count++;
        }

        await next();
    }
);
```

### Request Logging

```typescript
export const requestLogger = defineMiddleware('requestLogger', async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    console.log(`${method} ${path} ${status} ${duration}ms`);
});
```

### CORS

```typescript
export const corsMiddleware = defineMiddleware('cors', async (c, next) => {
    const origin = c.req.header('origin');

    if (origin && allowedOrigins.includes(origin))
    {
        c.header('Access-Control-Allow-Origin', origin);
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }

    if (c.req.method === 'OPTIONS')
    {
        return c.body(null, 204);
    }

    await next();
});
```

---

## Middleware Deduplication

When the same middleware is registered both globally and in a route, it's automatically deduplicated:

```typescript
// Registered globally
.middlewares([authMiddleware])

// Also used in route
route.get('/users')
    .use([authMiddleware])  // Skipped (already applied globally)
    .handler(...)
```

---

## Access Context Data

### Set Data

```typescript
defineMiddleware('auth', async (c, next) => {
    c.set('user', user);
    c.set('sessionId', sessionId);
    await next();
});
```

### Get Data in Handler

```typescript
route.get('/profile')
    .handler(async (c) => {
        const user = c.raw.get('user');
        const sessionId = c.raw.get('sessionId');
        // ...
    });
```

---

## Best Practices

### Do

```typescript
// 1. Use meaningful names for skip control
export const authMiddleware = defineMiddleware('auth', ...);
export const rateLimiter = defineMiddleware('rateLimit', ...);

// 2. Set context data for downstream use
c.set('user', user);

// 3. Return early for unauthorized requests
if (!token) return c.json({ error: 'Unauthorized' }, 401);

// 4. Always call next() for successful middleware
await next();
```

### Don't

```typescript
// 1. Don't forget to call next()
defineMiddleware('logger', async (c, next) => {
    console.log(c.req.path);
    // Missing next() - request hangs!
});

// 2. Don't use generic names
defineMiddleware('middleware1', ...);  // Bad

// 3. Don't throw errors - return responses
defineMiddleware('auth', async (c, next) => {
    if (!token) throw new Error('No token');  // Bad
    if (!token) return c.json({ error: 'No token' }, 401);  // Good
});
```
