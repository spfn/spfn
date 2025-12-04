---
title: "Route Context & Middleware"
description: "Learn about route handler context, response helpers, and middleware"
order: 3
available: true
---

# Route Context & Middleware

Route handlers receive a context object with type-safe access to request data and response helpers.

## Built on Hono

Superfunction is built on top of Hono, a lightweight and ultrafast web framework:

- **Edge-Ready** - Runs on Cloudflare Workers, Deno, Bun, and Node.js
- **Ultrafast** - Minimal overhead with excellent performance
- **Web Standards** - Built on Web Standard APIs (Request/Response)
- **Lightweight** - Zero dependencies, small bundle size

> **Note:** For detailed technical reasons, see [Philosophy: Why Hono?](/docs/philosophy/why-hono)

## Route Context

The handler receives a context object (`c`) with type-safe data access:

```typescript
export const updateUser = route.put('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        query: Type.Object({ notify: Type.Optional(Type.Boolean()) }),
        body: Type.Object({ name: Type.String() })
    })
    .handler(async (c) => {
        // Get all validated input data
        const { params, query, body } = await c.data();

        // params.id is string
        // query.notify is boolean | undefined
        // body.name is string

        return { success: true };
    });
```

### The `data()` Method

`await c.data()` returns all validated input in a single object:

```typescript
const {
    params,   // Path parameters
    query,    // Query string parameters
    body,     // Request body
    headers,  // Validated headers
    cookies   // Validated cookies
} = await c.data();
```

## Response Helpers

The context provides convenient response helpers:

### Return Data Directly

Return data directly for 200 OK response:

```typescript
.handler(async (c) => {
    const user = await userRepo.findById(params.id);
    return user;  // 200 OK with JSON body
});
```

### Created (201)

```typescript
.handler(async (c) => {
    const { body } = await c.data();
    const user = await userRepo.create(body);
    return c.created(user);  // 201 Created
    // Optionally: return c.created(user, `/users/${user.id}`);
});
```

### Accepted (202)

```typescript
.handler(async (c) => {
    const job = await queue.enqueue(task);
    return c.accepted({ jobId: job.id });  // 202 Accepted
});
```

### No Content (204)

```typescript
.handler(async (c) => {
    const { params } = await c.data();
    await userRepo.delete(params.id);
    return c.noContent();  // 204 No Content
});
```

### Paginated Response

```typescript
.handler(async (c) => {
    const { query } = await c.data();
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const users = await userRepo.findAll(limit, (page - 1) * limit);
    const total = await userRepo.count();

    return c.paginated(users, page, limit, total);
    // Response: { items: [...], pagination: { page, limit, total, totalPages } }
});
```

### Custom JSON Response

```typescript
.handler(async (c) => {
    return c.json({ custom: 'data' }, 200, {
        'X-Custom-Header': 'value'
    });
});
```

### Raw Hono Context

Access the underlying Hono context for advanced usage:

```typescript
.handler(async (c) => {
    // Access raw Hono context
    const userAgent = c.raw.req.header('User-Agent');
    const ip = c.raw.req.header('X-Forwarded-For');

    return { userAgent, ip };
});
```

## Middleware

### Route-Level Middleware

Add middleware to specific routes using `.use()` or `.middleware()`:

```typescript
import { route } from '@spfn/core/route';
import { authenticate } from '@spfn/auth/server/middleware';
import { rateLimit } from './middlewares/rate-limit';

export const createPost = route.post('/posts')
    .input({
        body: Type.Object({
            title: Type.String(),
            content: Type.String()
        })
    })
    .use([authenticate, rateLimit({ limit: 10 })])  // Route-specific middleware
    .handler(async (c) => {
        const { body } = await c.data();
        const post = await postRepo.create(body);
        return c.created(post);
    });
```

### Skip Global Middleware

Skip specific global middlewares for public endpoints:

```typescript
// Skip auth middleware for public health check
export const healthCheck = route.get('/health')
    .skip(['auth'])
    .handler(async (c) => {
        return { status: 'ok' };
    });

// Skip all middlewares
export const publicEndpoint = route.get('/public')
    .skip('*')
    .handler(async (c) => {
        return { public: true };
    });
```

### Named Middleware

Define named middleware using `defineMiddleware`:

```typescript
// src/server/middlewares/rate-limit.ts
import { defineMiddleware } from '@spfn/core/route';

export const rateLimit = defineMiddleware('rateLimit', (options: { limit: number }) => {
    return async (c, next) => {
        // Rate limiting logic
        await next();
    };
});
```

## Error Handling

### Built-in Error Types

Throw built-in errors for HTTP responses:

```typescript
import {
    NotFoundError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
    ConflictError
} from '@spfn/core/errors';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        const user = await userRepo.findById(params.id);

        if (!user) {
            throw new NotFoundError({ resource: 'User' });
        }

        return user;
    });
```

### Error Types Reference

| Error Class | Status | Use Case |
|-------------|--------|----------|
| `BadRequestError` | 400 | Malformed request |
| `ValidationError` | 400 | Input validation failure |
| `UnauthorizedError` | 401 | Authentication required |
| `ForbiddenError` | 403 | Permission denied |
| `NotFoundError` | 404 | Resource not found |
| `ConflictError` | 409 | Resource conflict |
| `TooManyRequestsError` | 429 | Rate limit exceeded |
| `InternalServerError` | 500 | Server error |

### Custom Validation Errors

```typescript
.handler(async (c) => {
    const { body } = await c.data();

    const existing = await userRepo.findByEmail(body.email);
    if (existing) {
        throw new ValidationError({
            message: 'Email already exists',
            fields: [{
                path: '/email',
                message: 'This email is already registered',
                value: body.email
            }]
        });
    }

    return await userRepo.create(body);
});
```

### Error Response Format

All errors follow a consistent format:

```json
{
    "error": {
        "name": "NotFoundError",
        "message": "Resource not found",
        "statusCode": 404,
        "resource": "User"
    }
}
```

## Type Conversion

URL strings are automatically converted to schema types:

```typescript
.input({
    params: Type.Object({
        id: Type.Number()      // "123" → 123
    }),
    query: Type.Object({
        active: Type.Boolean(), // "true" → true
        limit: Type.Number()    // "10" → 10
    })
})
```

## Validation Error Response

When validation fails:

```json
{
    "error": {
        "name": "ValidationError",
        "message": "Invalid path parameters",
        "statusCode": 400,
        "fields": [
            {
                "path": "/id",
                "message": "Expected number",
                "value": "abc"
            }
        ]
    }
}
```

> **Next:** Learn how Superfunction ensures end-to-end type safety.
>
> [Type Safety →](/docs/core-concepts/type-safety)