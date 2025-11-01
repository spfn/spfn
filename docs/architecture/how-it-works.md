---
title: "How It Works"
description: "Understand how SPFN works under the hood"
order: 1
available: true
---

# How It Works

SPFN provides end-to-end type safety by connecting contracts, server routes, and frontend API calls through automatic code generation and TypeScript type inference.

## The Three-Step Flow

### Step 1: Define Contract

**File:** `src/lib/contracts/users.ts`

Define your API shape once with full type safety:

```typescript
export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  params: Type.Object({
    id: Type.String()
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String()
  })
};
```

**What happens:**
- TypeBox schemas define the shape of params, query, body, and response
- These schemas provide both runtime validation and compile-time types
- Contracts are the single source of truth for your API

### Step 2: Implement Route

**File:** `src/server/routes/users/[id]/index.ts`

Bind contract to handler with automatic validation:

```typescript
import { bind } from '@spfn/core';
import { getUserContract } from '@/lib/contracts/users';

export const GET = bind(
  getUserContract,
  async (c) => {
    const user = await repo
      .findById(c.params.id);
    return c.json(user);
  }
);
```

**What happens:**
- The `bind` function connects your contract to the handler
- Request validation happens automatically before your handler runs
- TypeScript knows the exact types of `c.params`, `c.query`, and `c.body`
- Response type is validated against the contract schema

### Step 3: Use in Next.js

**File:** Auto-generated `src/lib/api.ts`

Type-safe client generated automatically - no manual sync!

```typescript
import { api } from '@/lib/api'

const user = await api.users.getById({
  params: { id: '123' }
});
//    ^ Fully typed!
//    No manual sync needed
```

**What happens:**
- SPFN scans all contracts and generates a typed client
- The client provides full IntelliSense and type checking
- Frontend code breaks at compile-time if contracts change
- No need to manually update API call types

## Auto-Sync Magic

Between each step, SPFN automatically synchronizes types:

1. **Contract → Server**: TypeScript inference provides typed context
2. **Server → Build**: Code generation creates typed client
3. **Client → Frontend**: Import and use with full type safety

```
┌─────────────────┐
│ Define Contract │
└────────┬────────┘
         │ Auto-sync
         ▼
┌─────────────────┐
│ Implement Route │
└────────┬────────┘
         │ Auto-sync
         ▼
┌─────────────────┐
│  Use in Next.js │
└─────────────────┘
```

## Compile-time Type Safety

The magic: Change the contract? TypeScript immediately shows errors in your frontend code.

**Example:**

1. You change the contract response from `name: string` to `fullName: string`
2. TypeScript immediately flags all usages of `user.name` in your frontend
3. You update the frontend to use `user.fullName`
4. Everything is type-safe again!

**Benefits:**
- No runtime surprises
- No manual API documentation needed
- Just pure type safety from contract to UI

## Under the Hood

### Contract Validation

When a request comes in:

1. Extract params from URL path
2. Parse query string
3. Parse request body (if present)
4. Validate against contract schemas using TypeBox
5. Convert types automatically (e.g., string `"123"` → number `123`)
6. Pass validated data to handler
7. Validate response before sending

### Code Generation

During build:

1. Scan `src/lib/contracts/` for all exported contracts
2. Group contracts by resource (e.g., all `/users/*` endpoints)
3. Generate typed client methods for each contract
4. Output to `src/lib/api.ts`
5. Frontend imports and uses the generated client

### Type Inference

TypeScript magic:

```typescript
// Contract defines the shape
const contract = {
  params: Type.Object({ id: Type.Number() }),
  response: Type.Object({ name: Type.String() })
};

// Handler gets typed context automatically
const handler = (c: RouteContext<typeof contract>) => {
  c.params.id    // TypeScript knows this is number
  return c.json({ name: 'John' })  // Must match response schema
};

// Client call is fully typed
const result = await api.get({ params: { id: 123 } });
result.name  // TypeScript knows this exists and is string
```

## The Complete Request Flow

```
1. Client Request
   ↓
2. Route Matching (Hono)
   ↓
3. Middleware Stack
   ↓
4. Contract Validation
   │ • Validate params
   │ • Validate query
   │ • Validate body
   │ • Type conversion
   ↓
5. Handler Execution
   │ • Fully typed context
   │ • Business logic
   │ • Database operations
   ↓
6. Response Validation
   │ • Validate against response schema
   │ • Type checking
   ↓
7. JSON Response
   ↓
8. Client receives typed data
```

## Key Principles

1. **Single Source of Truth**: Contracts define everything
2. **Automatic Validation**: No manual validation code needed
3. **Type Safety**: TypeScript catches errors at compile-time
4. **Zero Overhead**: Validation only in development, optional in production
5. **Developer Experience**: IntelliSense, autocomplete, and refactoring support

## Why This Matters

**Without SPFN:**
```typescript
// Backend
app.get('/users/:id', async (req, res) => {
  const id = req.params.id;  // string? number? who knows
  const user = await db.users.find(id);
  res.json(user);  // any shape
});

// Frontend
const response = await fetch(`/users/${id}`);
const user = await response.json();  // type: any
console.log(user.name);  // Hope this exists!
```

**With SPFN:**
```typescript
// Contract (single source of truth)
export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  params: Type.Object({ id: Type.Number() }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String()
  })
};

// Backend (typed automatically)
export const GET = bind(getUserContract, async (c) => {
  const id = c.params.id;  // Type: number ✓
  const user = await db.users.find(id);
  return c.json(user);  // Must match contract schema ✓
});

// Frontend (typed automatically)
const user = await api.users.getById({ params: { id: 123 } });
console.log(user.name);  // Type: string ✓
console.log(user.age);   // Error: Property 'age' does not exist ✓
```

## Next Steps

Now that you understand how SPFN works, explore:

- [Testing](/docs/guides/testing) - Learn how to test your SPFN application
- [Deployment](/docs/guides/deployment) - Deploy to production
- [API Reference](/docs/api-reference/route-contract) - Deep dive into contracts