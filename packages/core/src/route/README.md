# @spfn/core/route - Contract-based Routing System

Type-safe, contract-based routing with automatic route discovery and runtime middleware management.

## Features

- ✅ **Contract-based Routing**: TypeBox schemas for end-to-end type safety
- ✅ **Two Routing Patterns**: `createApp()` (recommended) or traditional Hono + `bind()`
- ✅ **File-based Discovery**: Next.js-style automatic route registration
- ✅ **Co-located Contracts**: Contracts live with routes (`contract.ts` + `index.ts`) for better organization
- ✅ **Runtime Middleware Skip**: Route-level middleware control via contract.meta
- ✅ **Query Arrays**: Support for `?tags=a&tags=b` → `{ tags: ['a', 'b'] }`
- ✅ **Unified Error Handling**: All validation errors throw `ValidationError`
- ✅ **Dynamic Routes**: `[id]` → `:id`, `[...slug]` → `*`
- ✅ **Zero Config**: Works out of the box

---

## Quick Start

### 1. Create a Contract

Contracts are co-located with routes:

```typescript
// src/server/routes/users/contract.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

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
} as const satisfies RouteContract;

export const createUserContract = {
    method: 'POST' as const,
    path: '/',
    body: Type.Object({
        name: Type.String(),
        email: Type.String()
    }),
    response: Type.Object({
        id: Type.Number(),
        name: Type.String(),
        email: Type.String()
    })
} as const satisfies RouteContract;
```

### 2. Create Route Handler

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { getUsersContract, createUserContract } from './contract.js';

const app = createApp();

// GET /users
app.bind(getUsersContract, async (c) => {
    const { limit = 10, offset = 0 } = c.query;
    const users = await fetchUsers(limit, offset);
    return c.json({ users });
});

// POST /users
app.bind(createUserContract, async (c) => {
    const data = await c.data();  // Validated!
    const user = await createUser(data);
    return c.json(user);
});

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
// routes/users/[id]/contract.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

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
} as const satisfies RouteContract;

// routes/users/[id]/index.ts
import { createApp } from '@spfn/core/route';
import { getUserContract } from './contract.js';

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

## Method-Level Middleware Control

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

### Skip Middlewares Per Method

Use `contract.meta.skipMiddlewares` for **method-level** control:

```typescript
// contracts/users.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

// GET - Public (skip auth)
export const getUserContract = {
    method: 'GET',
    path: '/users/:id',
    params: Type.Object({ id: Type.String() }),
    response: Type.Object({ user: Type.Object({}) }),
    meta: {
        skipMiddlewares: ['auth']  // Skip auth for this method
    }
} as const satisfies RouteContract;

// PATCH - Protected (auth required)
export const updateUserContract = {
    method: 'PATCH',
    path: '/users/:id',
    params: Type.Object({ id: Type.String() }),
    body: Type.Object({ name: Type.String() }),
    response: Type.Object({ user: Type.Object({}) }),
    // No skipMiddlewares → auth will run
} as const satisfies RouteContract;
```

```typescript
// routes/users/[id].ts
import { createApp } from '@spfn/core/route';
import { getUserContract, updateUserContract } from './contracts';

const app = createApp();

// GET /users/:id - Public (no auth)
app.bind(getUserContract, async (c) => {
    return c.json({ user: {} });
});

// PATCH /users/:id - Protected (auth required)
app.bind(updateUserContract, async (c) => {
    const data = await c.data();
    return c.json({ user: {} });
});

export default app;
```

**How it works:**
1. Global middlewares registered for all routes
2. `createApp()` stores contract metadata in `_contractMetas` Map
3. auto-loader detects contract-based routing and enables method-level filtering
4. Each middleware checks if it should be skipped for the current method
5. Skipped middlewares call `next()` immediately

**Key Features:**
- ✅ **Method-level control**: Same path, different policies per HTTP method
- ✅ **Contract-based**: Middleware policy is part of the contract definition
- ✅ **Type-safe**: Full TypeScript support with `RouteContract`
- ✅ **Zero overhead**: Only minimal runtime checks

**Example Use Cases:**
```typescript
// Same path, different access levels
GET    /posts/:id    → Public (skip auth)
PATCH  /posts/:id    → Auth required
DELETE /posts/:id    → Auth required

// Health checks
GET    /health       → Skip all middlewares

// Mixed policies
GET    /api/data     → Skip rate limit (public data)
POST   /api/data     → Auth + rate limit required
```

---

## Route Context

### Available Properties

```typescript
type RouteContext<TContract> = {
    // Path parameters (typed via contract)
    params: InferContract<TContract>['params'];

    // Query parameters (typed, supports arrays)
    query: InferContract<TContract>['query'];

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
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

// Public route - skip auth
export const publicContract = {
    method: 'GET',
    path: '/public',
    response: Type.Object({ data: Type.String() }),
    meta: { skipMiddlewares: ['auth'] }
} as const satisfies RouteContract;

// Protected route - require auth
export const protectedContract = {
    method: 'GET',
    path: '/protected',
    response: Type.Object({ data: Type.String() }),
    // No skipMiddlewares - auth will run
} as const satisfies RouteContract;
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
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
```

### `RouteContext<TContract>`

Route handler context with contract-based type inference.

```typescript
type RouteContext<TContract extends RouteContract> = {
    params: InferContract<TContract>['params'];
    query: InferContract<TContract>['query'];
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

---

## Best Practices

### 1. Co-locate Contracts

```typescript
// ✅ Good - contracts co-located with routes
// routes/users/contract.ts
export const getUsersContract = { ... };

// routes/users/index.ts
import { getUsersContract } from './contract.js';
app.bind(getUsersContract, handler);

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
// ✅ Good - logical grouping with co-located contracts
routes/
  users/
    contract.ts   # All user contracts
    index.ts      # List/create users handlers
  [id]/
    contract.ts   # Single user contracts
    index.ts      # Get/update/delete user handlers

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

## Related

- [@spfn/core](../../README.md) - Main package documentation
- [@spfn/core/middleware](../middleware/README.md) - Middleware system
- [@spfn/core/errors](../errors/README.md) - Error handling
- [Hono Documentation](https://hono.dev) - Framework reference
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema validation