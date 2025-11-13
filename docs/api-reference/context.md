---
title: "Context"
description: "Complete API reference for RouteContext and request handling"
order: 3
available: true
---

# Context

RouteContext provides type-safe access to request data, validated against your contract schemas.

## RouteContext Type

Generic context type with contract-based type inference.

```typescript
type RouteContext<TContract extends RouteContract = any> = {
  params: InferContract<TContract>['params'];
  query: InferContract<TContract>['query'];
  data(): Promise<InferContract<TContract>['body']>;
  json(
    data: InferContract<TContract>['response'],
    status?: ContentfulStatusCode,
    headers?: HeaderRecord
  ): Response;
  success<T>(
    data: T,
    meta?: ApiSuccessResponse<T>['meta'],
    status?: number
  ): Response;
  paginated<T>(
    data: T[],
    page: number,
    limit: number,
    total: number
  ): Response;
  noContent(): Response;
  created<T>(data: T, location?: string): Response;
  accepted<T>(data?: T): Response;
  notModified(): Response;
  raw: Context; // Hono Context
};
```

> **⚠️ Warning:** Important: Type Safety
>
> RouteContext provides type-safe access to validated request data. All params, query, and body are automatically validated against your contract schemas before reaching your handler.

## Context Properties

### c.params

Type-safe access to URL path parameters.

```typescript
// Contract
export const getUserContract: RouteContract = {
  method: 'GET',
  path: '/users/:id',
  params: Type.Object({
    id: Type.Number(),
  }),
  response: UserSchema,
};

// Handler
export const handler = async (c: RouteContext<typeof getUserContract>) => {
  const { id } = c.params; // Type: number

  const user = await findOne(users, { id });
  return c.json(user);
};
```

### c.query

Type-safe access to query parameters.

```typescript
// Contract
export const getUsersContract: RouteContract = {
  method: 'GET',
  path: '/users',
  query: Type.Object({
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Number({ minimum: 0 })),
    search: Type.Optional(Type.String()),
  }),
  response: PaginatedUsersSchema,
};

// Handler
export const handler = async (c: RouteContext<typeof getUsersContract>) => {
  const { limit = 10, offset = 0, search } = c.query;
  // Type: { limit?: number; offset?: number; search?: string; }

  const users = await findMany(users, {
    where: search ? { name: { like: `%${search}%` } } : undefined,
    limit,
    offset,
  });

  return c.json({ items: users, total: users.length, limit, offset });
};
```

### c.data()

Type-safe access to request body (async).

```typescript
// Contract
export const createUserContract: RouteContract = {
  method: 'POST',
  path: '/users',
  body: Type.Object({
    email: Type.String({ format: 'email' }),
    name: Type.String(),
    password: Type.String({ minLength: 8 }),
  }),
  response: UserSchema,
};

// Handler
export const handler = async (c: RouteContext<typeof createUserContract>) => {
  const body = await c.data();
  // Type: { email: string; name: string; password: string; }

  const hashedPassword = await hashPassword(body.password);

  const user = await create(users, {
    email: body.email,
    name: body.name,
    password: hashedPassword,
  });

  return c.json(user, 201);
};
```

### c.json()

Type-safe JSON response with status and headers.

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

## Response Helpers

SPFN provides convenient response helpers for common HTTP patterns with standardized formats.

### c.success()

Return successful response with standard format (200 OK).

```typescript
// Basic success
return c.success({ id: 1, name: 'John' });
// Response: { success: true, data: { id: 1, name: 'John' } }

// With metadata
return c.success(
  { id: 1, name: 'John' },
  { timestamp: Date.now() }
);
// Response: { success: true, data: {...}, meta: { timestamp: ... } }

// With custom status
return c.success({ message: 'Updated' }, undefined, 200);
```

### c.paginated()

Return paginated list with pagination metadata (200 OK).

```typescript
export const handler = async (c: RouteContext<typeof getUsersContract>) => {
  const { page = 1, limit = 10 } = c.query;

  const users = await findMany(users, {
    limit,
    offset: (page - 1) * limit
  });
  const total = await count(users);

  return c.paginated(users, page, limit, total);
};

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

### c.created()

Return created resource with Location header (201 Created).

```typescript
export const handler = async (c: RouteContext<typeof createUserContract>) => {
  const body = await c.data();
  const user = await create(users, body);

  // With Location header
  return c.created(user, `/users/${user.id}`);
};

// Response: 201 Created
// Headers: Location: /users/123
// Body: { success: true, data: { id: 123, ... } }
```

### c.noContent()

Return empty response for successful DELETE operations (204 No Content).

```typescript
export const handler = async (c: RouteContext<typeof deleteUserContract>) => {
  const { id } = c.params;
  await deleteOne(users, { id });

  return c.noContent();
};

// Response: 204 No Content (no body)
```

### c.accepted()

Return accepted response for async operations (202 Accepted).

```typescript
// With job data
export const handler = async (c: RouteContext<typeof processJobContract>) => {
  const body = await c.data();
  const job = await queueJob(body);

  return c.accepted({ jobId: job.id, status: 'queued' });
};
// Response: 202 Accepted
// Body: { success: true, data: { jobId: '...', status: 'queued' } }

// Without data (fire-and-forget)
return c.accepted();
// Response: 202 Accepted (no body)
```

### c.notModified()

Return not modified response for cache validation (304 Not Modified).

```typescript
export const handler = async (c: RouteContext<typeof getUserContract>) => {
  const { id } = c.params;
  const etag = c.raw.req.header('If-None-Match');

  const user = await findOne(users, { id });
  const currentEtag = generateEtag(user);

  if (etag === currentEtag) {
    return c.notModified();
  }

  c.raw.header('ETag', currentEtag);
  return c.success(user);
};

// Response: 304 Not Modified (no body)
```

### c.raw

Access to underlying Hono Context for advanced use cases.

```typescript
export const handler = async (c: RouteContext<typeof contract>) => {
  // Access raw Hono context
  const honoContext = c.raw;

  // Get request headers
  const auth = honoContext.req.header('Authorization');

  // Set response headers
  honoContext.header('X-Request-ID', requestId);

  // Access middleware-set values
  const user = honoContext.get('user');

  // Use Hono utilities
  const ip = honoContext.req.header('x-forwarded-for');

  return c.json({ success: true });
};
```

> **⚠️ Warning:** Important: Middleware Context
>
> Middleware receives raw Hono Context, not RouteContext. You cannot access `c.data()`, `c.params`, or `c.query` with contract types in middleware.
>
> To pass data from middleware to handlers, use `c.set()` in middleware and `c.raw.get()` in handlers.

## Common Patterns

### Destructuring Request Data

```typescript
export const handler = async (c: RouteContext<typeof updateUserContract>) => {
  // Destructure params and body
  const { id } = c.params;
  const body = await c.data();

  const user = await update(users, { id }, body);
  return c.json(user);
};
```

### Accessing Middleware Data

```typescript
// Middleware sets user
app.use('*', async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  const user = await verifyToken(token);
  c.set('user', user); // Set in Hono context
  await next();
});

// Handler accesses user
export const handler = async (c: RouteContext<typeof contract>) => {
  // Access via c.raw.get()
  const user = c.raw.get('user');

  return c.json({ userId: user.id });
};
```

### Custom Response Headers

```typescript
export const handler = async (c: RouteContext<typeof getUsersContract>) => {
  const { limit, offset } = c.query;
  const users = await findMany(users, { limit, offset });
  const total = await count(users);

  // Add pagination headers
  return c.json(
    { items: users, total },
    200,
    {
      'X-Total-Count': String(total),
      'X-Page-Size': String(limit),
      'X-Page-Offset': String(offset),
    }
  );
};
```

### Error Responses

```typescript
import { NotFoundError, ValidationError } from '@spfn/core';

export const handler = async (c: RouteContext<typeof getUserContract>) => {
  const { id } = c.params;

  const user = await findOne(users, { id });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return c.json(user);
};
```

## Transaction Context

Access database transactions via AsyncLocalStorage.

```typescript
import { Transactional, getTransaction } from '@spfn/core';

export const contract: RouteContract = {
  method: 'POST',
  path: '/orders',
  body: OrderCreateSchema,
  response: OrderSchema,
};

export const middleware = [Transactional()];

export const handler = async (c: RouteContext<typeof contract>) => {
  const body = await c.data();

  // Get transaction from context
  const tx = getTransaction();

  // All operations use same transaction
  const order = await create(orders, body, { tx });
  await create(orderItems, { orderId: order.id, ...body.items }, { tx });

  return c.json(order);
};
```

## Type Inference Examples

### Extract Types from Contract

```typescript
import type { InferContract } from '@spfn/core';

// Extract specific types
type CreateUserBody = InferContract<typeof createUserContract>['body'];
type UserResponse = InferContract<typeof getUserContract>['response'];

// Use in functions
async function validateUserData(data: CreateUserBody) {
  // data is fully typed
  console.log(data.email, data.name, data.password);
}

// Use in state (frontend)
const [user, setUser] = useState<UserResponse | null>(null);
```

### Generic Handler Helper

```typescript
import type { RouteContext, RouteContract } from '@spfn/core';

// Generic handler wrapper
export function createHandler<TContract extends RouteContract>(
  handler: (c: RouteContext<TContract>) => Promise<Response>
) {
  return handler;
}

// Usage
export const handler = createHandler<typeof getUserContract>(
  async (c) => {
    const { id } = c.params; // Fully typed!
    // ...
    return c.json(user);
  }
);
```

## Best Practices

### 1. Always Type Your Context

```typescript
// ✅ Good: Typed context
export const handler = async (c: RouteContext<typeof contract>) => {
  const { id } = c.params; // Type-safe!
};

// ❌ Bad: Untyped context
export const handler = async (c: any) => {
  const { id } = c.params; // No type safety
};
```

### 2. Use c.data() for Body Access

```typescript
// ✅ Good: Use c.data()
const body = await c.data();

// ❌ Bad: Access raw request
const body = await c.raw.req.json();
```

### 3. Return with c.json()

```typescript
// ✅ Good: Use c.json()
return c.json({ success: true });

// ❌ Bad: Manual Response
return new Response(JSON.stringify({ success: true }), {
  headers: { 'Content-Type': 'application/json' },
});
```

### 4. Use c.raw Only When Necessary

```typescript
// ✅ Good: Use c.raw for Hono-specific features
const requestId = c.raw.get('requestId');
const ip = c.raw.req.header('x-forwarded-for');

// ✅ Good: Use c.params/query/data() for request data
const { id } = c.params;
const { search } = c.query;
const body = await c.data();
```

> **Note:** Type Safety Benefits
> - **Compile-time checks**: TypeScript catches type errors before runtime
> - **IntelliSense**: Full autocomplete for params, query, and body
> - **Refactoring safety**: Changes to contracts propagate automatically
> - **Runtime validation**: TypeBox validates all input data

> **✅ Success:** Next: Decorators (Middleware)
>
> Learn about built-in middleware decorators and how to create custom ones.
>
> [Decorators →](/docs/api-reference/decorators)