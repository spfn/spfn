---
title: "Client Generation"
description: "Learn how to use the type-safe RPC-style API client"
order: 5
available: true
---

# Client Generation

Superfunction provides a fully type-safe RPC-style API client that infers types directly from your router definition—no code generation required.

## Type-Safe Client

The client is created from your router type, providing full end-to-end type safety:

```typescript
// src/server/router.ts
import { route, defineRouter } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return { id: params.id, name: 'John Doe' };
    });

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
        return { id: '1', ...body };
    });

export const appRouter = defineRouter({
    getUser,
    createUser,
});

export type AppRouter = typeof appRouter;
```

```typescript
// src/lib/api.ts
import { createApi } from '@spfn/core/client';
import type { AppRouter } from '@/server/router';

export const api = createApi<AppRouter>();
```

> **No Code Generation Required**
>
> Unlike contract-based approaches, the RPC client:
>
> - Infers types directly from router definition
> - No `spfn codegen` step needed
> - Types update instantly when routes change
> - Zero runtime overhead for type resolution

## Client Structure

The generated client provides a simple RPC-style API:

```typescript
import { api } from '@/lib/api';

// GET requests (no body) - params, query, headers
await api.getUser.call({ params: { id: '123' } });
await api.getUsers.call({ query: { page: 1, limit: 10 } });

// POST/PUT/DELETE requests - body, params, etc.
await api.createUser.call({ body: { name: 'John', email: 'john@example.com' } });
await api.updateUser.call({ params: { id: '123' }, body: { name: 'Jane' } });
await api.deleteUser.call({ params: { id: '123' } });
```

## Using the Client

### Server Components (Recommended)

Use the client directly in Next.js Server Components:

```typescript
// app/users/[id]/page.tsx (Server Component)
import { api } from '@/lib/api';

export default async function UserPage({ params }: { params: { id: string } })
{
    // Direct API call - no useState, no useEffect
    const user = await api.getUser.call({
        params: { id: params.id }
    });

    return (
        <div>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
        </div>
    );
}
```

### Client Components

Use with React hooks for interactive features:

```typescript
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

export function CreateUserForm()
{
    const [formData, setFormData] = useState({
        name: '',
        email: ''
    });
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) =>
    {
        e.preventDefault();
        setLoading(true);

        try
        {
            const user = await api.createUser.call({ body: formData });
            console.log('Created user:', user.id);
        }
        catch (error)
        {
            console.error('Failed to create user:', error);
        }
        finally
        {
            setLoading(false);
        }
    };

    return <form onSubmit={handleSubmit}>{/* ... */}</form>;
}
```

## API Method Patterns

### GET Requests

```typescript
// GET /users/:id - path params only
const user = await api.getUser.call({
    params: { id: '123' }
});

// GET /users - query params only
const users = await api.getUsers.call({
    query: { page: 1, limit: 20, published: true }
});

// GET /users/:id/posts - both params and query
const posts = await api.getUserPosts.call({
    params: { userId: '123' },
    query: { status: 'published' }
});

// GET request without any input
const health = await api.healthCheck.call({});
```

### POST Requests

```typescript
// POST /users - body only
const user = await api.createUser.call({
    body: {
        name: 'Engineering',
        email: 'eng@example.com'
    }
});

// POST /teams/:id/members - params + body
const member = await api.addTeamMember.call({
    params: { teamId: '123' },
    body: { userId: '456', role: 'member' }
});
```

### PUT/PATCH Requests

```typescript
// PUT /users/:id - params + body
const user = await api.updateUser.call({
    params: { id: '123' },
    body: {
        name: 'Updated Name',
        email: 'new@example.com'
    }
});
```

### DELETE Requests

```typescript
// DELETE /users/:id - params only
const result = await api.deleteUser.call({
    params: { id: '123' }
});
```

## Request Options

### Adding Headers

```typescript
const user = await api.getUser
    .headers({ 'X-Custom-Header': 'value' })
    .call({ params: { id: '123' } });
```

### Adding Cookies

```typescript
const user = await api.getUser
    .cookies({ session: 'abc123' })
    .call({ params: { id: '123' } });
```

### Fetch Options (Next.js)

```typescript
// With Next.js caching options
const user = await api.getUser
    .fetchOptions({ next: { revalidate: 60 } })
    .call({ params: { id: '123' } });

// Disable caching
const freshUser = await api.getUser
    .fetchOptions({ cache: 'no-store' })
    .call({ params: { id: '123' } });
```

### Chaining Options

```typescript
const user = await api.getUser
    .headers({ 'X-Request-ID': 'req-123' })
    .cookies({ session: 'abc' })
    .fetchOptions({ next: { revalidate: 60 } })
    .call({ params: { id: '123' } });
```

## Client Configuration

### Creating the Client

```typescript
// src/lib/api.ts
import { createApi } from '@spfn/core/client';
import type { AppRouter } from '@/server/router';

export const api = createApi<AppRouter>({
    // Base URL for RPC endpoints (default: '/api/rpc')
    baseUrl: '/api/rpc',

    // Default headers for all requests
    headers: {
        'X-App-Version': '1.0.0'
    },

    // Request timeout in milliseconds (default: 30000)
    timeout: 30000,

    // Enable debug logging
    debug: process.env.NODE_ENV === 'development',
});
```

### Request/Response Interceptors

```typescript
export const api = createApi<AppRouter>({
    // Intercept all requests
    onRequest: async (url, init) =>
    {
        // Add auth token
        const token = await getAuthToken();
        if (token)
        {
            init.headers = {
                ...init.headers,
                Authorization: `Bearer ${token}`
            };
        }
        return init;
    },

    // Intercept all responses
    onResponse: async (response, body) =>
    {
        // Log all responses
        console.log(`${response.status}: ${response.url}`);
        return { response, body };
    },
});
```

## Error Handling

The client throws `ApiError` for non-2xx responses:

```typescript
import { ApiError } from '@spfn/core/client';

try
{
    const user = await api.createUser.call({
        body: { name: 'John', email: 'invalid' }
    });
}
catch (error)
{
    if (error instanceof ApiError)
    {
        console.error('Status:', error.status);      // 400
        console.error('Message:', error.message);    // "Validation failed"
        console.error('Details:', error.data);       // { field: 'email', ... }

        // Handle specific error types
        switch (error.status)
        {
            case 400:
                console.error('Validation error');
                break;
            case 401:
                console.error('Unauthorized');
                break;
            case 404:
                console.error('Not found');
                break;
            default:
                console.error('Server error');
        }
    }
}
```

### Custom Error Classes

Register custom error classes to receive typed errors:

```typescript
import { NotFoundError, ValidationError } from '@spfn/core/errors';

export const api = createApi<AppRouter>({
    errorRegistry: {
        NotFoundError,
        ValidationError,
    },
});

// Now errors are typed correctly
try
{
    await api.getUser.call({ params: { id: 'invalid' } });
}
catch (error)
{
    if (error instanceof NotFoundError)
    {
        console.error('User not found:', error.resource);
    }
}
```

## Best Practices

### 1. Create a Single API Instance

```typescript
// src/lib/api.ts
import { createApi } from '@spfn/core/client';
import type { AppRouter } from '@/server/router';

// Single instance for the entire app
export const api = createApi<AppRouter>({
    debug: process.env.NODE_ENV === 'development',
});
```

### 2. Use Server Components When Possible

```typescript
// ✅ Good: Server Component - no client JS
export default async function UsersPage()
{
    const users = await api.getUsers.call({ query: { page: 1 } });
    return <UserList users={users} />;
}

// ⚠️ Avoid: Client-side fetching when not needed
'use client';
export default function UsersPage()
{
    const [users, setUsers] = useState([]);
    useEffect(() => { /* fetch... */ }, []);
    return <UserList users={users} />;
}
```

### 3. Type the Response

```typescript
// Types are automatically inferred
const user = await api.getUser.call({ params: { id: '1' } });
//    ^? { id: string; name: string; email: string }

// Use in components with full type safety
function UserCard({ userId }: { userId: string })
{
    const [user, setUser] = useState<Awaited<ReturnType<typeof api.getUser.call>>>();
    // ...
}
```

### 4. Handle Errors Consistently

```typescript
// Create a wrapper for consistent error handling
export async function safeApiCall<T>(
    fn: () => Promise<T>,
    fallback: T
): Promise<T>
{
    try
    {
        return await fn();
    }
    catch (error)
    {
        console.error('API call failed:', error);
        return fallback;
    }
}

// Usage
const users = await safeApiCall(
    () => api.getUsers.call({ query: { page: 1 } }),
    { items: [], total: 0 }
);
```

> **Next: Middleware**
>
> Learn how to create and manage middleware for authentication, logging, and more.
>
> [Middleware →](/docs/core-concepts/middleware)