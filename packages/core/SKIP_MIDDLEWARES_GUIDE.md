# Skip Middlewares Guide

> Contract-based method-level middleware control

## 📌 Overview

`skipMiddlewares` allows you to skip specific global middlewares on a **per-method basis** within the same route file. This is similar to Spring Boot's `@PreAuthorize` or `@PublicEndpoint` annotations.

## 🎯 Use Cases

### Common Scenario: Public GET, Protected POST/PATCH/DELETE

```typescript
// src/routes/users/[id].ts
import { createApp } from '@spfn/core';
import { getUserContract, updateUserContract, deleteUserContract } from './contracts';

const app = createApp();

// ✅ GET - Public (skip auth)
app.bind(getUserContract, async (c) => {
  return c.json({ user: {} });
});

// ✅ PATCH - Protected (auth required)
app.bind(updateUserContract, async (c) => {
  return c.json({ updated: true });
});

// ✅ DELETE - Protected (auth required)
app.bind(deleteUserContract, async (c) => {
  return c.json({ deleted: true });
});

export default app;
```

### Contract Definition

```typescript
// src/contracts/users.ts
import { Type as t } from '@sinclair/typebox';

export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  params: t.Object({ id: t.String() }),
  response: t.Object({ user: t.Object({}) }),
  meta: {
    skipMiddlewares: ['auth'], // ← Skip auth for this endpoint
  },
} as const;

export const updateUserContract = {
  method: 'PATCH',
  path: '/users/:id',
  params: t.Object({ id: t.String() }),
  body: t.Object({ name: t.String() }),
  response: t.Object({ updated: t.Boolean() }),
  // No skipMiddlewares → auth will be applied
} as const;

export const deleteUserContract = {
  method: 'DELETE',
  path: '/users/:id',
  params: t.Object({ id: t.String() }),
  response: t.Object({ deleted: t.Boolean() }),
  // No skipMiddlewares → auth will be applied
} as const;
```

## 🔧 How It Works

### 1. Global Middleware Registration

```typescript
// src/index.ts
import { createServer } from '@spfn/core';

const app = createServer({
  middlewares: [
    { name: 'auth', handler: authMiddleware },
    { name: 'rateLimit', handler: rateLimitMiddleware },
    { name: 'logging', handler: loggingMiddleware },
  ],
});
```

### 2. Contract-based Skip Control

When you use `createApp()` and define contracts with `meta.skipMiddlewares`:

```typescript
const contract = {
  method: 'GET',
  path: '/public',
  response: t.Object({}),
  meta: {
    skipMiddlewares: ['auth', 'rateLimit'], // Skip multiple middlewares
  },
};
```

### 3. Auto-loader Processing

The auto-loader:

1. Detects that your app uses `createApp()` (checks for `_contractMetas`)
2. Registers a meta-setting middleware that reads contract metadata
3. Wraps each global middleware to check if it should be skipped
4. Executes only the middlewares that are not in the skip list

### Internal Flow

```typescript
// 1. Meta-setting middleware (runs first)
app.use('/users/:id', (c, next) => {
  const method = c.req.method; // 'GET'
  const key = `${method} /users/:id`; // 'GET /users/:id'
  const meta = routeApp._contractMetas.get(key);
  if (meta?.skipMiddlewares) {
    c.set('_skipMiddlewares', meta.skipMiddlewares);
  }
  return next();
});

// 2. Wrapped global middlewares
app.use('/users/:id', async (c, next) => {
  const skipList = c.get('_skipMiddlewares') || [];
  if (skipList.includes('auth')) {
    return next(); // Skip auth
  }
  return authMiddleware(c, next); // Execute auth
});
```

## 📋 Complete Example

### Project Structure

```
src/
├── contracts/
│   └── users.ts          # Contract definitions
├── routes/
│   └── users/
│       └── [id].ts       # Route handlers
└── index.ts              # Server setup
```

### 1. Contract Definition (`src/contracts/users.ts`)

```typescript
import { Type as t } from '@sinclair/typebox';

// Public endpoint - anyone can view user profiles
export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  params: t.Object({ id: t.String() }),
  response: t.Object({
    id: t.String(),
    name: t.String(),
    bio: t.Optional(t.String()),
  }),
  meta: {
    skipMiddlewares: ['auth'],
    description: 'Get user profile (public)',
  },
} as const;

// Protected endpoint - only authenticated users can update
export const updateUserContract = {
  method: 'PATCH',
  path: '/users/:id',
  params: t.Object({ id: t.String() }),
  body: t.Object({
    name: t.Optional(t.String()),
    bio: t.Optional(t.String()),
  }),
  response: t.Object({
    id: t.String(),
    name: t.String(),
    bio: t.Optional(t.String()),
  }),
  meta: {
    description: 'Update user profile (auth required)',
  },
} as const;

// Protected endpoint - only authenticated users can delete
export const deleteUserContract = {
  method: 'DELETE',
  path: '/users/:id',
  params: t.Object({ id: t.String() }),
  response: t.Object({
    deleted: t.Boolean(),
  }),
  meta: {
    description: 'Delete user (auth required)',
  },
} as const;
```

### 2. Route Handler (`src/routes/users/[id].ts`)

```typescript
import { createApp } from '@spfn/core';
import {
  getUserContract,
  updateUserContract,
  deleteUserContract,
} from '@/contracts/users';

const app = createApp();

// Public - anyone can view
app.bind(getUserContract, async (c) => {
  const { id } = c.params;
  const user = await db.users.findById(id);
  return c.json(user);
});

// Protected - authentication required
app.bind(updateUserContract, async (c) => {
  const { id } = c.params;
  const updates = await c.data();
  const user = await db.users.update(id, updates);
  return c.json(user);
});

// Protected - authentication required
app.bind(deleteUserContract, async (c) => {
  const { id } = c.params;
  await db.users.delete(id);
  return c.json({ deleted: true });
});

export default app;
```

### 3. Server Setup (`src/index.ts`)

```typescript
import { createServer } from '@spfn/core';
import { authMiddleware } from './middlewares/auth';
import { rateLimitMiddleware } from './middlewares/rate-limit';

const app = createServer({
  middlewares: [
    { name: 'auth', handler: authMiddleware },
    { name: 'rateLimit', handler: rateLimitMiddleware },
  ],
});

app.listen(3000);
```

## ⚠️ Important Notes

### 1. Middleware Name Matching

The `skipMiddlewares` array uses the `name` property from middleware registration:

```typescript
// Registration
middlewares: [
  { name: 'auth', handler: authMiddleware },
  //     ^^^^^ Use this exact name in skipMiddlewares
]

// Contract
meta: {
  skipMiddlewares: ['auth'], // Must match exactly
}
```

### 2. Method-Level vs File-Level

- **Contract-based (createApp)**: Method-level control ✅
- **Legacy (export meta)**: File-level control (fallback)

```typescript
// ❌ File-level (all methods affected)
export const meta = { skipMiddlewares: ['auth'] };

// ✅ Method-level (per contract)
const contract = {
  meta: { skipMiddlewares: ['auth'] }
};
```

### 3. Contract Metadata Storage

- Metadata is stored in `app._contractMetas` (internal use)
- Auto-loader detects this to enable method-level control
- Don't manually modify `_contractMetas`

## 🔍 Comparison with Spring Boot

| Spring Boot | SPFN Core |
|-------------|-----------|
| `@PreAuthorize("permitAll()")` | `meta: { skipMiddlewares: ['auth'] }` |
| `@PublicEndpoint` | `meta: { skipMiddlewares: ['auth'] }` |
| Annotation-based | Contract-based |
| Runtime reflection | Build-time registration |

## 🚀 Benefits

1. **Type-Safe**: Contract definitions ensure consistency
2. **Declarative**: Middleware policy is part of the contract
3. **Method-Level**: Different methods on same path can have different policies
4. **DRY**: Policy is defined once in contract, not repeated in handler
5. **Client Generation**: Codegen can detect public endpoints

## 🔄 Migration from Conditional Middleware

If you were using the old `conditionalMiddleware` pattern:

**Before (conditional.ts - deprecated):**
```typescript
app.use(conditionalMiddleware('auth', (c) => {
  return c.get('routeMeta')?.public !== true;
}));
```

**After (contract-based):**
```typescript
const publicContract = {
  method: 'GET',
  path: '/public',
  response: t.Object({}),
  meta: { skipMiddlewares: ['auth'] },
};
```

## 📚 Related Documentation

- [Route Contract Types](./src/route/types.ts) - `RouteContract` and `RouteMeta` types
- [Create App](./src/route/create-app.ts) - `createApp()` function
- [Auto Loader](./src/route/auto-loader.ts) - Route loading mechanism
- [Test Examples](./src/route/__tests__/skip-middlewares.test.ts) - Usage examples