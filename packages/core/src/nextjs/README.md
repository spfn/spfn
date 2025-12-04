# @spfn/core/nextjs - Technical Documentation

Type-safe Next.js client system with tRPC-style API for define-route integration.

## Architecture Overview

The Next.js client system provides end-to-end type safety from server-side route definitions to client-side API calls through a 3-tier RPC architecture:

```
+---------------------------------------------------------------+
|                         Client Tier                           |
|  +---------------------------------------------------------+  |
|  |  ApiClient (Browser / React Server Component)           |  |
|  |  - Type-safe API calls with structured input            |  |
|  |  - Request/Response interceptors                        |  |
|  |  - Next.js caching integration                          |  |
|  |  - No metadata required!                                |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
                              |
                              | GET/POST /api/rpc/{routeName}
                              v
+---------------------------------------------------------------+
|                      RPC Proxy Tier (Edge)                    |
|  +---------------------------------------------------------+  |
|  |  RpcProxy (Next.js API Route)                           |  |
|  |  - routeName → method/path resolution from router       |  |
|  |  - Interceptor system (path matching, cookies)          |  |
|  |  - Auto-discovery from registry                         |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
                              |
                              | Actual HTTP method to resolved path
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
│   ├── helpers.ts              # Request helpers
│   ├── errors.ts               # ApiError class
│   └── debug-logs.ts           # Debug logging utilities
└── proxy/
    ├── index.ts                # RPC proxy exports
    ├── rpc.ts                  # createRpcProxy implementation
    ├── types.ts                # Proxy types
    ├── helpers.ts              # Proxy helpers
    └── interceptors/
        ├── index.ts
        ├── registry.ts         # Global interceptor registry
        ├── helpers.ts          # Path matching, execution
        └── types.ts            # Interceptor types
```

### Design Principles

1. **No Metadata Required**: Client doesn't need pre-extracted metadata
2. **Body-Based Method Detection**: GET for no body, POST for body
3. **RPC-Style Resolution**: Proxy resolves routeName to actual HTTP method/path
4. **Next.js Native**: Deep integration with App Router, caching, cookies
5. **Type Safety First**: End-to-end type inference from server to client
6. **Client/Server Separation**: Clear import paths for client vs server code

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
// RPC proxy configuration
import { createRpcProxy } from '@spfn/core/nextjs/server';

// Interceptor system
import {
    registerInterceptors,
    interceptorRegistry,
    matchPath,
    filterMatchingInterceptors,
} from '@spfn/core/nextjs/server';

import type {
    RpcProxyConfig,
    RequestInterceptorContext,
    ResponseInterceptorContext,
    InterceptorRule,
} from '@spfn/core/nextjs/server';
```

---

## ApiClient (Structured Input API)

### Creating a Client

The client **does not require metadata** - method/path resolution happens at the proxy layer:

```typescript
// server/router.ts
import { defineRouter, route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const appRouter = defineRouter({
    getUser: route.get('/users/:id')
        .input({ params: Type.Object({ id: Type.String() }) })
        .handler(async (c) => {
            const { params } = await c.data();
            return { id: params.id, name: 'John' };
        }),

    createUser: route.post('/users')
        .input({ body: Type.Object({ name: Type.String() }) })
        .handler(async (c) => {
            const { body } = await c.data();
            return { id: '2', name: body.name };
        }),

    updateUser: route.put('/users/:id')
        .input({
            params: Type.Object({ id: Type.String() }),
            body: Type.Object({ name: Type.String() })
        })
        .handler(async (c) => {
            const { params, body } = await c.data();
            return { id: params.id, name: body.name };
        }),
});

export type AppRouter = typeof appRouter;
```

```typescript
// lib/api.ts
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

// No metadata needed!
export const api = createApi<AppRouter>();
```

### Structured Input Pattern

Input structure matches the server-side route definition exactly:

```typescript
// GET /users/:id - params only (→ GET /api/rpc/getUser?input=...)
const user = await api.getUser.call({ params: { id: '123' } });

// GET /users/:id?include=posts - params + query
const user = await api.getUser.call({
    params: { id: '123' },
    query: { include: 'posts' }
});

// POST /users - body only (→ POST /api/rpc/createUser)
const newUser = await api.createUser.call({
    body: { name: 'John', email: 'john@example.com' }
});

// PUT /users/:id - params + body (→ POST /api/rpc/updateUser)
const updatedUser = await api.updateUser.call({
    params: { id: '123' },
    body: { name: 'Jane' }
});
```

### Method Detection

The client automatically determines HTTP method based on input:

- **No `body` field** → `GET /api/rpc/{routeName}?input={encoded}` (browser cacheable)
- **Has `body` field** → `POST /api/rpc/{routeName}` with JSON body

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
    // Base URL for RPC endpoint (default: '/api/rpc')
    baseUrl?: string;

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

## RpcProxy (Next.js API Route)

### Setup

```typescript
// app/api/rpc/[routeName]/route.ts
import { appRouter } from '@/server/router';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST } = createRpcProxy({ router: appRouter });
```

**How it works:**
1. Client calls `GET /api/rpc/getUser?input={...}` or `POST /api/rpc/createUser`
2. Proxy extracts `routeName` from URL
3. Proxy looks up `appRouter.routes[routeName]` to get `method` and `path`
4. Proxy forwards request to SPFN backend with correct HTTP method and path

### Custom Configuration

```typescript
// app/api/rpc/[routeName]/route.ts
import { appRouter } from '@/server/router';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST } = createRpcProxy({
    router: appRouter,
    apiUrl: process.env.SPFN_API_URL,
    timeout: 60000,
    debug: true,

    headers: {
        'X-API-Key': process.env.SPFN_API_KEY!,
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
```

### Next.js 15 Support

The proxy supports Next.js 15's async params:

```typescript
// Handler signature
async function handleRpc(
    request: NextRequest,
    context: { params: Promise<{ routeName?: string }> }
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

### RPC vs REST

| Aspect | RPC Style (Current) | REST Style (Previous) |
|--------|---------------------|----------------------|
| Client complexity | Lower (no metadata) | Higher (needs metadata) |
| URL structure | `/api/rpc/{routeName}` | `/api/actions/{path}` |
| Browser caching | GET requests cacheable | GET requests cacheable |
| Proxy complexity | Higher (route resolution) | Lower (simple forward) |

### Interceptor Execution

- Path matching uses regex: O(n) where n = number of patterns
- Average case: < 10 patterns, negligible overhead (~1ms)

### Proxy Overhead

- Route lookup: ~0.1ms (object property access)
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