# @spfn/core/nextjs - Technical Documentation

Type-safe Next.js client system with tRPC-style API for define-route integration.

## Architecture Overview

The Next.js client system provides end-to-end type safety from server-side route definitions to client-side API calls through a 3-tier architecture:

```
+---------------------------------------------------------------+
|                         Client Tier                           |
|  +---------------------------------------------------------+  |
|  |  ApiClient (Browser / React Server Component)           |  |
|  |  - Type-safe API calls with structured input            |  |
|  |  - Request/Response interceptors                        |  |
|  |  - Next.js caching integration                          |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
                              |
                              | fetch('/api/actions/users/123')
                              v
+---------------------------------------------------------------+
|                       Proxy Tier (Edge)                       |
|  +---------------------------------------------------------+  |
|  |  TypedProxy (Next.js API Route)                         |  |
|  |  - Request forwarding to SPFN backend                   |  |
|  |  - Interceptor system (path matching, cookies)          |  |
|  |  - Auto-discovery from registry                         |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
                              |
                              | fetch('http://spfn:8790/users/123')
                              v
+---------------------------------------------------------------+
|                       Backend Tier                            |
|  +---------------------------------------------------------+  |
|  |  SPFN Server (define-route system)                      |  |
|  |  - Route handlers with validation                       |  |
|  |  - Database operations                                  |  |
|  |  - Business logic                                       |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
```

### Core Components

```
nextjs/
├── index.ts                    # Client-safe exports only
├── server.ts                   # Server-only exports (next/headers)
├── client/
│   ├── index.ts
│   ├── core.ts                 # createApi implementation
│   ├── builder.ts              # RouteCallBuilder (Structured Input)
│   ├── types.ts                # Client types
│   ├── helpers.ts              # URL building, request helpers
│   ├── errors.ts               # ApiError class
│   └── debug-logs.ts           # Debug logging utilities
└── proxy/
    ├── index.ts                # Default proxy exports
    ├── core.ts                 # createTypedProxy implementation
    ├── types.ts                # Proxy types
    ├── helpers.ts              # Proxy helpers
    └── interceptors/
        ├── index.ts
        ├── registry.ts         # Global interceptor registry
        ├── helpers.ts          # Path matching, execution
        └── types.ts            # Interceptor types
```

### Design Principles

1. **Structured Input**: Input matches server-side route definition exactly
2. **Zero-Config Default**: Works out of the box with sensible defaults
3. **Next.js Native**: Deep integration with App Router, caching, cookies
4. **Type Safety First**: End-to-end type inference from server to client
5. **Client/Server Separation**: Clear import paths for client vs server code

---

## Import Paths

### Client-Safe Imports

Use `@spfn/core/nextjs` for code that runs in both client and server:

```typescript
import { createApi, ApiError } from '@spfn/core/nextjs';

import type {
    Client,
    RouteClient,
    ApiConfig,
    CallOptions,
    InferRouteInput,
    InferRouteOutput,
    RequestInterceptor,
    ResponseInterceptor,
} from '@spfn/core/nextjs';
```

### Server-Only Imports

Use `@spfn/core/nextjs/server` for code that uses `next/headers`:

```typescript
// API Route handlers
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs/server';

// Custom proxy configuration
import { createTypedProxy } from '@spfn/core/nextjs/server';

// Interceptor system
import {
    registerInterceptors,
    interceptorRegistry,
    matchPath,
    filterMatchingInterceptors,
} from '@spfn/core/nextjs/server';

import type {
    TypedProxyConfig,
    RequestInterceptorContext,
    ResponseInterceptorContext,
    InterceptorRule,
} from '@spfn/core/nextjs/server';
```

---

## ApiClient (Structured Input API)

### Creating a Client

The client requires **metadata** to avoid bundling server code:

```typescript
// server/router.ts
import { defineRouter, route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const { router: appRouter, metadata: appMetadata } = defineRouter({
    getUser: route.get('/users/:id')
        .input({ params: Type.Object({ id: Type.String() }) })
        .handler(async (c) => c.success({ id: '1', name: 'John' })),

    createUser: route.post('/users')
        .input({ body: Type.Object({ name: Type.String() }) })
        .handler(async (c) => c.success({ id: '2', name: c.input.body.name })),

    updateUser: route.put('/users/:id')
        .input({
            params: Type.Object({ id: Type.String() }),
            body: Type.Object({ name: Type.String() })
        })
        .handler(async (c) => c.success({ id: c.input.params.id, name: c.input.body.name })),
});

export type AppRouter = typeof appRouter;
```

```typescript
// lib/api.ts
import { createApi } from '@spfn/core/nextjs';
import { appMetadata } from '@/server/router';
import type { AppRouter } from '@/server/router';

export const api = createApi<AppRouter>({
    baseUrl: '/api/actions',
    metadata: appMetadata,  // Required!
});
```

### Structured Input Pattern

Input structure matches the server-side route definition exactly:

```typescript
// GET /users/:id - params only
const user = await api.getUser.call({ params: { id: '123' } });

// GET /users/:id?include=posts - params + query
const user = await api.getUser.call({
    params: { id: '123' },
    query: { include: 'posts' }
});

// POST /users - body only
const newUser = await api.createUser.call({
    body: { name: 'John', email: 'john@example.com' }
});

// PUT /users/:id - params + body
const updatedUser = await api.updateUser.call({
    params: { id: '123' },
    body: { name: 'Jane' }
});
```

### Options via Method Chaining

Options (headers, cookies, fetchOptions) use method chaining:

```typescript
const user = await api.getUser
    .headers({ 'X-Custom': 'value' })
    .cookies({ session: 'xxx' })
    .fetchOptions({ next: { revalidate: 60 } })
    .onRequest((url, init) => {
        console.log('→', url);
        return init;
    })
    .onResponse((res, body) => {
        console.log('←', body);
        return { response: res, body };
    })
    .call({ params: { id: '123' } });
```

### Client Configuration

```typescript
interface ApiConfig {
    // Base URL for API calls (default: '/api/actions')
    baseUrl?: string;

    // Required: Pre-extracted route metadata from defineRouter()
    metadata: Record<string, RouteMetadata>;

    // Default headers for all requests
    headers?: Record<string, string>;

    // Request timeout in milliseconds (default: 30000)
    timeout?: number;

    // Custom fetch implementation
    fetch?: typeof fetch;

    // Global request interceptor
    onRequest?: RequestInterceptor;

    // Global response interceptor
    onResponse?: ResponseInterceptor;

    // Custom error registry for deserialization
    errorRegistry?: ErrorRegistry;

    // Enable debug logging (default: false)
    debug?: boolean;
}
```

### Per-Call Options

```typescript
interface CallOptions {
    // Additional headers for this request
    headers?: Record<string, string>;

    // Override cookies for this request
    cookies?: Record<string, string>;

    // Request-specific interceptors
    onRequest?: RequestInterceptor;
    onResponse?: ResponseInterceptor;

    // Next.js-specific fetch options
    fetchOptions?: RequestInit & {
        next?: {
            revalidate?: number | false;
            tags?: string[];
        };
    };
}
```

---

## Type System

### Core Types

```typescript
// Structured input (matches server-side route definition)
type StructuredInput<TInput extends RouteInput> = {
    params: TInput['params'] extends TSchema ? Static<TInput['params']> : {};
    query: TInput['query'] extends TSchema ? Static<TInput['query']> : {};
    body: TInput['body'] extends TSchema ? Static<TInput['body']> : {};
    headers: TInput['headers'] extends TSchema ? Static<TInput['headers']> : {};
    cookies: TInput['cookies'] extends TSchema ? Static<TInput['cookies']> : {};
};

// Infer route input type
type InferRouteInput<TRoute> =
    TRoute extends RouteDef<infer TInput, any, any>
        ? StructuredInput<TInput>
        : never;

// Infer route output type
type InferRouteOutput<TRoute> =
    TRoute extends RouteDef<any, any, infer TResponse>
        ? TResponse
        : never;
```

### RouteClient Type

```typescript
type RouteClient<TRoute extends RouteDef<any, any>> = {
    // Method chaining for options
    headers(headers: Record<string, string>): RouteClient<TRoute>;
    cookies(cookies: Record<string, string>): RouteClient<TRoute>;
    fetchOptions(options: RequestInit & NextFetchOptions): RouteClient<TRoute>;
    onRequest(interceptor: RequestInterceptor): RouteClient<TRoute>;
    onResponse(interceptor: ResponseInterceptor): RouteClient<TRoute>;

    // Execute with structured input
    call(input: CleanStructuredInput<InferRouteInput<TRoute>>): Promise<InferRouteOutput<TRoute>>;
};
```

### Client Type

```typescript
type Client<TRouter extends Router<any>> = {
    [K in keyof TRouter['routes']]: TRouter['routes'][K] extends RouteDef<any, any, any>
        ? RouteClient<TRouter['routes'][K]>
        : TRouter['routes'][K] extends Router<any>
            ? Client<TRouter['routes'][K]>
            : never;
};
```

---

## TypedProxy (Next.js API Route)

### Zero-Config Setup

```typescript
// app/api/actions/[...path]/route.ts
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs/server';
```

**Default Behavior:**
- Forwards all requests to `process.env.SPFN_API_URL` (default: `http://localhost:8790`)
- Forwards headers: `content-type`, `authorization`, `cookie`, `user-agent`, `accept`, `accept-language`
- Timeout: 30 seconds
- Debug logging in development mode
- Auto-discovery: Enabled (loads interceptors from registry)

### Custom Configuration

```typescript
// app/api/actions/[...path]/route.ts
import { createTypedProxy } from '@spfn/core/nextjs/server';

const { GET, POST, PUT, PATCH, DELETE } = createTypedProxy({
    apiUrl: process.env.SPFN_API_URL,
    timeout: 60000,
    debug: true,

    headers: {
        'X-API-Key': process.env.SPFN_API_KEY!,
    },

    // Simple interceptors (all requests)
    onRequest: async (req, url) => {
        console.log('->', req.method, url);
        return { url };
    },

    onResponse: async (response, body) => {
        console.log('<-', response.status);
        return { response, body };
    },

    // Advanced interceptors (path matching, cookies)
    interceptors: [
        {
            pathPattern: '/_auth/*',
            method: 'POST',
            response: async (ctx, next) => {
                if (ctx.response.body?.token)
                {
                    ctx.setCookies.push({
                        name: 'session',
                        value: ctx.response.body.token,
                        options: {
                            httpOnly: true,
                            secure: true,
                            sameSite: 'lax',
                            maxAge: 86400,
                        },
                    });
                }
                await next();
            },
        },
    ],

    // Auto-discovery settings
    autoDiscoverInterceptors: true,
    disableAutoInterceptors: ['analytics'],
});

export { GET, POST, PUT, PATCH, DELETE };
```

### Next.js 15 Support

The proxy supports Next.js 15's async params:

```typescript
// Handler signature
async function handleProxy(
    request: NextRequest,
    context: { params: Promise<{ path?: string[] }> }  // Async params
): Promise<NextResponse>
```

---

## Interceptor System

### InterceptorRule Structure

```typescript
interface InterceptorRule {
    // Path pattern to match (supports wildcards)
    pathPattern?: string;

    // HTTP method to match (undefined = all methods)
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    // Request interceptor (before fetch)
    request?: (ctx: RequestInterceptorContext, next: () => Promise<void>) => Promise<void>;

    // Response interceptor (after fetch)
    response?: (ctx: ResponseInterceptorContext, next: () => Promise<void>) => Promise<void>;
}
```

### Request Interceptor Context

```typescript
interface RequestInterceptorContext {
    path: string;                          // Request path: '/users/123'
    method: string;                        // HTTP method: 'GET', 'POST', etc.
    headers: Record<string, string>;       // Mutable headers
    body: any;                             // Mutable request body
    query: Record<string, string>;         // Query parameters
    cookies: Map<string, string>;          // Request cookies
    request: NextRequest;                  // Raw Next.js request
    metadata: Record<string, any>;         // Share data between interceptors
}
```

### Response Interceptor Context

```typescript
interface ResponseInterceptorContext {
    path: string;
    method: string;
    request: {
        headers: Record<string, string>;
        body: any;
    };
    response: {
        status: number;
        statusText: string;
        headers: Headers;
        body: any;                         // Mutable response body
    };
    setCookies: SetCookie[];               // Cookies to set in response
    metadata: Record<string, any>;
}
```

### Package Registration

```typescript
// @spfn/auth/src/adapters/nextjs/index.ts
import { registerInterceptors } from '@spfn/core/nextjs/server';

registerInterceptors('auth', [
    {
        pathPattern: '/_auth/*',
        request: async (ctx, next) => {
            const session = ctx.cookies.get('session');
            if (session)
            {
                ctx.headers['Authorization'] = `Bearer ${session}`;
            }
            await next();
        },
        response: async (ctx, next) => {
            if (ctx.path === '/_auth/login' && ctx.response.body?.token)
            {
                ctx.setCookies.push({
                    name: 'session',
                    value: ctx.response.body.token,
                    options: { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 86400 },
                });
                delete ctx.response.body.token;
            }
            await next();
        },
    },
]);
```

---

## Next.js Integration

### Server Components with Caching

```typescript
// app/users/[id]/page.tsx
import { api } from '@/lib/api';

export default async function UserPage({ params }: { params: Promise<{ id: string }> })
{
    const { id } = await params;

    const user = await api.getUser
        .fetchOptions({ next: { revalidate: 3600 } })
        .call({ params: { id } });

    return <div>{user.name}</div>;
}
```

### Tag-Based Revalidation

```typescript
const posts = await api.getPosts
    .fetchOptions({ next: { tags: ['posts'] } })
    .call({ query: { page: 1 } });

// Later, in a Server Action:
import { revalidateTag } from 'next/cache';
revalidateTag('posts');
```

### Client Components

```typescript
'use client';

import { api } from '@/lib/api';
import { useState } from 'react';

export function CreateUserForm()
{
    const [loading, setLoading] = useState(false);

    async function handleSubmit(data: { name: string; email: string })
    {
        setLoading(true);
        try
        {
            const user = await api.createUser.call({ body: data });
            console.log('Created:', user);
        }
        finally
        {
            setLoading(false);
        }
    }

    return <form onSubmit={...}>...</form>;
}
```

---

## Error Handling

### ApiError Class

```typescript
class ApiError extends Error {
    constructor(
        message: string,
        public statusCode: number,
        public url: string,
        public body?: any,
        public type: 'http' | 'network' | 'timeout' = 'http'
    ) {}
}
```

### Usage

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
        if (error.type === 'timeout')
        {
            console.error('Request timed out');
        }
        else if (error.type === 'network')
        {
            console.error('Network error:', error.message);
        }
        else
        {
            console.error(`HTTP ${error.statusCode}:`, error.body);
        }
    }
}
```

---

## Performance Considerations

### Type Inference

- Type inference happens at **compile time** (zero runtime cost)
- `_input` and `_response` fields are never accessed at runtime

### Interceptor Execution

- Path matching uses regex: O(n) where n = number of patterns
- Average case: < 10 patterns, negligible overhead (~1ms)

### Proxy Overhead

- Header copying: ~0.5ms
- JSON parsing/stringifying: ~1-2ms
- Cookie formatting: ~0.1ms per cookie
- Total proxy overhead: **~5-10ms per request**

---

## Related Systems

- **@spfn/core/route**: Server-side route definitions
- **@spfn/core/server**: Server configuration and startup
- **@spfn/core/errors**: Error classes
- **@spfn/auth**: Authentication interceptors

---

## Future Enhancements

1. **Request Batching**: Combine multiple requests into single HTTP call
2. **Automatic Retries**: Retry failed requests with exponential backoff
3. **Query Deduplication**: Prevent duplicate in-flight requests
4. **WebSocket Support**: Real-time updates via WebSocket connections
5. **React Query Integration**: First-class support for TanStack Query