---
title: "Route Binding"
description: "Learn how to bind contracts to handlers with middleware, validation, and error handling"
order: 2
available: true
---

Route binding connects your contracts to handler functions with automatic validation, middleware support, and type-safe context.

## Built on Hono

SPFN is built on top of Hono, a lightweight and ultrafast web framework:

- **Edge-Ready** - Runs on Cloudflare Workers, Deno, Bun, and Node.js
- **Ultrafast** - Minimal overhead with excellent performance
- **Web Standards** - Built on Web Standard APIs (Request/Response)
- **Lightweight** - Zero dependencies, small bundle size

> **Note:** For detailed technical reasons and runtime comparisons, see [Architecture: Why Hono?](/docs/architecture/why-hono)

## Basic Binding

Use `app.bind()` to connect a contract to its handler:

```typescript
// src/server/routes/teams/index.ts
import { createApp } from '@spfn/core/route';
import { getTeamsContract } from '@/lib/contracts/teams';

const app = createApp();

// Bind contract to handler
app.bind(getTeamsContract, async (c) => {
  // Handler implementation
  const teams = await findMany(teamsTable);
  return c.json({ teams, total: teams.length });
});

export default app;
```

## Route Context API

The route context (`c`) provides type-safe access to request data:

### Path Parameters

Path parameters are automatically validated and type-converted:

```typescript
// Contract with path parameter
export const getTeamContract = {
  method: 'GET' as const,
  path: '/teams/:id',
  params: Type.Object({
    id: Type.Integer()  // String "123" → Number 123
  }),
  response: TeamSchema
} as const satisfies RouteContract;

// Handler - c.params is typed!
app.bind(getTeamContract, async (c) => {
  const { id } = c.params;  // Type: number
  const team = await findOne(teamsTable, { id });

  if (!team) {
    throw new NotFoundError('Team not found');
  }

  return c.json(team);
});
```

### Query Parameters

Query parameters support arrays and automatic type conversion:

```typescript
// Contract with query parameters
export const searchPostsContract = {
  method: 'GET' as const,
  path: '/posts/search',
  query: Type.Object({
    tags: Type.Array(Type.String()),  // Support for multiple values
    limit: Type.Optional(Type.Number()),
    offset: Type.Optional(Type.Number())
  }),
  response: PostsResponseSchema
} as const satisfies RouteContract;

// Request: GET /posts/search?tags=javascript&tags=typescript&limit=10
app.bind(searchPostsContract, async (c) => {
  const { tags, limit = 10, offset = 0 } = c.query;
  // tags: string[] = ['javascript', 'typescript']
  // limit: number = 10

  const posts = await searchPosts({ tags, limit, offset });
  return c.json({ posts, total: posts.length });
});
```

### Request Body

Use `await c.data()` to get validated request body:

```typescript
export const createTeamContract = {
  method: 'POST' as const,
  path: '/teams',
  body: Type.Object({
    name: Type.String({ minLength: 1, maxLength: 100 }),
    slug: Type.String({ pattern: '^[a-z0-9-]+$' })
  }),
  response: TeamSchema
} as const satisfies RouteContract;

app.bind(createTeamContract, async (c) => {
  // Body is automatically validated
  const data = await c.data();
  // data: { name: string; slug: string }

  // Business logic validation
  const existing = await findOne(teamsTable, { slug: data.slug });
  if (existing) {
    throw new ValidationError('Slug already exists', {
      fields: [{
        path: '/slug',
        message: 'This slug is already taken',
        value: data.slug
      }]
    });
  }

  const team = await create(teamsTable, data);
  return c.json(team);
});
```

### Raw Hono Context

Access the underlying Hono context for advanced usage:

```typescript
app.bind(updateTeamContract, async (c) => {
  // Access raw Hono context
  const token = c.raw.req.header('Authorization');
  const userAgent = c.raw.req.header('User-Agent');

  // Set custom headers
  return c.json(data, 200, {
    'X-Custom-Header': 'value'
  });
});
```

## Automatic Validation

SPFN automatically validates all incoming requests against your contract schemas:

### Type Conversion

URL strings are automatically converted to schema types:

```typescript
params: Type.Object({
  id: Type.Integer(),        // "123" → 123
  active: Type.Boolean()     // "true" → true
})

query: Type.Object({
  limit: Type.Number(),      // "10" → 10
  tags: Type.Array(Type.String())  // ?tags=a&tags=b → ['a', 'b']
})
```

### Validation Error Response

When validation fails, SPFN returns a structured error response:

```json
// Request: GET /teams/abc (id should be integer)
// Response: 400 Bad Request
{
  "error": {
    "message": "Invalid path parameters",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {
      "fields": [
        {
          "path": "/id",
          "message": "Expected integer",
          "value": "abc"
        }
      ]
    }
  }
}
```

## Middleware Management

SPFN provides flexible middleware management at both global and method levels.

### Global Middlewares

Configure global middlewares in `server.config.ts`:

```typescript
// src/server/server.config.ts
import type { ServerConfig } from '@spfn/core';
import { authMiddleware } from '@spfn/auth';
import { rateLimitMiddleware } from './middlewares/rate-limit';
import { loggingMiddleware } from './middlewares/logging';

export default {
  middlewares: [
    { name: 'logging', handler: loggingMiddleware() },
    { name: 'auth', handler: authMiddleware() },
    { name: 'rateLimit', handler: rateLimitMiddleware() }
  ]
} satisfies ServerConfig;
```

### Method-Level Middleware Control

Skip specific middlewares per contract using `meta.skipMiddlewares`:

```typescript
// GET - Public endpoint (no auth required)
export const getTeamsContract = {
  method: 'GET' as const,
  path: '/teams',
  response: TeamsResponseSchema,
  meta: {
    skipMiddlewares: ['auth']  // ← Skip auth for this endpoint
  }
} as const satisfies RouteContract;

// POST - Protected endpoint (auth required)
export const createTeamContract = {
  method: 'POST' as const,
  path: '/teams',
  body: CreateTeamSchema,
  response: TeamSchema
  // No skipMiddlewares → auth will run
} as const satisfies RouteContract;

// PUT - Protected endpoint (auth required)
export const updateTeamContract = {
  method: 'PUT' as const,
  path: '/teams/:id',
  params: Type.Object({ id: Type.Integer() }),
  body: UpdateTeamSchema,
  response: TeamSchema
  // No skipMiddlewares → auth will run
} as const satisfies RouteContract;
```

> **ℹ️ Info:** Method-Level Control Benefits
>
> - Same path, different policies per HTTP method
> - Policy is part of the contract definition (single source of truth)
> - Full TypeScript support
> - Minimal runtime overhead

### Route-Specific Middlewares

Add middlewares to specific routes using the three-argument `bind()`:

```typescript
import { createApp } from '@spfn/core/route';
import { adminOnlyMiddleware } from '@/server/middlewares/admin';

const app = createApp();

// Add route-specific middleware
app.bind(
  deleteTeamContract,
  [adminOnlyMiddleware],  // ← Only for this route
  async (c) => {
    const { id } = c.params;
    await deleteOne(teamsTable, { id });
    return c.json({ success: true });
  }
);
```

## Error Handling

SPFN provides built-in error types for common HTTP errors:

### Built-in Error Types

```typescript
import {
  ValidationError,    // 400 Bad Request
  UnauthorizedError,  // 401 Unauthorized
  ForbiddenError,     // 403 Forbidden
  NotFoundError,      // 404 Not Found
  ConflictError,      // 409 Conflict
  InternalServerError // 500 Internal Server Error
} from '@spfn/core';

app.bind(getTeamContract, async (c) => {
  const { id } = c.params;
  const team = await findOne(teamsTable, { id });

  if (!team) {
    // Automatically returns 404 with proper error structure
    throw new NotFoundError('Team not found');
  }

  return c.json(team);
});
```

### Custom Validation Errors

Throw `ValidationError` for business logic validation:

```typescript
app.bind(createTeamContract, async (c) => {
  const data = await c.data();

  // Check for duplicate slug
  const existing = await findOne(teamsTable, { slug: data.slug });

  if (existing) {
    throw new ValidationError('Validation failed', {
      fields: [
        {
          path: '/slug',
          message: 'This slug is already taken',
          value: data.slug
        }
      ]
    });
  }

  const team = await create(teamsTable, data);
  return c.json(team);
});
```

### Error Response Format

All errors follow a consistent response format:

```json
{
  "error": {
    "message": "Validation failed",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {
      "fields": [
        {
          "path": "/slug",
          "message": "This slug is already taken",
          "value": "my-team"
        }
      ]
    }
  }
}
```

## Advanced Patterns

### Multiple Response Types

Use `Type.Union()` for success/error responses:

```typescript
export const getTeamContract = {
  method: 'GET' as const,
  path: '/teams/:id',
  params: Type.Object({ id: Type.Integer() }),
  response: Type.Union([
    // Success (200)
    Type.Object({
      id: Type.Number(),
      name: Type.String(),
      slug: Type.String()
    }),
    // Error (404)
    Type.Object({
      error: Type.String(),
      code: Type.String()
    })
  ])
} as const satisfies RouteContract;

app.bind(getTeamContract, async (c) => {
  const { id } = c.params;
  const team = await findOne(teamsTable, { id });

  if (!team) {
    return c.json(
      { error: 'Team not found', code: 'NOT_FOUND' },
      404
    );
  }

  return c.json(team, 200);
});
```

### Reusable Schemas

Define shared schemas to reduce duplication:

```typescript
// src/lib/contracts/teams.ts
import { Type } from '@sinclair/typebox';

// Shared schema
const TeamSchema = Type.Object({
  id: Type.Number(),
  name: Type.String(),
  slug: Type.String(),
  createdAt: Type.String()
});

// Reuse in multiple contracts
export const getTeamContract = {
  method: 'GET' as const,
  path: '/teams/:id',
  params: Type.Object({ id: Type.Integer() }),
  response: TeamSchema  // ← Reuse
} as const satisfies RouteContract;

export const updateTeamContract = {
  method: 'PUT' as const,
  path: '/teams/:id',
  params: Type.Object({ id: Type.Integer() }),
  body: Type.Pick(TeamSchema, ['name', 'slug']),
  response: TeamSchema  // ← Reuse
} as const satisfies RouteContract;
```

> **✅ Success:** Next: Type Safety
>
> Learn how SPFN ensures end-to-end type safety from contracts to frontend.
>
> [Type Safety →](/docs/core-concepts/type-safety)