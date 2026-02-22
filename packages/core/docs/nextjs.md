# Next.js Integration

RPC proxy and type-safe API client for Next.js.

## Setup

### 1. Create RPC Proxy

```typescript
// app/api/rpc/[routeName]/route.ts
import '@spfn/auth/nextjs/api';
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { authRouteMap } from '@spfn/auth';
import { eventRouteMap } from '@spfn/core/event';
import { routeMap } from '@/generated/route-map';

export const { GET, POST } = createRpcProxy({
    routeMap: { ...routeMap, ...authRouteMap, ...eventRouteMap },
});
```

### 2. Create API Client

```typescript
// src/lib/api.ts
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/server.config';

export const api = createApi<AppRouter>();
```

## Usage

### Server Components

```typescript
// app/users/[id]/page.tsx
import { api } from '@/lib/api';

export default async function UserPage({ params }: { params: { id: string } })
{
    const user = await api.getUser.call({
        params: { id: params.id }
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
                    name: formData.get('name') as string
                }
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
            name: formData.get('name') as string
        }
    });

    return user;
}
```

## API Client Methods

```typescript
// Call with params
const user = await api.getUser.call({
    params: { id: '123' }
});

// Call with query
const users = await api.getUsers.call({
    query: { page: 1, limit: 20, search: 'john' }
});

// Call with body
const created = await api.createUser.call({
    body: { email: 'user@example.com', name: 'User' }
});

// Call with multiple inputs
const updated = await api.updateUser.call({
    params: { id: '123' },
    body: { name: 'Updated Name' }
});
```

## Interceptors

### Request Interceptor

```typescript
export const { GET, POST } = createRpcProxy({
    routeMap: { ...routeMap, ...authRouteMap },
    apiUrl: process.env.SPFN_API_URL,
    interceptors: {
        request: async (request, context) => {
            // Add auth header
            const token = cookies().get('token')?.value;
            if (token)
            {
                request.headers.set('Authorization', `Bearer ${token}`);
            }
            return request;
        }
    }
});
```

### Response Interceptor

```typescript
interceptors: {
    response: async (response, context) => {
        // Handle Set-Cookie from API
        const setCookie = response.headers.get('set-cookie');
        if (setCookie)
        {
            cookies().set(parseCookie(setCookie));
        }
        return response;
    }
}
```

## Cookie Handling

The RPC proxy automatically handles HttpOnly cookies:

```typescript
// Server sets cookie
c.header('Set-Cookie', 'session=abc; HttpOnly; Secure');

// Proxy forwards to browser
// Browser stores HttpOnly cookie
// Subsequent requests include cookie automatically
```

## Error Handling

```typescript
try
{
    const user = await api.getUser.call({ params: { id: '123' } });
}
catch (error)
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
```

## Environment Variables

```bash
# API server URL
SPFN_API_URL=http://localhost:8790

# For production
SPFN_API_URL=https://api.example.com

# RPC proxy timeout (AbortController, default: 120s)
# Should be shorter than FETCH_HEADERS_TIMEOUT for meaningful 504 responses
RPC_PROXY_TIMEOUT=120000
```

## Best Practices

```typescript
// 1. Create single api instance
// src/lib/api.ts
export const api = createApi<AppRouter>();

// 2. Use in Server Components for SSR
export default async function Page() {
    const data = await api.getData.call({});  // SSR
    return <div>{data}</div>;
}

// 3. Handle loading states in Client Components
const [loading, setLoading] = useState(false);

// 4. Use Server Actions for mutations
'use server';
export async function createItem(formData: FormData) {
    return api.createItem.call({ body: { ... } });
}

// 5. Type-safe error handling
try {
    await api.getUser.call({ params: { id } });
} catch (e) {
    if (e.status === 404) redirect('/not-found');
}
```
