---
title: "Route Definition"
description: "Learn how to define type-safe API routes with the define-route system"
order: 2
available: true
---

# Route Definition

The define-route system is the foundation of Superfunction's type safety. It provides a tRPC-style chainable API for defining routes with automatic validation.

## Basic Route

Define routes using the `route` helper with HTTP method shortcuts:

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

## HTTP Methods

All standard HTTP methods are supported:

```typescript
route.get('/path')      // GET request
route.post('/path')     // POST request
route.put('/path')      // PUT request
route.patch('/path')    // PATCH request
route.delete('/path')   // DELETE request
```

## Input Validation

The `.input()` method accepts TypeBox schemas for validation:

### Path Parameters

```typescript
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({
            id: Type.String()
        })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        // params.id is typed as string
    });
```

### Query Parameters

```typescript
export const listUsers = route.get('/users')
    .input({
        query: Type.Object({
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
            offset: Type.Optional(Type.Number({ minimum: 0 })),
            search: Type.Optional(Type.String())
        })
    })
    .handler(async (c) => {
        const { query } = await c.data();
        // query.limit, query.offset, query.search are typed
    });
```

### Request Body

```typescript
export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            name: Type.String({ minLength: 1, maxLength: 100 }),
            email: Type.String({ format: 'email' }),
            role: Type.Optional(Type.Union([
                Type.Literal('admin'),
                Type.Literal('user')
            ]))
        })
    })
    .handler(async (c) => {
        const { body } = await c.data();
        // body.name, body.email, body.role are typed
    });
```

### Headers

```typescript
export const protectedRoute = route.get('/protected')
    .input({
        headers: Type.Object({
            authorization: Type.String()
        })
    })
    .handler(async (c) => {
        const { headers } = await c.data();
        // headers.authorization is typed
    });
```

### Combined Input

```typescript
export const updateUser = route.put('/users/:id')
    .input({
        params: Type.Object({
            id: Type.String()
        }),
        query: Type.Object({
            notify: Type.Optional(Type.Boolean())
        }),
        body: Type.Object({
            name: Type.Optional(Type.String()),
            email: Type.Optional(Type.String({ format: 'email' }))
        })
    })
    .handler(async (c) => {
        const { params, query, body } = await c.data();
        // All inputs are typed
    });
```

## TypeBox Schemas

Superfunction uses TypeBox for schema definitions. Common types:

| Type | Description | Example |
|------|-------------|---------|
| `Type.String()` | String with optional constraints | `Type.String({ minLength: 1 })` |
| `Type.Number()` | Numeric values | `Type.Number({ minimum: 0 })` |
| `Type.Boolean()` | Boolean values | `Type.Boolean()` |
| `Type.Array(T)` | Array of type T | `Type.Array(Type.String())` |
| `Type.Object()` | Object with typed properties | `Type.Object({ name: Type.String() })` |
| `Type.Optional(T)` | Make a field optional | `Type.Optional(Type.String())` |
| `Type.Union([])` | Union types | `Type.Union([Type.Literal('a'), Type.Literal('b')])` |
| `Type.Literal(v)` | Exact value | `Type.Literal('active')` |

## Why TypeBox?

Superfunction uses TypeBox for schema validation:

- **JSON Schema Standard** - Universal format for OpenAPI, tooling, and cross-language support
- **Performance** - 10x faster than Zod, 20x faster than Yup
- **Type Inference** - Full TypeScript type inference from schemas
- **Single Source of Truth** - One schema for runtime validation and TypeScript types

> **Note:** For detailed performance benchmarks, see [Philosophy: Why TypeBox?](/docs/philosophy/why-typebox)

## Route Registration

Routes are registered in a router using `defineRouter`:

```typescript
// src/server/router.ts
import { defineRouter } from '@spfn/core/route';
import { getUser, createUser, updateUser } from './routes/users';
import { listPosts, getPost } from './routes/posts';

export const appRouter = defineRouter({
    // User routes
    getUser,
    createUser,
    updateUser,

    // Post routes
    listPosts,
    getPost,
});

export type AppRouter = typeof appRouter;
```

## Route Organization

Organize routes by domain or feature:

```bash
src/server/
├── routes/
│   ├── users.ts        # User routes (getUser, createUser, ...)
│   ├── posts.ts        # Post routes (listPosts, getPost, ...)
│   ├── auth.ts         # Auth routes (login, logout, ...)
│   └── health.ts       # Health check route
├── router.ts           # Main router (defineRouter)
└── repositories/
    └── user.repository.ts
```

> **Next:** Learn about middleware and response helpers in route handlers.
>
> [How It Works →](/docs/core-concepts/how-it-works)