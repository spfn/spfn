# @spfn/core/route - File-based Routing System

Next.js App Router-style file-based routing for Hono applications with automatic route registration.

## Features

- ✅ **Zero-Config**: File-based routing with Next.js App Router conventions
- ✅ **TypeScript First**: Full type safety with RouteContext
- ✅ **Contract-Based Routing**: TypeBox-based contracts with automatic validation
- ✅ **Automatic Registration**: Scans, transforms, and registers routes automatically
- ✅ **Priority Sorting**: Intelligent route priority (static > dynamic > catch-all)
- ✅ **HTTP Method Handlers**: Export GET, POST, PUT, PATCH, DELETE functions
- ✅ **Metadata Support**: Route descriptions, tags, auth requirements
- ✅ **Middleware Support**: Per-route middleware injection
- ✅ **Conflict Detection**: Warns about potential route conflicts
- ✅ **Developer-Friendly**: Clear error messages and registration logging

---

## Quick Start

### 1. Create Route Files

```
src/server/routes/
├── index.ts               # GET /
├── users/
│   ├── index.ts          # GET /users
│   ├── [id].ts           # GET /users/:id
│   └── [id]/
│       └── posts/
│           └── index.ts  # GET /users/:id/posts
└── posts/
    └── [...slug].ts      # GET /posts/* (catch-all)
```

### 2. Write Route Handlers

**`src/server/routes/users/[id].ts`**:
```typescript
import type { RouteContext } from '@spfn/core';

// Next.js App Router style - export HTTP method functions
export async function GET(c: RouteContext) {
  const { id } = c.params;

  return c.json({
    userId: id,
    name: 'John Doe'
  });
}

export async function PATCH(c: RouteContext) {
  const { id } = c.params;
  const body = await c.data<{ name: string }>();

  return c.json({
    userId: id,
    updated: body
  });
}

// Optional metadata
export const meta = {
  description: 'User detail API',
  tags: ['users'],
  auth: true
};
```

### 3. Load Routes in Your App

**`src/server/app.ts`**:
```typescript
import { Hono } from 'hono';
import { loadRoutesFromDirectory } from '@spfn/core';

const app = new Hono();

// Automatically load all routes
const debug = process.env.NODE_ENV === 'development';
await loadRoutesFromDirectory(app, debug);

export { app };
```

### 4. See Results

```
🔍 Scanning routes directory: /Users/.../src/server/routes
  ✓ users/[id].ts
  ✓ users/index.ts
  ✓ posts/index.ts
📁 Found 3 route files

📍 Registering routes:
   Total: 3 routes

   🔹 /users                              → users/index.ts
   🔹 /posts                              → posts/index.ts
   🔸 /users/:id                          → users/[id].ts (params: [id], 🔒 auth, tags: [users])

📊 Route Statistics:
   Priority: 2 static, 1 dynamic, 0 catch-all
   Methods: GET(3), PATCH(1)
   Tags: users(1)

✅ Routes loaded in 45ms
```

---

## File Naming Conventions

### Static Routes

```
routes/users.ts          → /users
routes/users/profile.ts  → /users/profile
routes/api/v1/health.ts  → /api/v1/health
```

### Index Routes

```
routes/index.ts          → /
routes/users/index.ts    → /users
routes/api/index.ts      → /api
```

### Dynamic Routes (Parameters)

```
routes/users/[id].ts                → /users/:id
routes/posts/[slug].ts              → /posts/:slug
routes/users/[id]/posts/[postId].ts → /users/:id/posts/:postId
```

### Catch-All Routes (Wildcards)

```
routes/docs/[...slug].ts  → /docs/*
routes/assets/[...path].ts → /assets/*
```

---

## Contract-Based Routing with TypeBox

The framework supports contract-based routing using TypeBox for type-safe, auto-validated routes.

### Using bind() Function

The `bind()` function provides Fastify-style contract binding with automatic validation:

```typescript
import { bind, type RouteContract } from '@spfn/core';
import { Type } from '@sinclair/typebox';

// 1. Define contract
const getUserContract = {
  method: 'GET' as const,
  params: Type.Object({
    id: Type.String(),
  }),
  response: Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
  }),
} as const satisfies RouteContract;

// 2. Create handler with bind()
export const GET = bind(getUserContract, async (c) => {
  // ✅ c.params.id is type-safe (string)
  const userId = c.params.id;

  return c.json({
    id: userId,
    name: 'John Doe',
    email: 'john@example.com',
  });
});
```

### POST with Body Validation

```typescript
const createUserContract = {
  method: 'POST' as const,
  body: Type.Object({
    name: Type.String({ minLength: 1 }),
    email: Type.String({ format: 'email' }),
    age: Type.Optional(Type.Number({ minimum: 0, maximum: 150 })),
  }),
  response: Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
    age: Type.Optional(Type.Number()),
    createdAt: Type.String(),
  }),
} as const satisfies RouteContract;

export const POST = bind(createUserContract, async (c) => {
  // ✅ Body is automatically validated by bind()
  const body = await c.data();

  // ✅ body.name, body.email are type-safe
  // ✅ body.age is optional (number | undefined)

  return c.json({
    id: '123',
    name: body.name,
    email: body.email,
    age: body.age,
    createdAt: new Date().toISOString(),
  });
});
```

### Complex Routes with Params, Query, and Body

```typescript
const updateUserContract = {
  method: 'PUT' as const,
  params: Type.Object({
    id: Type.String(),
  }),
  query: Type.Object({
    notify: Type.Optional(Type.String()),
  }),
  body: Type.Object({
    name: Type.Optional(Type.String({ minLength: 1 })),
    email: Type.Optional(Type.String({ format: 'email' })),
  }),
  response: Type.Object({
    success: Type.Boolean(),
    updated: Type.Object({
      id: Type.String(),
      name: Type.String(),
      email: Type.String(),
    }),
  }),
} as const satisfies RouteContract;

export const PUT = bind(updateUserContract, async (c) => {
  // ✅ All params/query/body are type-safe and validated
  const userId = c.params.id;
  const notify = c.query.notify;
  const updates = await c.data();

  return c.json({
    success: true,
    updated: {
      id: userId,
      name: updates.name || 'Default Name',
      email: updates.email || 'default@example.com',
    },
  });
});
```

### Type Inference from Contracts

Use `InferContract` to extract types from contracts for reuse:

```typescript
import type { InferContract } from '@spfn/core';

type CreateUserBody = InferContract<typeof createUserContract>['body'];
type CreateUserResponse = InferContract<typeof createUserContract>['response'];

// Use in business logic functions
function processUser(user: CreateUserBody): CreateUserResponse {
  return {
    id: '123',
    name: user.name,
    email: user.email,
    age: user.age,
    createdAt: new Date().toISOString(),
  };
}
```

### Client-Side Type Safety

Contracts enable fully type-safe client code:

```typescript
async function callApi<TContract extends RouteContract>(
  contract: TContract,
  options: {
    params?: InferContract<TContract>['params'];
    query?: InferContract<TContract>['query'];
    body?: InferContract<TContract>['body'];
  }
): Promise<InferContract<TContract>['response']> {
  const url = new URL('http://localhost:4000/api');

  // Add query params
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    method: contract.method,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  return response.json();
}

// ✅ Fully type-safe client calls
const user = await callApi(createUserContract, {
  body: {
    name: 'John',
    email: 'john@example.com',
    age: 30,
  },
});

console.log(user.name); // ✅ Type-safe
console.log(user.createdAt); // ✅ Type-safe
```

### Benefits of TypeBox + bind()

1. ✅ **Type Safety**: Full TypeScript type inference from contracts
2. ✅ **Runtime Validation**: Automatic params/query/body validation
3. ✅ **Developer Experience**: Fastify-style bind(contract, handler) API
4. ✅ **Reusability**: Contracts work for both server & client
5. ✅ **Standards**: TypeBox uses JSON Schema standard
6. ✅ **Performance**: TypeBox is faster than Zod

---

## RouteContext API

The `RouteContext` extends Hono's Context with convenient helper methods:

```typescript
type RouteContext = {
  // Path parameters
  params: Record<string, string>;

  // Query parameters (supports duplicate values as arrays)
  query: Record<string, string | string[]>;

  // Pageable object (from QueryParser middleware)
  pageable: {
    filters?: Record<string, any>;
    sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    pagination?: { page: number; limit: number };
  };

  // Request body parsing helper
  data<T = unknown>(): Promise<T>;

  // JSON response helper
  json: Context['json'];

  // Original Hono Context (for advanced features)
  raw: Context;
};
```

### Usage Examples

```typescript
export async function GET(c: RouteContext) {
  // 1. Access path parameters
  const { id } = c.params;

  // 2. Access query parameters
  const page = c.query.page; // string | string[]

  // 3. Access pageable (if QueryParser middleware is used)
  const { pagination, filters, sort } = c.pageable;

  // 4. Parse request body with type safety
  const body = await c.data<{ name: string; email: string }>();

  // 5. Return JSON response
  return c.json({ success: true, data: body });

  // 6. Access raw Hono Context for advanced features
  const headers = c.raw.req.header();
  c.raw.set('customData', { foo: 'bar' });
}
```

---

## Route Metadata

Add metadata to routes for documentation, authentication, and organization:

```typescript
export const meta = {
  // Route description (for OpenAPI/documentation)
  description: 'Create a new user',

  // Tags for grouping (OpenAPI tags)
  tags: ['users', 'admin'],

  // Authentication required
  auth: true,

  // Custom prefix (overrides file-based path)
  prefix: '/api/v2/users',

  // Any custom metadata
  rateLimit: 100,
  cacheTTL: 3600,
};
```

---

## Middlewares

Apply middlewares per route:

```typescript
import { bearerAuth } from 'hono/bearer-auth';
import { logger } from 'hono/logger';

export async function GET(c: RouteContext) {
  return c.json({ message: 'Protected route' });
}

// Middlewares are applied before the route handler
export const middlewares = [
  logger(),
  bearerAuth({ token: process.env.API_KEY || '' })
];
```

---

## Priority System

Routes are registered in this order to ensure correct matching:

### 1. Static Routes (Priority 1)
Most specific, matched first:
```
🔹 /users
🔹 /users/profile
🔹 /api/v1/health
```

### 2. Dynamic Routes (Priority 2)
Parameter-based routes:
```
🔸 /users/:id
🔸 /posts/:slug
🔸 /users/:id/posts/:postId
```

### 3. Catch-All Routes (Priority 3)
Wildcard routes, matched last:
```
⭐ /docs/*
⭐ /assets/*
```

### Sorting Rules

Within the same priority:
1. **Segment Count**: More segments first (`/users/profile` before `/users`)
2. **Alphabetical Order**: Lexicographic sorting

---

## Architecture

### Module Overview

The routing system consists of 5 core modules:

```
┌─────────────┐    ┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│RouteScanner │ →  │ RouteMapper │ →  │RouteRegistry │ →  │     Hono    │
│  (Scan)     │    │ (Transform) │    │  (Register)  │    │  (Apply)    │
└─────────────┘    └─────────────┘    └──────────────┘    └─────────────┘
      ↓                   ↓                    ↓                   ↓
  RouteFile[]      RouteDefinition[]    Sorted Routes      app.route()
```

### Data Flow

```
1. RouteScanner: Scan file system
   Input:  routes/ directory
   Output: RouteFile[] (file metadata)

2. RouteMapper: Transform to Hono routes
   Input:  RouteFile[]
   Output: RouteDefinition[] (Hono instances)

3. RouteRegistry: Register and sort
   Input:  RouteDefinition[]
   Output: Sorted RouteDefinition[] (priority-based)

4. Hono: Apply routes
   Input:  Sorted RouteDefinition[]
   Output: Registered Hono app
```

### Type Flow

```typescript
RouteFile {
  absolutePath: string;
  relativePath: string;
  segments: string[];
  isDynamic: boolean;
  isCatchAll: boolean;
  isIndex: boolean;
}
  ↓ (mapper.mapRoute)
RouteDefinition {
  urlPath: string;          // "/users/:id"
  filePath: string;         // "users/[id].ts"
  priority: number;         // 1, 2, or 3
  params: string[];         // ["id"]
  honoInstance: Hono;       // Hono instance
  meta?: RouteMeta;         // Metadata
  middlewares?: Middleware[];
}
  ↓ (registry.applyToHono)
Hono app with registered routes
```

---

## Advanced Usage

### Custom Routes Directory

```typescript
import { RouteLoader } from '@spfn/core/route';

const loader = new RouteLoader('/custom/path/to/routes', true);
await loader.loadRoutes(app);
```

### Route Statistics

```typescript
import { RouteRegistry } from '@spfn/core/route';

const registry = new RouteRegistry();
// ... register routes ...

const stats = registry.getStats();
console.log(stats);
// {
//   total: 15,
//   byMethod: { GET: 10, POST: 3, PATCH: 2, ... },
//   byPriority: { static: 8, dynamic: 6, catchAll: 1 },
//   byTag: { users: 5, admin: 3, ... }
// }
```

### Route Grouping by Tag

```typescript
const registry = new RouteRegistry();
// ... register routes ...

// Get all routes with a specific tag
const userRoutes = registry.getRoutesByTag('users');

// Get all tag groups
const groups = registry.getRouteGroups();
// [
//   { name: 'users', routes: [...] },
//   { name: 'admin', routes: [...] }
// ]
```

### Find Routes by Metadata

```typescript
const registry = new RouteRegistry();
// ... register routes ...

// Find all routes that require authentication
const authRoutes = registry.findRoutesByMeta(meta => meta.auth === true);

// Find all routes with specific tag
const adminRoutes = registry.findRoutesByMeta(
  meta => meta.tags?.includes('admin')
);
```

---

## Legacy Hono Style (Still Supported)

You can still export Hono instances directly:

```typescript
import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => {
  return c.json({ message: 'Hello' });
});

app.post('/', async (c) => {
  const body = await c.req.json();
  return c.json({ received: body });
});

export default app;
```

---

## Error Messages

### Invalid Route File

```
❌ Invalid route file: /path/to/routes/invalid.ts

Route files must export one of the following:

1. Default Hono instance (Legacy style):
   export default new Hono().get('/', ...).post('/', ...);

2. HTTP method handlers (Next.js App Router style):
   export async function GET(c: RouteContext) { ... }
   export async function POST(c: RouteContext) { ... }

Supported methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
```

### Duplicate Routes

```
❌ Duplicate route detected:
  URL: /users
  Existing: users/index.ts
  New: users.ts
```

### Route Conflict Warning

```
⚠️  Potential route conflict:
   /users/:id (users/[id].ts)
   /users/:userId (users/[userId].ts)
```

### Invalid Parameter Name

```
❌ Invalid parameter name: default
Parameter names cannot be JavaScript reserved words.
```

---

## Best Practices

### 1. Use Type-Safe Bodies

```typescript
interface CreateUserRequest {
  name: string;
  email: string;
}

export async function POST(c: RouteContext) {
  const body = await c.data<CreateUserRequest>();

  // body is typed as CreateUserRequest
  return c.json({ name: body.name, email: body.email });
}
```

### 2. Organize Routes by Feature

```
routes/
├── users/           # User management
├── posts/           # Blog posts
├── auth/            # Authentication
└── admin/           # Admin panel
```

### 3. Use Metadata for Documentation

```typescript
export const meta = {
  description: 'Get user by ID',
  tags: ['users'],
  auth: true,
};
```

### 4. Apply Middlewares Wisely

```typescript
// Per-route middleware
export const middlewares = [
  bearerAuth({ token: process.env.API_KEY || '' })
];

// Global middleware (in app.ts)
app.use('*', cors());
app.use('*', logger());
```

### 5. Handle Errors Gracefully

```typescript
export async function GET(c: RouteContext) {
  try {
    const { id } = c.params;
    const user = await db.users.findById(id);

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json(user);
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
}
```

---

## Troubleshooting

### ⚠️ Warning: "No route files found"

**Cause:** Routes directory is empty or path is incorrect.

**Solutions:**
1. Check routes directory path
2. Ensure `.ts` files exist (not `.js` or `.tsx`)
3. Verify files aren't excluded (.test.ts, .spec.ts, .d.ts)

### ❌ Error: "Failed to load route"

**Cause:** Syntax error or missing exports in route file.

**Check:**
1. File exports either `default` Hono instance or HTTP method functions
2. No syntax errors in the file
3. All imports are resolvable

### Route Not Matching

**Cause:** Priority order or pattern conflict.

**Debug:**
1. Check route registration log
2. Verify route priority (static > dynamic > catch-all)
3. Look for conflict warnings
4. Test with debug mode: `loadRoutesFromDirectory(app, true)`

---

## Performance Tips

### 1. Use Parallel Route Loading

The system already uses `Promise.allSettled` for parallel processing, but you can optimize by:
- Reducing route file size
- Avoiding heavy computations during module loading
- Using lazy imports for heavy dependencies

### 2. Minimize Middleware Overhead

```typescript
// ❌ Bad: Creates new middleware instance for each request
export const middlewares = [
  () => someHeavyMiddleware()
];

// ✅ Good: Reuse middleware instance
const authMiddleware = someHeavyMiddleware();
export const middlewares = [authMiddleware];
```

### 3. Cache Route Statistics

```typescript
const registry = new RouteRegistry();
// ... register routes ...

// Cache stats to avoid recalculation
const stats = registry.getStats();
```

---

## Related

- [FRAMEWORK_PHILOSOPHY.md](../../../../FRAMEWORK_PHILOSOPHY.md) - Design principles
- [Hono Documentation](https://hono.dev) - Hono web framework
- [Next.js App Router](https://nextjs.org/docs/app) - Routing conventions
- [@spfn/core](../../README.md) - Main package documentation