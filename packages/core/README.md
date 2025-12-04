# @spfn/core - Technical Architecture Documentation

Full-stack type-safe framework for building Next.js + Node.js applications with end-to-end type inference.

[![npm version](https://badge.fury.io/js/@spfn%2Fcore.svg)](https://www.npmjs.com/package/@spfn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

> **Alpha Release**: SPFN is currently in alpha. APIs may change. Use `@alpha` tag for installation.

---

## Table of Contents

- [Overview & Philosophy](#overview--philosophy)
- [System Architecture](#system-architecture)
- [Module Architecture](#module-architecture)
- [Type System](#type-system)
- [Integration Points](#integration-points)
- [Design Decisions](#design-decisions)
- [Extension Points](#extension-points)
- [Migration Guides](#migration-guides)
- [Module Exports](#module-exports)
- [Quick Reference](#quick-reference)

---

## Overview & Philosophy

SPFN (Superfunction) is a full-stack TypeScript framework that provides **end-to-end type safety** from database to frontend with a **tRPC-inspired developer experience**.

### Core Principles

1. **Type Safety First**: Types flow from database schema → server routes → client API
2. **Developer Experience**: tRPC-style API with method chaining (`.params().query().call()`)
3. **Explicit over Magic**: No file-based routing, explicit imports for tree-shaking
4. **Security by Default**: HttpOnly cookies, API Route Proxy, environment isolation
5. **Production Ready**: Transaction management, read/write separation, graceful shutdown

### Design Philosophy

**Inspired by tRPC, Built for Production:**

```typescript
// tRPC-style API calls with structured input
const user = await api.getUser.call({
    params: { id: '123' },
    query: { include: 'posts' }
});
//    ^? { id: string; name: string; email: string; posts: Post[] }
```

**But with production features:**
- Cookie handling via API Route Proxy
- Transaction management with AsyncLocalStorage
- Read/Write database separation
- Graceful shutdown and health checks
- Lifecycle hooks for extensibility

---

## System Architecture

### High-Level Overview

```
+---------------------------------------------------------------+
|                    Next.js Application                         |
|  +----------------------------------------------------------+  |
|  |  Frontend (React)                                        |  |
|  |  - Server Components: SSR, ISR, Static                   |  |
|  |  - Client Components: Interactive UI                     |  |
|  +---------------------------+------------------------------+  |
|                              |                                 |
|                              | import { api } from '@spfn/...' |
|                              | api.getUser.call({ params })   |
|                              v                                 |
|  +----------------------------------------------------------+  |
|  |  RPC Proxy (Edge/Node.js)                                |  |
|  |  app/api/rpc/[routeName]/route.ts                        |  |
|  |                                                           |  |
|  |  1. Resolve routeName → method/path from router          |  |
|  |                                                           |  |
|  |  2. Request Interceptors                                 |  |
|  |     - Auth token injection                               |  |
|  |     - Cookie forwarding                                  |  |
|  |     - Header manipulation                                |  |
|  |                                                           |  |
|  |  3. Forward to SPFN Server                               |  |
|  |     fetch(SPFN_API_URL + resolvedPath)                   |  |
|  |                                                           |  |
|  |  4. Response Interceptors                                |  |
|  |     - Set HttpOnly cookies                               |  |
|  |     - Transform response                                 |  |
|  |     - Error handling                                     |  |
|  +---------------------------+------------------------------+  |
+-------------------------------+--------------------------------+
                                |
                                | HTTP Request
                                v
+---------------------------------------------------------------+
|                      SPFN API Server (Node.js)                 |
|  +----------------------------------------------------------+  |
|  |  Hono Web Framework                                      |  |
|  |                                                           |  |
|  |  12-Step Middleware Pipeline:                            |  |
|  |  1. Logger                                               |  |
|  |  2. CORS                                                 |  |
|  |  3. Global Middlewares                                   |  |
|  |  4. Route-specific Middlewares                           |  |
|  |  5. Request Validation (TypeBox)                         |  |
|  |  6. Route Handler                                        |  |
|  |  7-12. Response processing, error handling               |  |
|  +---------------------------+------------------------------+  |
|                              |                                 |
|                              | define-route System             |
|                              v                                 |
|  +----------------------------------------------------------+  |
|  |  Route Handlers                                          |  |
|  |  - Type-safe input validation                            |  |
|  |  - Transaction middleware                                |  |
|  |  - Business logic                                        |  |
|  +---------------------------+------------------------------+  |
|                              |                                 |
|                              | Database Queries                |
|                              v                                 |
|  +----------------------------------------------------------+  |
|  |  Database Layer (Drizzle ORM)                            |  |
|  |  - Helper functions (findOne, create, etc.)              |  |
|  |  - Transaction propagation (AsyncLocalStorage)           |  |
|  |  - Read/Write separation                                 |  |
|  +---------------------------+------------------------------+  |
+-------------------------------+--------------------------------+
                                |
                                | SQL Queries
                                v
+---------------------------------------------------------------+
|                    PostgreSQL Database                         |
|  - Primary (Read/Write)                                        |
|  - Replica (Read-only) [optional]                              |
+---------------------------------------------------------------+
```

### Request Flow Example

```typescript
// 1. Client Call (Next.js Server Component)
// app/users/[id]/page.tsx
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

const api = createApi<AppRouter>();
const user = await api.getUser.call({ params: { id: params.id } });
// → GET /api/rpc/getUser?input={"params":{"id":"123"}}

// 2. RPC Proxy
// app/api/rpc/[routeName]/route.ts
import { appRouter } from '@/server/router';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST } = createRpcProxy({ router: appRouter });
// - Resolves routeName → method/path from router
// - Forwards to http://localhost:8790/users/123
// - Applies interceptors (auth, cookies)

// 3. SPFN Server Route Handler
// src/server/routes/users.ts
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
    })
    .handler(async (c) => {
        const { params } = await c.data();
        const user = await userRepo.findById(params.id);
        return user;
    });

// 4. Database Query
// Drizzle ORM with helper function
// SELECT * FROM users WHERE id = $1

// 5. Response flows back through interceptors → proxy → client
```

---

## Module Architecture

### 1. Route System (`src/route/`)

**Purpose**: Type-safe routing with automatic validation

**Architecture**:

```
route.get('/users/:id')
    .input({ params, query, body })
    .handler(async (c) => { ... })
    |
    |-- Type Inference: RouteDef<TInput, TResponse>
    |-- Validation: TypeBox schema
    |-- Middleware: Skip control per route
    |-- Response: c.success() / c.error()
```

**Key Components**:

- `defineRouter()`: Combines route definitions into typed router
- `route.get/post/put/patch/delete()`: Route builder with method chaining
- Input validation: Automatic TypeBox validation
- Middleware control: Per-route middleware skip

**Design Pattern**: Builder pattern with type inference

**[→ Full Documentation](./src/route/README.md)**

---

### 2. Server System (`src/server/`)

**Purpose**: HTTP server with lifecycle management

**Architecture**:

```
Configuration Sources (Priority Order):
1. Runtime config (startServer({ port: 3000 }))
2. server.config.ts (defineServerConfig().build())
3. Environment variables (PORT, DATABASE_URL)
4. Defaults

    |
    v
Middleware Pipeline:
1. Request Logger
2. CORS
3. Global Middlewares
4. Named Middlewares
5. beforeRoutes hook
6. Route Registration
7. afterRoutes hook
8. Route-specific Middlewares
9. Request Validation
10. Route Handler Execution
11. Response Serialization
12. Error Handler

    |
    v
Lifecycle Hooks:
- beforeInfrastructure
- afterInfrastructure
- beforeRoutes
- afterRoutes
- afterStart
- beforeShutdown
```

**Key Components**:

- `defineServerConfig()`: Fluent configuration builder
- `createServer()`: Creates Hono app with routes
- `startServer()`: Starts HTTP server with lifecycle
- Lifecycle hooks: beforeInfrastructure, afterInfrastructure, beforeRoutes, afterRoutes, afterStart, beforeShutdown
- Graceful shutdown: SIGTERM/SIGINT handling

**Design Pattern**: Builder + Lifecycle hooks

**[→ Full Documentation](./src/server/README.md)**

---

### 3. Database System (`src/db/`)

**Purpose**: Type-safe database operations with transactions

**Architecture**:

```
Application Code
    |
    | findOne(users, { id: 1 })
    v
Helper Functions (Facade)
    |
    | Check AsyncLocalStorage for transaction
    v
Transaction Context?
    |-- Yes: Use transaction instance
    |-- No: Use default database connection
    |
    v
Drizzle ORM Query Builder
    |
    v
PostgreSQL (Primary or Replica)
```

**Key Components**:

- Helper functions: `findOne`, `findMany`, `create`, `update`, `delete`, `count`
- Transaction middleware: `Transactional()` with AsyncLocalStorage propagation
- Read/Write separation: Automatic routing based on operation
- Schema helpers: `id()`, `timestamps()`, `foreignKey()`, `enumText()`

**Design Pattern**: Facade + AsyncLocalStorage for transaction propagation

**[→ Full Documentation](./src/db/README.md)**

**Transaction Flow**:

```typescript
// Route with Transactional middleware
app.bind(createUserContract, [Transactional()], async (c) => {
    // All database operations use the same transaction
    const user = await create(users, { name: 'John' });
    const profile = await create(profiles, { userId: user.id });

    // Auto-commit on success
    // Auto-rollback on error
    return c.json(user);
});
```

---

### 4. Client System (`src/nextjs/`)

**Purpose**: Type-safe API client for Next.js with tRPC-style DX

**Architecture**:

```
Client Code
    |
    | api.getUser.call({ params: { id: '123' } })
    v
ApiClient (Proxy)
    |
    | body 유무로 GET/POST 결정
    | GET /api/rpc/getUser?input={...}
    | POST /api/rpc/createUser body: {...}
    v
fetch() to Next.js API Route
    |
    v
RpcProxy (API Route Handler)
    |
    | 1. Extract routeName from URL
    | 2. Lookup method/path from appRouter
    | 3. Execute request interceptors
    | 4. Forward to SPFN_API_URL with resolved path
    | 5. Execute response interceptors
    | 6. Set cookies from ctx.setCookies
    v
Return NextResponse
```

**Key Components**:

- `createApi()`: tRPC-style client with type inference (no metadata needed)
- `createRpcProxy()`: RPC-style API Route handler with route resolution
- `registerInterceptors()`: Registry for plugin interceptors
- Path matching: Wildcard and param support (`/_auth/*`, `/users/:id`)
- Cookie handling: `setCookies` array in response interceptors

**Design Pattern**: Proxy for client, RPC resolution for proxy

**[→ Full Documentation](./src/nextjs/README.md)**

---

### 5. Error System (`src/errors/`)

**Purpose**: Structured error handling with HTTP status codes

**Key Components**:

- `ApiError`: Base error class
- `ValidationError`: Input validation failures (400)
- `NotFoundError`: Resource not found (404)
- `ConflictError`: Duplicate resources (409)
- `UnauthorizedError`: Authentication required (401)

**[→ Full Documentation](./src/errors/README.md)**

---

### 6. Logger System (`src/logger/`)

**Purpose**: Structured logging with transports and masking

**Key Components**:

- Adapter pattern: Pino (default) or custom
- Sensitive data masking: Passwords, tokens, API keys
- File rotation: Date and size-based with cleanup
- Multiple transports: Console, File, Slack, Email

**[→ Full Documentation](./src/logger/README.md)**

---

### 7. Cache System (`src/cache/`)

**Purpose**: Valkey/Redis integration with master-replica support

**Key Components**:

- `initCache()`: Initialize connections
- `getCache()`: Write operations (master)
- `getCacheRead()`: Read operations (replica or master)
- `isCacheDisabled()`: Check if cache is disabled
- Graceful degradation when cache unavailable

**[→ Full Documentation](./src/cache/README.md)**

---

### 8. Middleware System (`src/middleware/`)

**Purpose**: Named middleware with skip control

**Key Components**:

- `defineMiddleware()`: Create named middleware
- Skip control: Routes can skip specific middlewares
- Built-in: Logger, CORS, Error handler

**[→ Full Documentation](./src/middleware/README.md)**

---

## Type System

### End-to-End Type Safety Flow

```typescript
// 1. Database Schema (Source of Truth)
// src/server/entities/users.ts
export const users = pgTable('users', {
    id: id(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    ...timestamps(),
});

export type User = typeof users.$inferSelect;
//   ^? { id: string; name: string; email: string; createdAt: Date; updatedAt: Date }

// 2. Server Route Definition
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({
            id: Type.String(),
        }),
        query: Type.Object({
            include: Type.Optional(Type.String()),
        }),
    })
    .handler(async (c) => {
        const { params, query } = await c.data();
        //      ^? { params: { id: string }, query: { include?: string } }

        const user = await findOne(users, { id: params.id });
        //    ^? User | null

        return c.success(user);
        //       ^? Response inferred from return value
    });

// 3. Router Type Export
// src/server/router.ts
export const appRouter = defineRouter({
    getUser,
    // ... other routes
});

export type AppRouter = typeof appRouter;
//   ^? Router<{ getUser: RouteDef<..., ...>, ... }>

// 4. Client API Call (Next.js)
// app/users/[id]/page.tsx
import { api } from '@spfn/core/nextjs/server';

const user = await api.getUser
    .params({ id: '123' })    // Type-checked: must be { id: string }
    .query({ include: 'posts' }) // Type-checked: { include?: string }
    .call();
//  ^? User (inferred from server handler return type)

// Full type inference chain:
// User type → RouteDef → Router → Client API → return type
```

### Type Inference Utilities

```typescript
// Extract input type from route
type GetUserInput = InferRouteInput<typeof getUser>;
//   ^? { params: { id: string }; query: { include?: string } }

// Extract output type from route
type GetUserOutput = InferRouteOutput<typeof getUser>;
//   ^? User

// Client type inference
type ApiClient<TRouter> = {
    [K in keyof TRouter['routes']]: TRouter['routes'][K] extends RouteDef<infer TInput, infer TOutput>
        ? RouteClient<TInput, TOutput>
        : never;
};
```

---

## Integration Points

### 1. Server ↔ Database: Transaction Context

**Mechanism**: AsyncLocalStorage propagates transaction across async calls

```typescript
// Route handler
app.bind(createPostContract, [Transactional()], async (c) => {
    // AsyncLocalStorage stores transaction
    const post = await create(posts, { title: 'Hello' });

    // Same transaction is used automatically
    const tag = await create(tags, { postId: post.id, name: 'news' });

    // Auto-commit on success, auto-rollback on error
    return c.json(post);
});
```

**Why**: No need to pass transaction object through function calls

---

### 2. Server ↔ Client: Type Inference

**Mechanism**: `typeof appRouter` captures all route types

```typescript
// Server: Export router type
export const appRouter = defineRouter({ getUser, createUser });
export type AppRouter = typeof appRouter;

// Client: Import type (not value!)
import type { AppRouter } from '@/server/router';
const api = createApi<AppRouter>(/* ... */);

// Automatic type inference for all routes
const user = await api.getUser.params({ id: '123' }).call();
//    ^? Full type safety without manual type definitions
```

**Why**: Single source of truth (server) → client types automatically sync

---

### 3. Next.js ↔ SPFN: RPC Proxy

**Mechanism**: Next.js API Route resolves routeName and forwards to SPFN server

```typescript
// app/api/rpc/[routeName]/route.ts
import { appRouter } from '@/server/router';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST } = createRpcProxy({ router: appRouter });

// Automatically:
// 1. Resolves routeName → method/path from router
// 2. Forwards to http://localhost:8790/{resolved-path}
// 3. Applies interceptors (auth, cookies)
// 4. Returns NextResponse
```

**Why**:
- HttpOnly cookie support (browser → Next.js includes cookies automatically)
- Security (SPFN_API_URL hidden from browser)
- No CORS (same-origin requests)
- No metadata codegen required

---

### 4. Packages: Registry System

**Mechanism**: Packages register interceptors on import

```typescript
// @spfn/auth package
import { registerInterceptors } from '@spfn/core/nextjs/server';

registerInterceptors('auth', [
    {
        pathPattern: '/_auth/*',
        response: async (ctx, next) => {
            // Set session cookie
            ctx.setCookies.push({ name: 'session', value: token });
            await next();
        },
    },
]);

// App: Auto-discovery
import '@spfn/auth/adapters/nextjs'; // Registers interceptors
export { GET, POST } from '@spfn/core/nextjs/server'; // Uses registered interceptors
```

**Why**: Zero-config integration for plugin packages

---

## Design Decisions

### 1. Why tRPC-Style API over REST Client?

**Decision**: Method chaining with `.params().query().call()`

**Reasons**:
- Better DX: Fluent API guides usage
- Type safety: Each method is type-checked
- Flexibility: Optional parameters can be omitted
- Discovery: IDE autocomplete shows available options

**Example**:
```typescript
// tRPC-style (SPFN)
const user = await api.getUser
    .params({ id: '123' })
    .query({ include: 'posts' })
    .call();

// vs Traditional REST client
const user = await client.get('/users/123', {
    params: { include: 'posts' } // No type safety
});
```

---

### 2. Why API Route Proxy Pattern?

**Decision**: Next.js API Route forwards to SPFN server

**Reasons**:
- **HttpOnly Cookies**: Browser automatically sends cookies to same-origin
- **Security**: SPFN API URL hidden from browser
- **No CORS**: Same-origin requests (localhost:3000 → localhost:3000)
- **Unified Path**: Server Components and Client Components use same API

**Alternative Rejected**: Direct calls from browser to SPFN server
- Would expose SPFN_API_URL to browser
- CORS configuration required
- Cannot use HttpOnly cookies from browser

---

### 3. Why define-route over File-Based Routing?

**Decision**: Explicit route imports with `defineRouter()`

**Reasons**:
- **Explicit Imports**: Better tree-shaking, clear dependencies
- **Type Safety**: `typeof appRouter` captures all routes
- **Flexibility**: Routes can be defined anywhere
- **No Magic**: No file system scanning at runtime

**Alternative Rejected**: File-based routing (like Next.js)
- Runtime file system scanning
- Implicit route registration
- Harder to trace route definitions
- Less flexible for monorepo setups

**Migration Path**: Deprecated contract-based and file-based routing systems

---

### 4. Why AsyncLocalStorage for Transactions?

**Decision**: Transaction propagation without explicit passing

**Reasons**:
- **Clean API**: No need to pass `tx` object through all functions
- **Automatic**: Works across async boundaries
- **Safe**: Isolated per request
- **Compatible**: Works with existing code

**Example**:
```typescript
// With AsyncLocalStorage (SPFN)
async function createPostWithTags(data) {
    const post = await create(posts, data);
    const tags = await createMany(tags, data.tags.map(t => ({ postId: post.id, ...t })));
    // Same transaction automatically
}

// vs Explicit transaction passing
async function createPostWithTags(tx, data) {
    const post = await tx.insert(posts).values(data);
    const tags = await tx.insert(tags).values(...);
    // Must pass tx everywhere
}
```

---

### 5. Why Hono over Express?

**Decision**: Hono as the underlying web framework

**Reasons**:
- **TypeScript First**: Better type inference
- **Performance**: Faster than Express
- **Modern**: Built for Edge/Serverless
- **Lightweight**: Smaller bundle size

---

### 6. Why TypeBox over Zod?

**Decision**: TypeBox for schema validation

**Reasons**:
- **JSON Schema**: Standard, interoperable
- **Performance**: Faster validation (JIT compilation)
- **OpenAPI**: Easy OpenAPI generation
- **Smaller**: Smaller bundle size

**Note**: Both are supported, TypeBox is the default

---

## Extension Points

### 1. Custom Middleware

Add global or route-specific middleware:

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { defineMiddleware } from '@spfn/core/route';

const rateLimitMiddleware = defineMiddleware('rateLimit', async (c, next) => {
    const ip = c.req.header('x-forwarded-for');
    if (await isRateLimited(ip)) {
        return c.json({ error: 'Rate limit exceeded' }, 429);
    }
    await next();
});

export default defineServerConfig()
    .middlewares([rateLimitMiddleware])
    .build();

// Route can skip middleware
export const publicRoute = route.get('/public')
    .middleware({ skip: ['rateLimit'] })
    .handler(async (c) => { ... });
```

---

### 2. Custom Interceptors

Add request/response interceptors:

```typescript
// app/api/rpc/[routeName]/route.ts
import { appRouter } from '@/server/router';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST } = createRpcProxy({
    router: appRouter,
    interceptors: [
        {
            pathPattern: '/admin/*',
            request: async (ctx, next) => {
                // Check admin role
                const isAdmin = await checkAdminRole(ctx.cookies);
                if (!isAdmin) {
                    throw new Error('Unauthorized');
                }
                await next();
            },
        },
    ],
});
```

---

### 3. Plugin System

Create SPFN packages with auto-discovery:

```typescript
// @yourcompany/spfn-analytics package
import { registerInterceptors } from '@spfn/core/nextjs/server';

registerInterceptors('analytics', [
    {
        pathPattern: '*',
        response: async (ctx, next) => {
            await analytics.track({
                path: ctx.path,
                status: ctx.response.status,
                duration: Date.now() - ctx.metadata.startTime,
            });
            await next();
        },
    },
]);

// App: Auto-discovery
import '@yourcompany/spfn-analytics/adapters/nextjs';
export { GET, POST } from '@spfn/core/nextjs/server';
```

---

### 4. Custom Database Helpers

Extend database layer with domain-specific functions:

```typescript
// src/server/repositories/users.repository.ts
import { findOne, create } from '@spfn/core/db';
import { users } from '../entities/users';

export async function findUserByEmail(email: string) {
    return findOne(users, { email });
}

export async function createUserWithProfile(data) {
    const user = await create(users, data.user);
    const profile = await create(profiles, {
        ...data.profile,
        userId: user.id,
    });
    return { user, profile };
}
```

---

## Migration Guides

### From Contract-Based to define-route

**Before** (Deprecated):
```typescript
// contract.ts
export const getUserContract = {
    method: 'GET' as const,
    path: '/users/:id',
    params: Type.Object({ id: Type.String() }),
    response: Type.Object({ id: Type.String(), name: Type.String() }),
} as const satisfies RouteContract;

// route.ts
import { createApp } from '@spfn/core/route';
const app = createApp();
app.bind(getUserContract, async (c) => { ... });
export default app;
```

**After** (Current):
```typescript
// routes/users.ts
import { route } from '@spfn/core/route';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
    })
    .handler(async (c) => {
        const { params } = await c.data();
        return c.success({ id: params.id, name: 'John' });
    });

// router.ts
import { defineRouter } from '@spfn/core/route';
export const appRouter = defineRouter({ getUser });
export type AppRouter = typeof appRouter;
```

**Benefits**:
- Better type inference
- Explicit imports (tree-shaking)
- No separate contract files

---

### From File-Based to define-route

**Before** (Deprecated):
```typescript
// routes/users/[id].ts
export default async function handler(c) { ... }

// Automatic file system scanning
```

**After** (Current):
```typescript
// routes/users.ts
export const getUser = route.get('/users/:id')...

// router.ts
export const appRouter = defineRouter({ getUser });

// server.config.ts
export default defineServerConfig()
    .routes(appRouter)
    .build();
```

**Benefits**:
- Explicit route registration
- Better IDE support
- No runtime file system scanning

---

### From ContractClient to tRPC-Style API

**Before** (Old Client):
```typescript
import { ContractClient } from '@spfn/core/client';
import { getUserContract } from '@/contracts/users';

const client = new ContractClient({ baseUrl: 'http://localhost:8790' });
const user = await client.call(getUserContract, {
    params: { id: '123' },
});
```

**After** (Current):
```typescript
import { api } from '@spfn/core/nextjs/server';

const user = await api.getUser
    .params({ id: '123' })
    .call();
```

**Benefits**:
- tRPC-style DX
- Method chaining
- Better type inference
- Automatic cookie handling

---

## Module Exports

### Main Server Exports

```typescript
import {
    startServer,
    createServer,
    defineServerConfig,
} from '@spfn/core';
```

### Route System

```typescript
import {
    route,
    defineRouter,
} from '@spfn/core/route';

import type {
    RouteDef,
    Router,
    RouteInput,
} from '@spfn/core/route';
```

### Database System

```typescript
import {
    getDatabase,
    findOne,
    findMany,
    create,
    createMany,
    updateOne,
    updateMany,
    deleteOne,
    deleteMany,
    count,
} from '@spfn/core/db';

import {
    Transactional,
    getTransaction,
    runWithTransaction,
} from '@spfn/core/db';
```

### Client System

```typescript
// Client-safe exports (works in Client Components)
import {
    createApi,
    ApiError,
} from '@spfn/core/nextjs';

// Server-only exports (API Routes)
import {
    createRpcProxy,
    registerInterceptors,
} from '@spfn/core/nextjs/server';
```

### Error System

```typescript
import {
    ApiError,
    ValidationError,
    NotFoundError,
    ConflictError,
    UnauthorizedError,
} from '@spfn/core/errors';
```

### Logger System

```typescript
import { logger } from '@spfn/core';
```

### Cache System

```typescript
import {
    initCache,
    getCache,
    getCacheRead,
    isCacheDisabled,
    closeCache,
} from '@spfn/core/cache';
```

### Environment System

```typescript
import {
    defineEnvSchema,
    createEnvRegistry,
    envString,
    envNumber,
    envBoolean,
    envEnum,
} from '@spfn/core/env';
```

### Configuration System

```typescript
import { env, envSchema } from '@spfn/core/config';
```

---

## Quick Reference

### Environment Variables

```bash
# Database (required)
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Database Read Replica (optional)
DATABASE_READ_URL=postgresql://user:pass@replica:5432/db

# Cache - Valkey/Redis (optional)
CACHE_URL=redis://localhost:6379
CACHE_WRITE_URL=redis://master:6379
CACHE_READ_URL=redis://replica:6379

# Next.js App URL (for Server Components calling API Routes)
SPFN_APP_URL=http://localhost:3000

# SPFN API Server URL (for API Route Proxy)
SPFN_API_URL=http://localhost:8790

# Server
PORT=8790
HOST=localhost
NODE_ENV=development

# Server Timeouts (optional, milliseconds)
SERVER_TIMEOUT=120000
SERVER_KEEPALIVE_TIMEOUT=65000
SERVER_HEADERS_TIMEOUT=60000
SHUTDOWN_TIMEOUT=30000

# Logger (optional)
LOGGER_ADAPTER=pino
LOGGER_FILE_ENABLED=true
LOG_DIR=/var/log/myapp
```

---

### Basic Setup

**1. Install**
```bash
npm install @spfn/core hono drizzle-orm postgres @sinclair/typebox
```

**2. Define Routes**
```typescript
// src/server/routes/users.ts
export const getUser = route.get('/users/:id')
    .input({ params: Type.Object({ id: Type.String() }) })
    .handler(async (c) => {
        const { params } = await c.data();
        return c.success({ id: params.id, name: 'John' });
    });
```

**3. Create Router**
```typescript
// src/server/router.ts
export const appRouter = defineRouter({ getUser });
export type AppRouter = typeof appRouter;
```

**4. Configure Server**
```typescript
// src/server/server.config.ts
export default defineServerConfig()
    .port(8790)
    .routes(appRouter)
    .build();
```

**5. Create RPC Proxy (Next.js)**
```typescript
// app/api/rpc/[routeName]/route.ts
import { appRouter } from '@/server/router';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST } = createRpcProxy({ router: appRouter });
```

**6. Use Client**
```typescript
// app/users/[id]/page.tsx
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

const api = createApi<AppRouter>();
const user = await api.getUser.call({ params: { id: '123' } });
```

---

## Documentation

### Technical Architecture
- [Route System](./src/route/README.md) - define-route system, type inference
- [Server System](./src/server/README.md) - Configuration, middleware pipeline, lifecycle
- [Database System](./src/db/README.md) - Helper functions, transactions, schema helpers
- [Client System](./src/nextjs/README.md) - tRPC-style API, TypedProxy, interceptors

### Guides
- [Transaction Management](./src/db/docs/transactions.md)
- [Error Handling](./src/errors/README.md)
- [Logger](./src/logger/README.md)
- [Cache](./src/cache/README.md)
- [Middleware](./src/middleware/README.md)
- [Code Generation](./src/codegen/README.md)

---

## Requirements

- Node.js >= 18
- Next.js 15+ with App Router (when using client integration)
- PostgreSQL
- Valkey/Redis (optional)
- TypeScript >= 5.0

---

## Testing

```bash
npm test                    # Run all tests
npm test -- route           # Run route tests only
npm test -- --coverage      # With coverage
```

**Test Coverage**: 650+ tests across all modules

---

## License

MIT

---

Part of the [Superfunction Framework](https://github.com/spfn/spfn)