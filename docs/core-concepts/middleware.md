---
title: "Middleware"
description: "Learn how to create and manage middleware for authentication, logging, and more"
order: 5
available: true
---

# Middleware

Middleware allows you to run code before and after route handlers, enabling features like authentication, logging, rate limiting, and more.

## Middleware Types

SPFN supports three types of middleware:

- **Global**: Runs on all routes
- **Route-Specific**: Runs on specific routes only
- **Contract-Level**: Controlled via meta.skipMiddlewares

## Global Middleware

Configure global middlewares in `src/server/server.config.ts`:

```typescript
// src/server/server.config.ts
import type { ServerConfig } from '@spfn/core';
import { loggingMiddleware } from './middlewares/logging';
import { authMiddleware } from './middlewares/auth';
import { rateLimitMiddleware } from './middlewares/rate-limit';

export default {
  middlewares: [
    { name: 'logging', handler: loggingMiddleware() },
    { name: 'auth', handler: authMiddleware() },
    { name: 'rateLimit', handler: rateLimitMiddleware() }
  ]
} satisfies ServerConfig;
```

> **Execution Order**
>
> Middlewares run in the order they are defined. In this example: logging → auth → rateLimit → route handler → rateLimit → auth → logging

## Writing Middleware

Middleware receives the raw Hono context and a `next` function. Unlike route handlers, middleware does not have access to contract-typed context.

> **Important: Raw Context Only**
>
> Middleware receives the raw Hono `Context`, not the type-safe contract context. You cannot use `c.data()`, `c.params`, or `c.query` with contract types in middleware. These are only available in route handlers.

### Basic Structure

```typescript
// src/server/middlewares/example.ts
import type { Context, Next } from 'hono';

export function exampleMiddleware() {
  return async (c: Context, next: Next) => {
    // ⚠️ c is raw Hono Context, not contract-typed context

    // 1. Code before route handler
    console.log('Before handler');

    // 2. Call next middleware or route handler
    await next();

    // 3. Code after route handler
    console.log('After handler');
  };
}
```

### Logging Middleware

```typescript
// src/server/middlewares/logging.ts
import type { Context, Next } from 'hono';

export function loggingMiddleware() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const { method, url } = c.req;

    console.log(`→ ${method} ${url}`);

    await next();

    const duration = Date.now() - start;
    console.log(`← ${method} ${url} ${c.res.status} (${duration}ms)`);
  };
}
```

### Authentication Middleware

```typescript
// src/server/middlewares/auth.ts
import type { Context, Next } from 'hono';
import { UnauthorizedError } from '@spfn/core';

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    try {
      // Verify token and attach user to context
      const user = await verifyToken(token);
      c.set('user', user);

      await next();
    } catch (error) {
      throw new UnauthorizedError('Invalid token');
    }
  };
}

async function verifyToken(token: string) {
  // Implement token verification logic
  // Return user object or throw error
  return { id: 1, email: 'user@example.com' };
}
```

### Rate Limiting Middleware

```typescript
// src/server/middlewares/rate-limit.ts
import type { Context, Next } from 'hono';
import { TooManyRequestsError } from '@spfn/core';

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(options = { max: 100, windowMs: 60000 }) {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('x-forwarded-for') || 'unknown';
    const now = Date.now();

    let record = rateLimitMap.get(ip);

    // Reset if window expired
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + options.windowMs };
      rateLimitMap.set(ip, record);
    }

    record.count++;

    if (record.count > options.max) {
      throw new TooManyRequestsError('Rate limit exceeded');
    }

    // Add rate limit headers
    c.header('X-RateLimit-Limit', options.max.toString());
    c.header('X-RateLimit-Remaining', (options.max - record.count).toString());

    await next();
  };
}
```

## Route-Specific Middleware

Apply middleware to specific routes using the three-argument `bind()`:

```typescript
// src/server/routes/admin/users/index.ts
import { createApp } from '@spfn/core/route';
import { getAdminUsersContract, deleteAdminUserContract } from '@/lib/contracts/admin/users';
import { adminOnlyMiddleware } from '@/server/middlewares/admin-only';

const app = createApp();

// Regular route - no extra middleware
app.bind(getAdminUsersContract, async (c) => {
  // Handler implementation
});

// Route with specific middleware
app.bind(
  deleteAdminUserContract,
  [adminOnlyMiddleware],  // ← Only runs for this route
  async (c) => {
    const { id } = c.params;
    await deleteUser(id);
    return c.json({ success: true });
  }
);

export default app;
```

## Contract-Level Control

Skip specific global middlewares using `meta.skipMiddlewares`:

```typescript
// src/lib/contracts/teams.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

// Public endpoint - skip auth
export const getTeamsContract = {
  method: 'GET' as const,
  path: '/teams',
  response: TeamsResponseSchema,
  meta: {
    skipMiddlewares: ['auth']  // ← Auth middleware won't run
  }
} as const satisfies RouteContract;

// Protected endpoint - auth required
export const createTeamContract = {
  method: 'POST' as const,
  path: '/teams',
  body: CreateTeamSchema,
  response: TeamSchema
  // No skipMiddlewares → all global middlewares run
} as const satisfies RouteContract;
```

> **Method-Level Control**
>
> This allows different HTTP methods on the same path to have different middleware policies. For example, GET /teams can be public while POST /teams requires authentication.

## Accessing Context in Middleware

Store data in context to share between middleware and handlers:

### Setting Context Variables

```typescript
// src/server/middlewares/auth.ts
export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const user = await authenticateUser(c);

    // Store user in context
    c.set('user', user);
    c.set('userId', user.id);

    await next();
  };
}
```

### Reading Context in Handlers

```typescript
// src/server/routes/teams/index.ts
app.bind(createTeamContract, async (c) => {
  // Access user from context (set by auth middleware)
  const user = c.raw.get('user');
  const userId = c.raw.get('userId');

  const data = await c.data();

  const team = await create(teamsTable, {
    ...data,
    createdBy: userId
  });

  return c.json(team);
});
```

## Error Handling in Middleware

Throw errors in middleware to stop request processing:

```typescript
import { UnauthorizedError, ForbiddenError } from '@spfn/core';

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    // No token → 401 Unauthorized
    if (!token) {
      throw new UnauthorizedError('Authentication required');
    }

    try {
      const user = await verifyToken(token);

      // Token valid but user inactive → 403 Forbidden
      if (!user.isActive) {
        throw new ForbiddenError('Account is inactive');
      }

      c.set('user', user);
      await next();
    } catch (error) {
      // Invalid token → 401 Unauthorized
      throw new UnauthorizedError('Invalid token');
    }
  };
}
```

## Common Middleware Patterns

### CORS Middleware

```typescript
// src/server/middlewares/cors.ts
import type { Context, Next } from 'hono';

export function corsMiddleware(options = {
  origin: '*',
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  credentials: true
}) {
  return async (c: Context, next: Next) => {
    c.header('Access-Control-Allow-Origin', options.origin);
    c.header('Access-Control-Allow-Methods', options.methods);
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (options.credentials) {
      c.header('Access-Control-Allow-Credentials', 'true');
    }

    // Handle preflight
    if (c.req.method === 'OPTIONS') {
      return c.text('', 204);
    }

    await next();
  };
}
```

### Request ID Middleware

```typescript
// src/server/middlewares/request-id.ts
import type { Context, Next } from 'hono';
import { randomUUID } from 'crypto';

export function requestIdMiddleware() {
  return async (c: Context, next: Next) => {
    const requestId = c.req.header('X-Request-ID') || randomUUID();

    c.set('requestId', requestId);
    c.header('X-Request-ID', requestId);

    await next();
  };
}
```

### Timing Middleware

```typescript
// src/server/middlewares/timing.ts
import type { Context, Next } from 'hono';

export function timingMiddleware() {
  return async (c: Context, next: Next) => {
    const start = performance.now();

    await next();

    const duration = performance.now() - start;
    c.header('X-Response-Time', `${duration.toFixed(2)}ms`);
  };
}
```

## Conditional Middleware

Create middleware that conditionally executes based on environment or configuration:

```typescript
// src/server/middlewares/conditional-logger.ts
export function conditionalLogger() {
  return async (c: Context, next: Next) => {
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`${c.req.method} ${c.req.url}`);
    }

    await next();
  };
}

// src/server/middlewares/feature-flag.ts
export function featureFlagMiddleware(flagName: string) {
  return async (c: Context, next: Next) => {
    const isEnabled = await checkFeatureFlag(flagName);

    if (!isEnabled) {
      return c.json({ error: 'Feature not available' }, 404);
    }

    await next();
  };
}
```

## Best Practices

### 1. Order Matters

Place logging first and auth/rate-limit after:

```typescript
// ✅ Good order
middlewares: [
  { name: 'logging', handler: loggingMiddleware() },      // First
  { name: 'timing', handler: timingMiddleware() },
  { name: 'cors', handler: corsMiddleware() },
  { name: 'auth', handler: authMiddleware() },            // Before protected logic
  { name: 'rateLimit', handler: rateLimitMiddleware() }   // Last check
]
```

### 2. Always Call next()

Unless you're returning early, always call `await next()`:

```typescript
// ✅ Good: Call next()
export function middleware() {
  return async (c: Context, next: Next) => {
    console.log('Before');
    await next();
    console.log('After');
  };
}

// ❌ Bad: Forgot to call next()
export function middleware() {
  return async (c: Context, next: Next) => {
    console.log('Before');
    // Request hangs! Handler never runs
  };
}
```

### 3. Use Named Middlewares

Give middlewares clear names for `skipMiddlewares`:

```typescript
// ✅ Good: Clear names
middlewares: [
  { name: 'auth', handler: authMiddleware() },
  { name: 'rateLimit', handler: rateLimitMiddleware() }
]

// In contract
meta: {
  skipMiddlewares: ['auth']  // Clear what's being skipped
}
```

### 4. Keep Middleware Focused

Each middleware should do one thing well:

```typescript
// ✅ Good: Separate concerns
loggingMiddleware()     // Just logs requests
authMiddleware()        // Just handles auth
rateLimitMiddleware()   // Just rate limits

// ❌ Bad: Does too much
monolithicMiddleware()  // Logs, auth, rate limit, and more
```

> **Core Concepts Complete!**
>
> You've completed all Core Concepts. Now explore practical guides for database, authentication, and deployment.
>
> [Database Guide →](/docs/guides/database)