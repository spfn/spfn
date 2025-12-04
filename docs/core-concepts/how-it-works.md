---
title: "How It Works"
description: "Understand how Superfunction works under the hood"
order: 1
available: true
---

# How It Works

Superfunction provides end-to-end type safety by connecting route definitions, server handlers, and frontend API calls through automatic code generation and TypeScript type inference.

## The Three-Step Flow

### Step 1: Define Route

**File:** `src/server/routes/users.ts`

Define your API with full type safety using the define-route system:

```typescript
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({
            id: Type.String()
        })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        const user = await userRepo.findById(params.id);
        return user;
    });
```

**What happens:**
- TypeBox schemas define the shape of params, query, body
- These schemas provide both runtime validation and compile-time types
- Handler return type is automatically inferred

### Step 2: Register in Router

**File:** `src/server/router.ts`

Combine all routes in a router for type inference:

```typescript
import { defineRouter } from '@spfn/core/route';
import { getUser, createUser } from './routes/users';

export const appRouter = defineRouter({
    getUser,
    createUser,
});

export type AppRouter = typeof appRouter;
```

**What happens:**
- `defineRouter` captures all route types
- `AppRouter` type contains full type information for all routes
- This enables client code generation

### Step 3: Generate & Use Client

**Command:** `pnpm spfn codegen router`

Type-safe client generated automatically - no manual sync!

```typescript
// app/page.tsx
import { api } from '@/lib/api-client';

export default async function Page() {
    const user = await api.getUser
        .params({ id: '123' })
        .call();
    //    ^ Fully typed! No manual sync needed

    return <div>{user.name}</div>;
}
```

**What happens:**
- Superfunction generates a typed client from the router
- The client provides full IntelliSense and type checking
- Frontend code breaks at compile-time if routes change

## Auto-Sync Flow

Between each step, types flow automatically:

```
┌─────────────────────┐
│  Define Route       │  route.get('/users/:id').input({...}).handler(...)
└──────────┬──────────┘
           │ Type inference
           ▼
┌─────────────────────┐
│  Register Router    │  defineRouter({ getUser, ... })
└──────────┬──────────┘
           │ Code generation
           ▼
┌─────────────────────┐
│  Use in Next.js     │  api.getUser.params({ id }).call()
└─────────────────────┘
```

## Compile-Time Type Safety

Change a route? TypeScript immediately shows errors in your frontend code.

**Example:**

1. You change the handler to return `fullName` instead of `name`
2. TypeScript immediately flags all usages of `user.name` in your frontend
3. You update the frontend to use `user.fullName`
4. Everything is type-safe again!

## The Complete Request Flow

```
1. Client Request
   ↓
2. Route Matching (Hono)
   ↓
3. Global Middleware Stack
   ↓
4. Route Middleware (if any)
   ↓
5. Input Validation
   │ • Validate params
   │ • Validate query
   │ • Validate body
   │ • Type conversion
   ↓
6. Handler Execution
   │ • Fully typed context
   │ • Business logic
   │ • Database operations
   ↓
7. Response Serialization
   ↓
8. Client receives typed data
```

## Why This Works

### Without Superfunction

```typescript
// Backend
app.get('/users/:id', async (req, res) => {
    const id = req.params.id;  // string? number? unknown
    const user = await db.users.find(id);
    res.json(user);  // any shape
});

// Frontend
const response = await fetch(`/users/${id}`);
const user = await response.json();  // type: any
console.log(user.name);  // Hope this exists!
```

### With Superfunction

```typescript
// Route (single source of truth)
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        const user = await db.users.find(params.id);
        return user;  // Type inferred from return
    });

// Frontend (typed automatically)
const user = await api.getUser.params({ id: '123' }).call();
console.log(user.name);   // Type: string (if exists)
console.log(user.age);    // Error: Property 'age' does not exist
```

## Key Principles

1. **Single Source of Truth** - Route definitions define everything
2. **Automatic Validation** - No manual validation code needed
3. **Type Safety** - TypeScript catches errors at compile-time
4. **tRPC-Style API** - Chainable, intuitive client API
5. **Developer Experience** - IntelliSense, autocomplete, and refactoring support

## Under the Hood

### Input Validation

When a request comes in:

1. Match route path and extract params
2. Parse query string
3. Parse request body (if present)
4. Validate against TypeBox schemas
5. Convert types automatically (e.g., string `"123"` → number `123`)
6. Pass validated data to handler via `c.data()`

### Code Generation

When you run `pnpm spfn codegen router`:

1. Load the router definition
2. Extract route metadata (method, path, input types)
3. Generate type-safe client methods
4. Output to `src/lib/api-client.ts`

### Type Inference

TypeScript magic makes it work:

```typescript
// Route defines the shape
const route = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        // params.id is typed as string
        return { id: params.id, name: 'John' };
    });

// Client call is fully typed
const result = await api.getUser.params({ id: '123' }).call();
result.name;  // TypeScript knows this is string
```

## Next Steps

Now that you understand how Superfunction works:

- [Route Definition](/docs/core-concepts/contracts) - Deep dive into defining routes
- [Route Context](/docs/core-concepts/route-binding) - Handler context and middleware
- [Type Safety](/docs/core-concepts/type-safety) - End-to-end type safety details