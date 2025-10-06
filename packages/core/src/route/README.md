# @spfn/core/route - File-based Routing System

Type-safe, contract-based routing with automatic route discovery and runtime middleware management.

## Features

- ✅ **File-based Routing**: Next.js-style automatic route registration
- ✅ **Contract-based Validation**: TypeBox schemas for end-to-end type safety
- ✅ **Runtime Middleware Skip**: Route-level middleware control via contract.meta
- ✅ **Query Arrays**: Support for `?tags=a&tags=b` → `{ tags: ['a', 'b'] }`
- ✅ **Unified Error Handling**: All validation errors throw `ValidationError`
- ✅ **Auto-discovery**: Scan and register routes automatically
- ✅ **Dynamic Routes**: `[id]` → `:id`, `[...slug]` → `*`
- ✅ **Zero Config**: Works out of the box

---

## Quick Start

### 1. Create a Route File

```typescript
// src/server/routes/users/index.ts
import { Hono } from 'hono';
import { bind } from '@spfn/core';
import { Type } from '@sinclair/typebox';

const app = new Hono();

// Define contract
const getUsersContract = {
    query: Type.Object({
        limit: Type.Optional(Type.Number()),
        offset: Type.Optional(Type.Number())
    }),
    response: Type.Object({
        users: Type.Array(Type.Object({
            id: Type.Number(),
            name: Type.String()
        }))
    })
};

// Bind contract to handler
app.get('/', bind(getUsersContract, async (c) => {
    const { limit = 10, offset = 0 } = c.query;

    const users = await fetchUsers(limit, offset);

    return c.json({ users });
}));

export default app;
```

### 2. Server Automatically Loads Routes

```typescript
// src/server/server.ts or server.config.ts
import { startServer } from '@spfn/core';

await startServer({
    port: 4000,
    debug: true
});

// ✅ Routes automatically discovered and registered
// 🔹 /users → routes/users/index.ts
```

---

## Routing Patterns

### File Structure → URL Mapping

```
routes/
├── users/
│   ├── index.ts           → GET /users
│   ├── [id].ts            → GET /users/:id
│   └── [id]/
│       └── posts.ts       → GET /users/:id/posts
├── posts/
│   ├── index.ts           → GET /posts
│   └── [...slug].ts       → GET /posts/*
└── health/
    └── index.ts           → GET /health
```

### Dynamic Routes

**Path Parameters: `[id]`**
```typescript
// routes/users/[id].ts
const contract = {
    params: Type.Object({
        id: Type.Number()
    }),
    response: Type.Object({
        user: Type.Object({
            id: Type.Number(),
            name: Type.String()
        })
    })
};

app.get('/', bind(contract, async (c) => {
    const { id } = c.params;  // Typed as number
    const user = await getUserById(id);
    return c.json({ user });
}));
```

**Catch-all Routes: `[...slug]`**
```typescript
// routes/docs/[...slug].ts
const app = new Hono();

app.get('/', async (c) => {
    const slug = c.req.param('slug');  // Matches /docs/a/b/c
    return c.json({ slug });
});

export default app;
```

---

## Contract-based Validation

### Automatic Validation with bind()

```typescript
import { bind } from '@spfn/core';
import { Type } from '@sinclair/typebox';

const contract = {
    // Path parameters
    params: Type.Object({
        id: Type.Number()
    }),

    // Query parameters (supports arrays!)
    query: Type.Object({
        tags: Type.Array(Type.String()),
        limit: Type.Optional(Type.Number())
    }),

    // Request body
    body: Type.Object({
        name: Type.String(),
        email: Type.String({ format: 'email' })
    }),

    // Response schema
    response: Type.Object({
        success: Type.Boolean()
    })
};

app.post('/', bind(contract, async (c) => {
    // All validated - safe to use
    const { id } = c.params;
    const { tags, limit } = c.query;
    const body = await c.data();  // Validated body

    return c.json({ success: true });
}));
```

### Query Array Support

```typescript
// Request: /posts?tags=javascript&tags=typescript
const contract = {
    query: Type.Object({
        tags: Type.Array(Type.String())
    }),
    response: Type.Object({ posts: Type.Array(Type.Any()) })
};

app.get('/', bind(contract, async (c) => {
    const { tags } = c.query;  // ['javascript', 'typescript']
    return c.json({ posts: [] });
}));
```

### Validation Errors

All validation errors throw `ValidationError` (400):

```json
{
  "error": {
    "message": "Invalid query parameters",
    "type": "ValidationError",
    "statusCode": 400
  }
}
```

---

## Global Middleware Management

### Configure Global Middlewares

```typescript
// server.config.ts
import type { ServerConfig } from '@spfn/core';
import { authMiddleware } from '@spfn/auth';
import { rateLimitMiddleware } from './middlewares/rate-limit';

export default {
    middlewares: [
        { name: 'auth', handler: authMiddleware() },
        { name: 'rateLimit', handler: rateLimitMiddleware() }
    ]
} satisfies ServerConfig;
```

### Skip Middlewares Per Route

Use `contract.meta.skipMiddlewares`:

```typescript
// routes/public/health.ts
const healthContract = {
    response: Type.Object({
        status: Type.String()
    }),
    meta: {
        skipMiddlewares: ['auth', 'rateLimit']  // Skip both
    }
};

app.get('/', bind(healthContract, async (c) => {
    return c.json({ status: 'ok' });
}));
```

**How it works:**
1. Global middlewares registered for all routes
2. `bind()` stores `contract.meta` in context
3. `conditionalMiddleware` checks skip list at runtime
4. Skipped middlewares call `next()` immediately

**Performance:** `< 0.1ms` overhead per request (negligible)

---

## Route Context

### Available Properties

```typescript
type RouteContext<TContract> = {
    // Path parameters (typed via contract)
    params: InferContract<TContract>['params'];

    // Query parameters (typed, supports arrays)
    query: InferContract<TContract>['query'];

    // Pageable object (from QueryParser middleware)
    pageable: {
        filters?: Record<string, any>;
        sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
        pagination?: { page: number; limit: number };
    };

    // Request body parser (validated)
    data(): Promise<InferContract<TContract>['body']>;

    // JSON response helper (typed)
    json(
        data: InferContract<TContract>['response'],
        status?: number,
        headers?: Record<string, string>
    ): Response;

    // Raw Hono context (for advanced usage)
    raw: Context;
};
```

### Example Usage

```typescript
app.post('/users', bind(createUserContract, async (c) => {
    // Validated params
    const { id } = c.params;

    // Validated query
    const { limit } = c.query;

    // Validated body
    const userData = await c.data();

    // Pageable from middleware
    const { filters, sort, pagination } = c.pageable;

    // Typed response
    return c.json({ user: newUser });

    // Raw context access
    const token = c.raw.req.header('Authorization');
}));
```

---

## File Organization

### Recommended Structure

```
src/server/
├── routes/              # Route files (Hono apps)
│   ├── users/
│   │   ├── index.ts
│   │   └── [id].ts
│   └── posts/
│       └── index.ts
│
├── contracts/           # Shared contracts (TypeBox schemas)
│   ├── users.ts
│   └── posts.ts
│
├── middlewares/         # Custom middlewares
│   ├── auth.ts
│   └── rate-limit.ts
│
├── server.config.ts     # Server configuration
└── app.ts              # Optional: Full control
```

### Separate Contracts (Recommended)

```typescript
// contracts/users.ts
import { Type } from '@sinclair/typebox';

export const getUserContract = {
    params: Type.Object({ id: Type.Number() }),
    response: Type.Object({
        user: Type.Object({
            id: Type.Number(),
            name: Type.String()
        })
    })
};

// routes/users/[id].ts
import { getUserContract } from '../../contracts/users';

app.get('/', bind(getUserContract, async (c) => {
    // ...
}));
```

**Why separate?**
- ✅ Contracts can be imported in client code
- ✅ Single source of truth for API types
- ✅ No server-side code in client bundles
- ✅ Shared between server and client

---

## Advanced Patterns

### Multiple Routes Per File

```typescript
// routes/users/index.ts
const app = new Hono();

app.get('/', bind(getUsersContract, async (c) => {
    // GET /users
}));

app.post('/', bind(createUserContract, async (c) => {
    // POST /users
}));

app.get('/:id', bind(getUserContract, async (c) => {
    // GET /users/:id
}));

export default app;
```

### Conditional Middleware Per Route

```typescript
// Public route - skip auth
const publicContract = {
    response: Type.Object({ data: Type.String() }),
    meta: { skipMiddlewares: ['auth'] }
};

// Protected route - require auth
const protectedContract = {
    response: Type.Object({ data: Type.String() }),
    // No skipMiddlewares - auth will run
};

app.get('/public', bind(publicContract, handler));
app.get('/protected', bind(protectedContract, handler));
```

### Route-level Middleware

```typescript
import { authMiddleware } from '@spfn/auth';

// Apply middleware to specific route only
app.get('/admin', authMiddleware, bind(contract, handler));
```

---

## Error Handling

### Automatic Error Responses

All validation errors are caught by `errorHandler()`:

```typescript
// Params validation error
GET /users/abc
→ 400 ValidationError: Invalid path parameters

// Query validation error
GET /users?limit=abc
→ 400 ValidationError: Invalid query parameters

// Body validation error
POST /users { "name": 123 }
→ 400 ValidationError: Invalid request body
```

### Custom Error Handling

```typescript
import { ValidationError } from '@spfn/core';

app.post('/', bind(contract, async (c) => {
    const data = await c.data();

    if (await userExists(data.email)) {
        throw new ValidationError('Email already exists', {
            field: 'email',
            value: data.email
        });
    }

    // ...
}));
```

---

## API Reference

### `bind(contract, handler)`

Binds a contract to a route handler with automatic validation.

```typescript
function bind<TContract extends RouteContract>(
    contract: TContract,
    handler: (c: RouteContext<TContract>) => Response | Promise<Response>
): (c: Context) => Promise<Response>
```

### `loadRoutes(app, options?)`

Automatically loads routes from directory.

```typescript
function loadRoutes(
    app: Hono,
    options?: {
        routesDir?: string;
        debug?: boolean;
        middlewares?: Array<{ name: string; handler: MiddlewareHandler }>;
    }
): Promise<RouteStats>
```

### `RouteContract`

Contract definition type.

```typescript
type RouteContract = {
    params?: TSchema;
    query?: TSchema;
    body?: TSchema;
    response: TSchema;
    meta?: RouteMeta;
};
```

### `RouteMeta`

Route metadata for middleware control and documentation.

```typescript
type RouteMeta = {
    skipMiddlewares?: string[];
    tags?: string[];
    description?: string;
    deprecated?: boolean;
};
```

### `conditionalMiddleware(name, handler)`

Wraps a middleware to support runtime skip control.

```typescript
function conditionalMiddleware(
    name: string,
    handler: MiddlewareHandler
): MiddlewareHandler
```

---

## Best Practices

### 1. Use Separate Contracts

```typescript
// ✅ Good - contracts in separate file
import { userContracts } from '../../contracts/users';
app.get('/', bind(userContracts.list, handler));

// ❌ Bad - contract inline in route
app.get('/', bind({ response: Type.Object({...}) }, handler));
```

### 2. Skip Middlewares Explicitly

```typescript
// ✅ Good - explicit skip in contract
const contract = {
    response: Type.Object({...}),
    meta: { skipMiddlewares: ['auth'] }
};

// ❌ Bad - no documentation why public
app.get('/public', handler);
```

### 3. Use Type Inference

```typescript
// ✅ Good - let TypeScript infer types
app.get('/', bind(contract, async (c) => {
    const { id } = c.params;  // Type inferred from contract
}));

// ❌ Bad - manual typing
app.get('/', bind(contract, async (c: RouteContext<typeof contract>) => {
    // ...
}));
```

### 4. Group Related Routes

```typescript
// ✅ Good - logical grouping
routes/
  users/
    index.ts      # List/create users
    [id].ts       # Get/update/delete user
    [id]/
      posts.ts    # User's posts

// ❌ Bad - flat structure
routes/
  users.ts
  user-detail.ts
  user-posts.ts
```

---

## Troubleshooting

### Routes not loading

**Cause:** Invalid file pattern or export

**Solution:**
```typescript
// ✅ Must export Hono instance as default
export default app;

// ✅ File must be .ts (not .test.ts, .spec.ts, .d.ts)
// routes/users/index.ts ✅
// routes/users/index.test.ts ❌
```

### Middleware not applying

**Cause:** Middleware name mismatch

**Solution:**
```typescript
// server.config.ts
middlewares: [
    { name: 'auth', handler: authMiddleware() }  // name: 'auth'
]

// route contract
meta: {
    skipMiddlewares: ['auth']  // Must match exactly
}
```

### Type errors with params/query

**Cause:** Contract mismatch with actual types

**Solution:**
```typescript
// ✅ URL params validated and converted
params: Type.Object({
    id: Type.Number()  // String → Number validation
})

// ✅ Query can be array
query: Type.Object({
    tags: Type.Array(Type.String())
})
```

---

## Related

- [@spfn/core](../../README.md) - Main package documentation
- [@spfn/core/middleware](../middleware/README.md) - Middleware system
- [@spfn/core/errors](../errors/README.md) - Error handling
- [Hono Documentation](https://hono.dev) - Framework reference
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema validation