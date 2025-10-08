# @spfn/core/route - Contract-based Routing System

Type-safe, contract-based routing with automatic route discovery and runtime middleware management.

## Features

- ✅ **Contract-based Routing**: TypeBox schemas for end-to-end type safety
- ✅ **Two Routing Patterns**: `createApp()` (recommended) or traditional Hono + `bind()`
- ✅ **File-based Discovery**: Next.js-style automatic route registration
- ✅ **Separate Contracts**: Store contracts in `src/server/contracts/` for client/server sharing
- ✅ **Runtime Middleware Skip**: Route-level middleware control via contract.meta
- ✅ **Query Arrays**: Support for `?tags=a&tags=b` → `{ tags: ['a', 'b'] }`
- ✅ **Unified Error Handling**: All validation errors throw `ValidationError`
- ✅ **Dynamic Routes**: `[id]` → `:id`, `[...slug]` → `*`
- ✅ **Zero Config**: Works out of the box

---

## Quick Start

### 1. Create Contracts (Recommended Structure)

Store contracts separately for client/server sharing:

```typescript
// src/server/contracts/users.ts
import { Type } from '@sinclair/typebox';

export const getUsersContract = {
    method: 'GET' as const,
    path: '/',
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

export const getUserContract = {
    method: 'GET' as const,
    path: '/:id',
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
```

### 2. Create Route Files

#### Option A: Using `createApp()` (Recommended)

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { getUsersContract, getUserContract } from '../../contracts/users';

const app = createApp();

// Method and path come from contract
app.bind(getUsersContract, async (c) => {
    const { limit = 10, offset = 0 } = c.query;
    const users = await fetchUsers(limit, offset);
    return c.json({ users });
});

app.bind(getUserContract, async (c) => {
    const { id } = c.params;  // Typed as number
    const user = await getUserById(id);
    return c.json({ user });
});

export default app;
```

#### Option B: Using Traditional Hono + `bind()`

```typescript
// src/server/routes/users/index.ts
import { Hono } from 'hono';
import { bind } from '@spfn/core/route';
import { getUsersContract, getUserContract } from '../../contracts/users';

const app = new Hono();

// Method from app.get(), contract can omit method/path
app.get('/', bind(getUsersContract, async (c) => {
    const { limit = 10, offset = 0 } = c.query;
    const users = await fetchUsers(limit, offset);
    return c.json({ users });
}));

app.get('/:id', bind(getUserContract, async (c) => {
    const { id } = c.params;
    const user = await getUserById(id);
    return c.json({ user });
}));

export default app;
```

### 3. Server Automatically Loads Routes

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

## Two Routing Patterns

### Pattern 1: `createApp()` (Recommended)

**When to use**: New projects, cleaner API, method/path in contract

```typescript
import { createApp } from '@spfn/core/route';

const app = createApp();

// Contract includes method and path
const contract = {
    method: 'GET',
    path: '/',
    response: Type.Object({ data: Type.String() })
};

// Method/path come from contract
app.bind(contract, async (c) => {
    return c.json({ data: 'hello' });
});

// With middlewares
app.bind(contract, [authMiddleware, logMiddleware], async (c) => {
    return c.json({ data: 'protected' });
});

export default app;
```

**Advantages**:
- ✅ Cleaner API - no need for `app.get()`, `app.post()`
- ✅ Contract contains full route definition
- ✅ Middleware array support
- ✅ Better for client code generation

### Pattern 2: Traditional Hono + `bind()`

**When to use**: Need direct Hono API access, gradual migration

```typescript
import { Hono } from 'hono';
import { bind } from '@spfn/core/route';

const app = new Hono();

// Contract can omit method/path
const contract = {
    response: Type.Object({ data: Type.String() })
};

// Method/path specified in app.get()
app.get('/', bind(contract, async (c) => {
    return c.json({ data: 'hello' });
}));

// Route-level middleware
app.get('/protected', authMiddleware, bind(contract, handler));

export default app;
```

**Advantages**:
- ✅ Full Hono API access (app.use, app.onError, etc.)
- ✅ Familiar pattern for Hono users
- ✅ More flexible middleware composition

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
// contracts/users.ts
export const getUserContract = {
    method: 'GET',
    path: '/:id',  // or '/' if using traditional pattern
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

// routes/users/[id].ts
import { createApp } from '@spfn/core/route';
import { getUserContract } from '../../contracts/users';

const app = createApp();

app.bind(getUserContract, async (c) => {
    const { id } = c.params;  // Typed as number
    const user = await getUserById(id);
    return c.json({ user });
});

export default app;
```

**Catch-all Routes: `[...slug]`**
```typescript
// routes/docs/[...slug].ts
import { createApp } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

const app = createApp();

const contract = {
    method: 'GET',
    path: '/*',
    response: Type.Object({ slug: Type.String() })
};

app.bind(contract, async (c) => {
    const slug = c.raw.req.param('slug');  // Matches /docs/a/b/c
    return c.json({ slug });
});

export default app;
```

---

## Contract-based Validation

### Contract Structure

```typescript
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

const contract = {
    // HTTP method (required for createApp())
    method: 'POST',

    // Route path (required for createApp())
    path: '/',

    // Path parameters (optional)
    params: Type.Object({
        id: Type.Number()
    }),

    // Query parameters (optional, supports arrays!)
    query: Type.Object({
        tags: Type.Array(Type.String()),
        limit: Type.Optional(Type.Number())
    }),

    // Request body (optional)
    body: Type.Object({
        name: Type.String(),
        email: Type.String({ format: 'email' })
    }),

    // Response schema (required)
    response: Type.Object({
        success: Type.Boolean()
    }),

    // Route metadata (optional)
    meta: {
        public: true,  // Shorthand for skipMiddlewares: ['auth']
        skipMiddlewares: ['rateLimit'],
        tags: ['users'],
        description: 'Create a new user'
    }
} satisfies RouteContract;
```

### Query Array Support

```typescript
// Request: /posts?tags=javascript&tags=typescript
const contract = {
    method: 'GET',
    path: '/',
    query: Type.Object({
        tags: Type.Array(Type.String())
    }),
    response: Type.Object({ posts: Type.Array(Type.Any()) })
};

app.bind(contract, async (c) => {
    const { tags } = c.query;  // ['javascript', 'typescript']
    return c.json({ posts: [] });
});
```

**How it works**:
1. URL: `/posts?tags=javascript&tags=typescript`
2. `bind()` parses to: `{ tags: ['javascript', 'typescript'] }`
3. TypeBox validates against: `Type.Array(Type.String())`
4. Handler receives validated array: `c.query.tags`

### Validation Errors

All validation errors throw `ValidationError` (400):

```json
{
  "error": {
    "message": "Invalid query parameters",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {
      "fields": [
        {
          "path": "/limit",
          "message": "Expected number",
          "value": "abc"
        }
      ]
    }
  }
}
```

---

## Separate Contracts Pattern

### Recommended File Structure

```
src/
├── server/
│   ├── contracts/           # ✅ Shared contracts
│   │   ├── users.ts
│   │   ├── posts.ts
│   │   └── health.ts
│   │
│   ├── routes/              # Route files (Hono apps)
│   │   ├── users/
│   │   │   ├── index.ts     # Imports from contracts/users.ts
│   │   │   └── [id].ts
│   │   └── posts/
│   │       └── index.ts
│   │
│   ├── middlewares/         # Custom middlewares
│   │   ├── auth.ts
│   │   └── rate-limit.ts
│   │
│   ├── server.config.ts     # Server configuration
│   └── app.ts               # Optional: Full control
│
└── client/
    └── api.ts               # ✅ Imports from contracts/
```

### Benefits of Separate Contracts

```typescript
// ✅ Good - contracts in separate file
// contracts/users.ts
export const getUsersContract = {
    method: 'GET',
    path: '/',
    query: Type.Object({ limit: Type.Number() }),
    response: Type.Object({ users: Type.Array(...) })
};

// routes/users/index.ts
import { getUsersContract } from '../../contracts/users';
app.bind(getUsersContract, handler);

// client/api.ts
import { getUsersContract } from '../server/contracts/users';
// Use for type-safe client generation

// ❌ Bad - contract inline in route
app.bind({
    method: 'GET',
    path: '/',
    response: Type.Object({...})
}, handler);
```

**Why separate?**
- ✅ Contracts can be imported in client code
- ✅ Single source of truth for API types
- ✅ No server-side code in client bundles
- ✅ Enables automatic client code generation
- ✅ Easier to maintain and test

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
// contracts/health.ts
export const healthContract = {
    method: 'GET',
    path: '/',
    response: Type.Object({
        status: Type.String()
    }),
    meta: {
        skipMiddlewares: ['auth', 'rateLimit']  // Skip both
    }
};

// Or use public shorthand
export const publicContract = {
    method: 'GET',
    path: '/',
    response: Type.Object({ data: Type.String() }),
    meta: {
        public: true  // Same as skipMiddlewares: ['auth']
    }
};
```

**How it works:**
1. Global middlewares registered for all routes
2. `bind()` stores `contract.meta` in context (bind.ts:44-47)
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
        status?: ContentfulStatusCode,
        headers?: HeaderRecord  // Record<string, string | string[]>
    ): Response;

    // Raw Hono context (for advanced usage)
    raw: Context;
};
```

### Example Usage

```typescript
app.bind(createUserContract, async (c) => {
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
});
```

---

## Advanced Patterns

### Multiple Routes Per File

```typescript
// routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { getUsersContract, createUserContract, getUserContract } from '../../contracts/users';

const app = createApp();

app.bind(getUsersContract, async (c) => {
    // GET /users
});

app.bind(createUserContract, async (c) => {
    // POST /users
});

app.bind(getUserContract, async (c) => {
    // GET /users/:id
});

export default app;
```

### Conditional Middleware Per Route

```typescript
// contracts/api.ts

// Public route - skip auth
export const publicContract = {
    method: 'GET',
    path: '/public',
    response: Type.Object({ data: Type.String() }),
    meta: { skipMiddlewares: ['auth'] }
};

// Protected route - require auth
export const protectedContract = {
    method: 'GET',
    path: '/protected',
    response: Type.Object({ data: Type.String() }),
    // No skipMiddlewares - auth will run
};
```

### Route-level Middleware (Traditional Pattern Only)

```typescript
import { Hono } from 'hono';
import { bind } from '@spfn/core/route';
import { authMiddleware } from '../../middlewares/auth';

const app = new Hono();

// Apply middleware to specific route only
app.get('/admin', authMiddleware, bind(contract, handler));

export default app;
```

### Middleware Array with createApp()

```typescript
import { createApp } from '@spfn/core/route';
import { authMiddleware, logMiddleware } from '../../middlewares';

const app = createApp();

// Pass middleware array to bind()
app.bind(
    adminContract,
    [authMiddleware, logMiddleware],
    async (c) => {
        return c.json({ data: 'protected' });
    }
);

export default app;
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

app.bind(createUserContract, async (c) => {
    const data = await c.data();

    if (await userExists(data.email)) {
        throw new ValidationError('Email already exists', {
            fields: [{
                path: '/email',
                message: 'Email already exists',
                value: data.email
            }]
        });
    }

    // ...
});
```

---

## API Reference

### `createApp()`

Creates a SPFN app instance with `bind()` method.

```typescript
function createApp(): SPFNApp

type SPFNApp = Hono & {
    bind<TContract extends RouteContract>(
        contract: TContract,
        handler: RouteHandler
    ): void;

    bind<TContract extends RouteContract>(
        contract: TContract,
        middlewares: MiddlewareHandler[],
        handler: RouteHandler
    ): void;
};
```

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
    /** HTTP method (required for createApp()) */
    method: HttpMethod;
    /** Route path (required for createApp()) */
    path: string;
    /** Path parameters schema (optional) */
    params?: TSchema;
    /** Query parameters schema (optional) */
    query?: TSchema;
    /** Request body schema (optional) */
    body?: TSchema;
    /** Response schema (required) */
    response: TSchema;
    /** Route metadata (optional) */
    meta?: RouteMeta;
};
```

### `RouteMeta`

Route metadata for middleware control and documentation.

```typescript
type RouteMeta = {
    /** Public route (skip auth) - shorthand for skipMiddlewares: ['auth'] */
    public?: boolean;
    /** Skip specific global middlewares by name */
    skipMiddlewares?: string[];
    /** OpenAPI tags for grouping */
    tags?: string[];
    /** Route description for documentation */
    description?: string;
    /** Deprecated flag */
    deprecated?: boolean;
};
```

### `HttpMethod`

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
```

### `RouteContext<TContract>`

Route handler context with contract-based type inference.

```typescript
type RouteContext<TContract extends RouteContract> = {
    params: InferContract<TContract>['params'];
    query: InferContract<TContract>['query'];
    pageable: { filters?, sort?, pagination? };
    data(): Promise<InferContract<TContract>['body']>;
    json(
        data: InferContract<TContract>['response'],
        status?: ContentfulStatusCode,
        headers?: HeaderRecord
    ): Response;
    raw: Context;
};
```

### `InferContract<TContract>`

Type inference helper.

```typescript
type InferContract<TContract extends RouteContract> = {
    params: Static<TContract['params']> | Record<string, never>;
    query: Static<TContract['query']> | Record<string, never>;
    body: Static<TContract['body']> | Record<string, never>;
    response: Static<TContract['response']> | unknown;
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
app.bind(userContracts.list, handler);

// ❌ Bad - contract inline in route
app.bind({
    method: 'GET',
    path: '/',
    response: Type.Object({...})
}, handler);
```

### 2. Use createApp() for New Projects

```typescript
// ✅ Good - cleaner API
const app = createApp();
app.bind(contract, handler);

// ⚠️ OK - when you need direct Hono access
const app = new Hono();
app.get('/', bind(contract, handler));
```

### 3. Skip Middlewares Explicitly

```typescript
// ✅ Good - explicit skip in contract
const contract = {
    method: 'GET',
    path: '/public',
    response: Type.Object({...}),
    meta: { skipMiddlewares: ['auth'] }
};

// ❌ Bad - no documentation why public
app.bind(contract, handler);
```

### 4. Use Type Inference

```typescript
// ✅ Good - let TypeScript infer types
app.bind(contract, async (c) => {
    const { id } = c.params;  // Type inferred from contract
});

// ❌ Bad - manual typing
app.bind(contract, async (c: RouteContext<typeof contract>) => {
    // ...
});
```

### 5. Group Related Routes

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

### 6. Store Contracts in contracts/

```typescript
// ✅ Good - separate contracts directory
src/server/contracts/users.ts
src/server/routes/users/index.ts (imports from contracts)

// ❌ Bad - contracts mixed with routes
src/server/routes/users/contracts.ts
src/server/routes/users/index.ts
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

// contract
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

### createApp() vs bind() confusion

**When to use createApp():**
- ✅ New projects
- ✅ Want cleaner API
- ✅ Contract contains method/path

**When to use Hono + bind():**
- ✅ Need direct Hono API access
- ✅ Gradual migration
- ✅ Complex middleware composition

---

## Migration Guide

### From Traditional Hono to createApp()

**Before:**
```typescript
import { Hono } from 'hono';
import { bind } from '@spfn/core/route';

const app = new Hono();

const contract = {
    response: Type.Object({ data: Type.String() })
};

app.get('/', bind(contract, handler));
export default app;
```

**After:**
```typescript
import { createApp } from '@spfn/core/route';

const app = createApp();

const contract = {
    method: 'GET',      // Add method
    path: '/',          // Add path
    response: Type.Object({ data: Type.String() })
};

app.bind(contract, handler);  // No app.get()
export default app;
```

### Extract Contracts to Separate Files

**Before:**
```typescript
// routes/users/index.ts
const getUsersContract = {
    method: 'GET',
    path: '/',
    response: Type.Object({...})
};

app.bind(getUsersContract, handler);
```

**After:**
```typescript
// contracts/users.ts
export const getUsersContract = {
    method: 'GET',
    path: '/',
    response: Type.Object({...})
};

// routes/users/index.ts
import { getUsersContract } from '../../contracts/users';
app.bind(getUsersContract, handler);
```

---

## Related

- [@spfn/core](../../README.md) - Main package documentation
- [@spfn/core/middleware](../middleware/README.md) - Middleware system
- [@spfn/core/errors](../errors/README.md) - Error handling
- [Hono Documentation](https://hono.dev) - Framework reference
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema validation