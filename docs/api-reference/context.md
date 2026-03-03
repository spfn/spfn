---
title: "Context"
description: "Complete API reference for route handler context and request handling"
order: 3
available: true
---

# Context

The route handler context provides type-safe access to request data, validated against your input schemas defined with `.input()`.

## Handler Context

When you define a route with `.handler()`, you receive a context object with access to validated request data and response helpers.

```typescript
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        // c provides type-safe access to request data
        const { params } = await c.data();
        //      ^? { id: string }

        return { id: params.id, name: 'John Doe' };
    });
```

## Context Methods

### c.data()

Type-safe access to all validated request data (params, query, body, headers).

```typescript
export const updateUser = route.put('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
            name: Type.String(),
            email: Type.String()
        })
    })
    .handler(async (c) =>
    {
        const { params, body } = await c.data();
        // params: { id: string }
        // body: { name: string; email: string }

        const user = await updateUserById(params.id, body);
        return user;
    });
```

#### Data Properties

| Property | Description |
|----------|-------------|
| `params` | URL path parameters (e.g., `/users/:id`) |
| `query` | Query string parameters (e.g., `?page=1`) |
| `body` | Request body (POST, PUT, PATCH) |
| `headers` | Request headers (when defined in input) |

### c.json()

Return JSON response with optional status code and headers.

```typescript
// Basic usage
return c.json({ id: 1, name: 'John' });

// With status code
return c.json({ id: 1, name: 'John' }, 201);

// With custom headers
return c.json(
    { id: 1, name: 'John' },
    200,
    { 'X-Custom-Header': 'value' }
);
```

### c.created()

Return 201 Created response with optional Location header.

```typescript
export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            name: Type.String(),
            email: Type.String()
        })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const user = await createUserInDb(body);

        // Returns 201 with Location header
        return c.created(user, `/users/${user.id}`);
    });
```

### c.noContent()

Return 204 No Content response (typically for DELETE operations).

```typescript
export const deleteUser = route.delete('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        await deleteUserById(params.id);

        return c.noContent();
    });
```

### c.success()

Return standardized success response format.

```typescript
return c.success({ id: 1, name: 'John' });
// Response: { success: true, data: { id: 1, name: 'John' } }

// With metadata
return c.success(
    { id: 1, name: 'John' },
    { timestamp: Date.now() }
);
// Response: { success: true, data: {...}, meta: { timestamp: ... } }
```

### c.paginated()

Return paginated list with pagination metadata.

```typescript
export const getUsers = route.get('/users')
    .input({
        query: Type.Object({
            page: Type.Optional(Type.Number({ default: 1 })),
            limit: Type.Optional(Type.Number({ default: 10 }))
        })
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const { page = 1, limit = 10 } = query;

        const users = await findUsers({ page, limit });
        const total = await countUsers();

        return c.paginated(users, page, limit, total);
    });

// Response format:
// {
//   success: true,
//   data: [...],
//   meta: {
//     pagination: {
//       page: 1,
//       limit: 10,
//       total: 100,
//       totalPages: 10
//     }
//   }
// }
```

### c.accepted()

Return 202 Accepted for async operations.

```typescript
export const processJob = route.post('/jobs')
    .input({
        body: Type.Object({ type: Type.String() })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const job = await queueJob(body);

        return c.accepted({ jobId: job.id, status: 'queued' });
    });
```

### c.notModified()

Return 304 Not Modified for cache validation.

```typescript
export const getResource = route.get('/resources/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const etag = c.raw.req.header('If-None-Match');
        const resource = await findResource();
        const currentEtag = generateEtag(resource);

        if (etag === currentEtag)
        {
            return c.notModified();
        }

        c.raw.header('ETag', currentEtag);
        return c.success(resource);
    });
```

## c.raw - Hono Context

Access the underlying Hono context for advanced use cases.

```typescript
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        // Access raw Hono context
        const honoContext = c.raw;

        // Get request headers
        const auth = honoContext.req.header('Authorization');

        // Set response headers
        honoContext.header('X-Request-ID', 'req-123');

        // Access middleware-set values
        const user = honoContext.get('user');

        // Get client IP
        const ip = honoContext.req.header('x-forwarded-for');

        const { params } = await c.data();
        return { id: params.id };
    });
```

## Common Patterns

### GET with Query Parameters

```typescript
export const searchUsers = route.get('/users/search')
    .input({
        query: Type.Object({
            q: Type.String(),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
            offset: Type.Optional(Type.Number({ minimum: 0 }))
        })
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const { q, limit = 10, offset = 0 } = query;

        const results = await searchUsers(q, { limit, offset });
        return { items: results, query: q };
    });
```

### POST with Body

```typescript
export const createTeam = route.post('/teams')
    .input({
        body: Type.Object({
            name: Type.String({ minLength: 1 }),
            slug: Type.String({ pattern: '^[a-z0-9-]+$' }),
            description: Type.Optional(Type.String())
        })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();

        const team = await createTeamInDb(body);
        return c.created(team, `/teams/${team.id}`);
    });
```

### PUT with Params and Body

```typescript
export const updateTeam = route.put('/teams/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
            name: Type.Optional(Type.String()),
            description: Type.Optional(Type.String())
        })
    })
    .handler(async (c) =>
    {
        const { params, body } = await c.data();

        const team = await updateTeamById(params.id, body);
        return team;
    });
```

### Accessing Middleware Data

Middleware can store data in Hono context for handlers to access:

```typescript
// Middleware sets user
export const authMiddleware = defineMiddleware('auth', async (c, next) =>
{
    const token = c.req.header('Authorization')?.replace('Bearer ', '');
    const user = await verifyToken(token);
    c.set('user', user);
    await next();
});

// Handler accesses user via c.raw.get()
export const getProfile = route.get('/profile')
    .handler(async (c) =>
    {
        const user = c.raw.get('user');
        return { id: user.id, email: user.email };
    });
```

### @spfn/auth Context Helpers

When using `@spfn/auth`, the `authenticate` middleware sets an `AuthContext` with user, userId, keyId, role, and locale. Use the provided helper functions for type-safe access:

```typescript
import { getAuth, getUser, getUserId, getKeyId, getRole, getLocale } from '@spfn/auth/server';

// getAuth(c) - Full auth context
export const profileRoute = route.get('/profile')
    .handler(async (c) =>
    {
        const { user, userId, keyId, role, locale } = getAuth(c);
    });

// getUser(c) - User entity
export const meRoute = route.get('/me')
    .handler(async (c) =>
    {
        const user = getUser(c);
        return { email: user.email };
    });

// getUserId(c) - User ID (string)
export const postsRoute = route.get('/my-posts')
    .handler(async (c) =>
    {
        const userId = getUserId(c);
        return await findPosts({ authorId: userId });
    });

// getRole(c) - Role name or null
export const dashboardRoute = route.get('/dashboard')
    .handler(async (c) =>
    {
        const role = getRole(c);
        // 'admin' | 'superadmin' | 'user' | null
    });

// getLocale(c) - User locale (string)
export const localizedRoute = route.get('/content')
    .handler(async (c) =>
    {
        const locale = getLocale(c);
        // 'en' | 'ko' | 'ja' | ...
    });

// getKeyId(c) - Current API key ID
export const rotateRoute = route.post('/keys/rotate')
    .handler(async (c) =>
    {
        const oldKeyId = getKeyId(c);
    });
```

All helpers accept both raw Hono `Context` and `RouteContext` (with `.raw` property).

### Custom Response Headers

```typescript
export const getUsers = route.get('/users')
    .input({
        query: Type.Object({
            limit: Type.Optional(Type.Number()),
            offset: Type.Optional(Type.Number())
        })
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const { limit = 10, offset = 0 } = query;

        const users = await findUsers({ limit, offset });
        const total = await countUsers();

        // Add pagination headers
        return c.json(
            { items: users, total },
            200,
            {
                'X-Total-Count': String(total),
                'X-Page-Size': String(limit),
                'X-Page-Offset': String(offset)
            }
        );
    });
```

### Error Responses

```typescript
import { NotFoundError, ValidationError } from '@spfn/core/errors';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();

        const user = await findUserById(params.id);

        if (!user)
        {
            throw new NotFoundError({ resource: 'User' });
        }

        return user;
    });
```

## Type Inference

Types are automatically inferred from your `.input()` definition:

```typescript
export const createPost = route.post('/posts')
    .input({
        body: Type.Object({
            title: Type.String(),
            content: Type.String(),
            published: Type.Boolean()
        })
    })
    .handler(async (c) =>
    {
        const { body } = await c.data();
        // body is typed as: { title: string; content: string; published: boolean }

        return { id: '1', ...body };
        // Return type is inferred for client-side type safety
    });
```

### Extracting Types

```typescript
import type { InferRouteTypes } from '@spfn/core/route';

// Extract input and output types from a route
type CreatePostTypes = InferRouteTypes<typeof createPost>;
type CreatePostInput = CreatePostTypes['input'];   // { body: { title: string; ... } }
type CreatePostOutput = CreatePostTypes['output']; // { id: string; title: string; ... }
```

## Best Practices

### 1. Always Use c.data()

```typescript
// ✅ Good: Use c.data() for validated data
const { params, body } = await c.data();

// ❌ Bad: Access raw request directly (bypasses validation)
const body = await c.raw.req.json();
```

### 2. Use Response Helpers

```typescript
// ✅ Good: Use appropriate response helpers
return c.created(user, `/users/${user.id}`);  // 201 Created
return c.noContent();                          // 204 No Content
return c.paginated(items, page, limit, total); // Paginated response

// ❌ Bad: Manual response construction
return new Response(JSON.stringify(user), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
});
```

### 3. Use c.raw Only When Necessary

```typescript
// ✅ Good: Use c.raw for Hono-specific features
const requestId = c.raw.get('requestId');
const ip = c.raw.req.header('x-forwarded-for');

// ✅ Good: Use c.data() for request data
const { params, query, body } = await c.data();
```

### 4. Handle Errors with SPFN Error Classes

```typescript
import { NotFoundError, ForbiddenError } from '@spfn/core/errors';

// ✅ Good: Throw typed errors
if (!user)
{
    throw new NotFoundError({ resource: 'User' });
}

if (!hasPermission)
{
    throw new ForbiddenError({ message: 'Access denied' });
}

// ❌ Bad: Generic errors
throw new Error('User not found');
```

> **Note:** Type Safety Benefits
>
> - **Compile-time checks**: TypeScript catches type errors before runtime
> - **IntelliSense**: Full autocomplete for params, query, and body
> - **Refactoring safety**: Changes to input schemas propagate automatically
> - **Runtime validation**: TypeBox validates all input data

> **Next: Middleware**
>
> Learn about built-in middleware and how to create custom middleware.
>
> [Middleware →](/docs/api-reference/middleware)