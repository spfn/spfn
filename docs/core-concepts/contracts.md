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

### Cookies

```typescript
export const getSession = route.get('/session')
    .input({
        cookies: Type.Object({
            sessionId: Type.String()
        })
    })
    .handler(async (c) => {
        const { cookies } = await c.data();
        // cookies.sessionId is typed
    });
```

### Form Data (File Upload)

For file uploads, use `FileSchema` and `FileArraySchema`:

```typescript
import { route, FileSchema, FileArraySchema } from '@spfn/core/route';

// Single file
export const uploadAvatar = route.post('/upload')
    .input({
        formData: Type.Object({
            file: FileSchema(),
            description: Type.Optional(Type.String())
        })
    })
    .handler(async (c) => {
        const { formData } = await c.data();
        const file = formData.file as File;
        // file.name, file.size, file.type
    });

// Multiple files
export const uploadFiles = route.post('/upload-multiple')
    .input({
        formData: Type.Object({
            files: FileArraySchema()
        })
    })
    .handler(async (c) => {
        const { formData } = await c.data();
        const files = formData.files as File[];
    });
```

> For detailed file upload patterns including validation, storage, and security, see [File Upload](/docs/guides/file-upload).

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
| `Nullable(T)` | Nullable value (`T \| null`) | `Nullable(Type.String())` |
| `OptionalNullable(T)` | Optional nullable (`T \| null \| undefined`) | `OptionalNullable(Type.String())` |

### Nullable & OptionalNullable

SPFN provides helpers for nullable types:

```typescript
import { Nullable, OptionalNullable } from '@spfn/core/route';

Type.Optional(Type.String())      // string | undefined
Nullable(Type.String())           // string | null
OptionalNullable(Type.String())   // string | null | undefined
```

## Why TypeBox?

Superfunction uses TypeBox for schema validation:

- **JSON Schema Standard** - Universal format for OpenAPI, tooling, and cross-language support
- **Performance** - 10x faster than Zod, 20x faster than Yup
- **Type Inference** - Full TypeScript type inference from schemas
- **Single Source of Truth** - One schema for runtime validation and TypeScript types

> **Note:** For detailed performance benchmarks, see [Philosophy: Why TypeBox?](/docs/philosophy/why-typebox)

## Response Helpers

### Direct Return

Simply return data from the handler for automatic JSON response:

```typescript
route.get('/users/:id')
    .handler(async (c) => {
        const user = await userRepo.findById(id);
        return user;  // Automatic c.json(user)
    });
```

### Custom Status Codes

Use response helpers for non-200 responses:

```typescript
route.post('/users')
    .handler(async (c) => {
        const user = await userRepo.create(data);
        return c.created(user, `/users/${user.id}`);  // 201 + Location header
    });

route.delete('/users/:id')
    .handler(async (c) => {
        await userRepo.delete(id);
        return c.noContent();  // 204
    });
```

| Helper | Status | Description |
|--------|--------|-------------|
| `c.json(data, status?)` | Custom | JSON with optional status |
| `c.created(data, location?)` | 201 | Created with optional Location header |
| `c.accepted(data?)` | 202 | Accepted |
| `c.noContent()` | 204 | No Content |
| `c.notModified()` | 304 | Not Modified |
| `c.paginated(items, page, limit, total)` | 200 | Paginated response |

### Paginated Response

```typescript
route.get('/users')
    .input({
        query: Type.Object({
            page: Type.Number({ default: 1 }),
            limit: Type.Number({ default: 20 })
        })
    })
    .handler(async (c) => {
        const { query } = await c.data();
        const { items, total } = await userRepo.findPaginated(query);

        return c.paginated(items, query.page, query.limit, total);
        // Response: { items: [...], pagination: { page, limit, total, totalPages } }
    });
```

## Middleware

### Using Middleware

```typescript
import { Transactional } from '@spfn/core/db';
import { authMiddleware } from './middlewares/auth';

route.post('/users')
    .use([Transactional(), authMiddleware])
    .handler(async (c) => {
        // Runs after middleware chain
    });
```

### Skip Global Middleware

Skip specific or all global middlewares for individual routes:

```typescript
// Skip specific middlewares
route.get('/public')
    .skip(['auth', 'rateLimit'])
    .handler(async (c) => { /* ... */ });

// Skip all global middlewares
route.get('/health')
    .skip('*')
    .handler(async (c) => { /* ... */ });
```

## Raw Hono Context

For advanced features, access the underlying Hono context:

```typescript
route.get('/advanced')
    .handler(async (c) => {
        const raw = c.raw;

        // Custom header
        const customHeader = raw.req.header('x-custom');

        // Set response header
        raw.header('x-response', 'value');

        // Get context variable (set by middleware)
        const user = raw.get('user');

        return { data: 'ok' };
    });
```

## Route Registration

Routes are registered in a router using `defineRouter`:

```typescript
// src/server/router.ts
import { defineRouter } from '@spfn/core/route';
import { getUser, createUser, updateUser } from './routes/users';
import { listPosts, getPost } from './routes/posts';

export const appRouter = defineRouter({
    getUser,
    createUser,
    updateUser,
    listPosts,
    getPost,
});

export type AppRouter = typeof appRouter;
```

### Nested Routers

Organize routes into nested namespaces:

```typescript
export const appRouter = defineRouter({
    users: defineRouter({
        get: getUser,
        create: createUser,
    }),
    posts: defineRouter({
        list: getPosts,
        create: createPost,
    }),
});
```

### Spread Pattern

Combine route modules using the spread operator:

```typescript
import * as userRoutes from './routes/users';
import * as postRoutes from './routes/posts';

export const appRouter = defineRouter({
    ...userRoutes,
    ...postRoutes,
});
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
> [How It Works →](/docs/core-concepts/how-it-works) | [Entity Guide →](/docs/guides/entity) | [File Upload →](/docs/guides/file-upload)