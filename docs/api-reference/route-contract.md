---
title: "RouteContract"
description: "Complete API reference for RouteContract types and utilities"
order: 1
available: true
---

# RouteContract

RouteContract is the core type that defines type-safe API endpoints in Superfunction using TypeBox schemas.

## RouteContract Type

Defines the complete shape of a route endpoint including method, path, and schemas.

```typescript
type RouteContract = {
  method: HttpMethod;
  path: string;
  params?: TSchema;
  query?: TSchema;
  body?: TSchema;
  response: TSchema;
  meta?: RouteMeta;
};
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `method` | `HttpMethod` | HTTP method: GET, POST, PUT, PATCH, DELETE |
| `path` | `string` | Route path with optional parameters (e.g., /users/:id) |
| `params` | `TSchema?` | TypeBox schema for path parameters |
| `query` | `TSchema?` | TypeBox schema for query parameters |
| `body` | `TSchema?` | TypeBox schema for request body |
| `response` | `TSchema` | TypeBox schema for response body |
| `meta` | `RouteMeta?` | Metadata for route configuration |

### Example

```typescript
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core';

export const getUserContract = {
  method: 'GET',
  path: '/users/:id',
  params: Type.Object({
    id: Type.Number(),
  }),
  response: Type.Object({
    id: Type.Number(),
    email: Type.String({ format: 'email' }),
    name: Type.String(),
    createdAt: Type.String({ format: 'date-time' }),
  }),
} satisfies RouteContract;
```

## InferContract

Utility type that extracts TypeScript types from a RouteContract.

```typescript
type InferContract<TContract extends RouteContract> = {
  params: TContract['params'] extends TSchema
    ? Static<TContract['params']>
    : Record<string, never>;
  query: TContract['query'] extends TSchema
    ? Static<TContract['query']>
    : Record<string, never>;
  body: TContract['body'] extends TSchema
    ? Static<TContract['body']>
    : Record<string, never>;
  response: TContract['response'] extends TSchema
    ? Static<TContract['response']>
    : unknown;
};
```

### Usage

```typescript
import type { InferContract } from '@spfn/core';
import { getUserContract } from './contracts';

// Extract types from contract
type GetUserParams = InferContract<typeof getUserContract>['params'];
// { id: number }

type GetUserResponse = InferContract<typeof getUserContract>['response'];
// { id: number; email: string; name: string; createdAt: string; }

// Use in handler
export const handler = async (c: RouteContext<typeof getUserContract>) => {
  const { id } = c.params; // Type: number
  // ... fetch user
  return c.json({ id, email, name, createdAt }); // Fully typed!
};
```

## HttpMethod

Supported HTTP methods for route contracts.

```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Type guard
function isHttpMethod(value: unknown): value is HttpMethod {
  return (
    typeof value === 'string' &&
    ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(value)
  );
}
```

## RouteMeta

Optional metadata for route configuration and documentation.

```typescript
type RouteMeta = {
  public?: boolean;           // Skip authentication
  skipMiddlewares?: string[]; // Skip specific middlewares
  tags?: string[];           // Tags for grouping/filtering
  description?: string;      // Route description
  deprecated?: boolean;      // Mark as deprecated
};
```

### Example with Meta

```typescript
export const createUserContract = {
  method: 'POST',
  path: '/users',
  body: Type.Object({
    email: Type.String({ format: 'email' }),
    name: Type.String(),
    password: Type.String({ minLength: 8 }),
  }),
  response: Type.Object({
    id: Type.Number(),
    email: Type.String(),
    name: Type.String(),
  }),
  meta: {
    public: true,          // No authentication required
    tags: ['users', 'auth'],
    description: 'Create a new user account',
  },
} satisfies RouteContract;
```

## Common Patterns

### List Endpoint with Pagination

```typescript
export const getUsersContract = {
  method: 'GET',
  path: '/users',
  query: Type.Object({
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Number({ minimum: 0 })),
    search: Type.Optional(Type.String()),
  }),
  response: Type.Object({
    items: Type.Array(Type.Object({
      id: Type.Number(),
      email: Type.String(),
      name: Type.String(),
    })),
    total: Type.Number(),
    limit: Type.Number(),
    offset: Type.Number(),
  }),
} satisfies RouteContract;
```

### Update Endpoint

```typescript
export const updateUserContract = {
  method: 'PUT',
  path: '/users/:id',
  params: Type.Object({
    id: Type.Number(),
  }),
  body: Type.Object({
    email: Type.Optional(Type.String({ format: 'email' })),
    name: Type.Optional(Type.String()),
  }),
  response: Type.Object({
    id: Type.Number(),
    email: Type.String(),
    name: Type.String(),
    updatedAt: Type.String({ format: 'date-time' }),
  }),
} satisfies RouteContract;
```

### Delete Endpoint

```typescript
export const deleteUserContract = {
  method: 'DELETE',
  path: '/users/:id',
  params: Type.Object({
    id: Type.Number(),
  }),
  response: Type.Object({
    success: Type.Boolean(),
    message: Type.String(),
  }),
} satisfies RouteContract;
```

## Type Safety Benefits

> **Note:** End-to-End Type Safety
> - **Runtime validation**: TypeBox validates requests automatically
> - **Compile-time types**: InferContract provides TypeScript types
> - **Client generation**: Auto-generated type-safe client
> - **Documentation**: Schemas serve as living documentation

## Best Practices

### 1. Export Contracts Separately

```typescript
// ✅ Good: Separate contract file
// src/lib/contracts/users.ts
export const getUserContract: RouteContract = { /* ... */ };
export const createUserContract: RouteContract = { /* ... */ };

// src/server/routes/users.ts
import { getUserContract } from '@/lib/contracts/users';
export { getUserContract };
export const handler = (c) => { /* ... */ };
```

### 2. Reuse Schema Definitions

```typescript
// Shared schemas
const UserSchema = Type.Object({
  id: Type.Number(),
  email: Type.String({ format: 'email' }),
  name: Type.String(),
});

export const getUserContract: RouteContract = {
  method: 'GET',
  path: '/users/:id',
  params: Type.Object({ id: Type.Number() }),
  response: UserSchema, // Reuse!
};

export const getUsersContract: RouteContract = {
  method: 'GET',
  path: '/users',
  response: Type.Object({
    items: Type.Array(UserSchema), // Reuse!
    total: Type.Number(),
  }),
};
```

### 3. Use Descriptive Paths

```typescript
// ✅ Good: Clear resource hierarchy
'/users/:userId/posts/:postId'
'/organizations/:orgId/members'

// ❌ Bad: Ambiguous paths
'/get-user/:id'
'/user_posts'
```

> **✅ Success:** Next: App (Server)
>
> Learn about server configuration and application setup.
>
> [App (Server) →](/docs/api-reference/app)