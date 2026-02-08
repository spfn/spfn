---
title: "Next.js Integration"
description: "RPC proxy and type-safe API client for Next.js applications"
order: 8
available: true
---

# Next.js Integration

SPFN provides a type-safe RPC proxy and API client for Next.js. Your Next.js app communicates with the SPFN backend through a proxy route, and the generated client gives you full type inference from your route definitions.

## Setup

### 1. Create RPC Proxy

Create a catch-all API route that proxies requests to your SPFN backend:

```typescript
// app/api/rpc/[routeName]/route.ts
import { appRouter } from '@/server/server.config';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST, PUT, PATCH, DELETE } = createRpcProxy({
    router: appRouter,
    apiUrl: process.env.SPFN_API_URL || 'http://localhost:8790',
});
```

### 2. Create API Client

```typescript
// src/lib/api.ts
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/server.config';

export const api = createApi<AppRouter>();
```

> The API client is generated automatically by [codegen](/docs/api-reference/codegen). Run `pnpm spfn codegen run` or use `pnpm spfn:dev` for watch mode.

## Usage

### Server Components

```typescript
// app/users/[id]/page.tsx
import { api } from '@/lib/api';

export default async function UserPage({ params }: { params: { id: string } })
{
    const user = await api.getUser.call({
        params: { id: params.id },
    });

    return <div>{user.name}</div>;
}
```

### Client Components

```typescript
'use client';

import { api } from '@/lib/api';
import { useState } from 'react';

export function CreateUserForm()
{
    const [loading, setLoading] = useState(false);

    async function handleSubmit(formData: FormData)
    {
        setLoading(true);
        try
        {
            await api.createUser.call({
                body: {
                    email: formData.get('email') as string,
                    name: formData.get('name') as string,
                },
            });
        }
        finally
        {
            setLoading(false);
        }
    }

    return (
        <form action={handleSubmit}>
            {/* ... */}
        </form>
    );
}
```

### Server Actions

```typescript
// app/actions.ts
'use server';

import { api } from '@/lib/api';

export async function createUser(formData: FormData)
{
    const user = await api.createUser.call({
        body: {
            email: formData.get('email') as string,
            name: formData.get('name') as string,
        },
    });

    return user;
}
```

## API Client Methods

The client provides type-safe access to all registered routes:

```typescript
// Call with params
const user = await api.getUser.call({
    params: { id: '123' },
});

// Call with query
const users = await api.getUsers.call({
    query: { page: 1, limit: 20, search: 'john' },
});

// Call with body
const created = await api.createUser.call({
    body: { email: 'user@example.com', name: 'User' },
});

// Call with multiple inputs
const updated = await api.updateUser.call({
    params: { id: '123' },
    body: { name: 'Updated Name' },
});

// File upload via formData
const result = await api.uploadAvatar.call({
    params: { id: '123' },
    formData: {
        file: fileInput.files[0],
        description: 'Profile photo',
    },
});
```

## Interceptors

Interceptors let you modify requests and responses as they pass through the RPC proxy.

### Request Interceptor

Add headers, inject auth tokens, or transform requests:

```typescript
export const { GET, POST } = createRpcProxy({
    router: appRouter,
    apiUrl: process.env.SPFN_API_URL,
    interceptors: {
        request: async (request, context) =>
        {
            // Add auth header from cookie
            const token = cookies().get('token')?.value;
            if (token)
            {
                request.headers.set('Authorization', `Bearer ${token}`);
            }
            return request;
        },
    },
});
```

### Response Interceptor

Handle Set-Cookie headers, transform responses, or add logging:

```typescript
interceptors: {
    response: async (response, context) =>
    {
        // Forward Set-Cookie from API to browser
        const setCookie = response.headers.get('set-cookie');
        if (setCookie)
        {
            cookies().set(parseCookie(setCookie));
        }
        return response;
    },
}
```

## Cookie Handling

The RPC proxy automatically forwards HttpOnly cookies between the browser and your SPFN backend:

```typescript
// SPFN backend sets cookie
c.header('Set-Cookie', 'session=abc; HttpOnly; Secure');

// Proxy forwards to browser
// Browser stores HttpOnly cookie
// Subsequent requests include cookie automatically
```

## Error Handling

```typescript
import { ApiError } from '@spfn/core/nextjs';

try
{
    const user = await api.getUser.call({ params: { id: '123' } });
}
catch (error)
{
    if (error instanceof ApiError)
    {
        if (error.status === 404)
        {
            // Not found
        }
        else if (error.status === 401)
        {
            // Unauthorized
        }
    }
}
```

## Environment Variables

```bash
# SPFN API server URL (server-side only)
SPFN_API_URL=http://localhost:8790

# For production
SPFN_API_URL=https://api.example.com
```

## Import Paths

| Path | Environment | Exports |
|------|-------------|---------|
| `@spfn/core/nextjs` | Client + Server | `createApi`, `ApiError` |
| `@spfn/core/nextjs/server` | Server only | `createRpcProxy`, interceptor utilities |

> `@spfn/core/nextjs/server` uses `next/headers` and must not be imported in Client Components.

## Best Practices

```typescript
// 1. Single api instance per app
// src/lib/api.ts
export const api = createApi<AppRouter>();

// 2. Use Server Components for data fetching (SSR)
export default async function Page()
{
    const data = await api.getData.call({});
    return <div>{data}</div>;
}

// 3. Use Server Actions for mutations
'use server';
export async function createItem(formData: FormData)
{
    return api.createItem.call({ body: { /* ... */ } });
}

// 4. Handle loading states in Client Components
const [loading, setLoading] = useState(false);
```

## Related

- [Codegen](/docs/api-reference/codegen) - Generate the API client
- [Route Definition](/docs/core-concepts/contracts) - Define routes for the client
- [File Upload](/docs/guides/file-upload) - Upload files through the RPC proxy
