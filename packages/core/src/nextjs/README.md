# @spfn/core/nextjs - Technical Documentation

Type-safe Next.js client system with tRPC-style API for define-route integration.

## Architecture Overview

The Next.js client system provides end-to-end type safety from server-side route definitions to client-side API calls through a 3-tier architecture:

```
+---------------------------------------------------------------+
|                         Client Tier                           |
|  +---------------------------------------------------------+  |
|  |  ApiClient (Browser / React Server Component)        |  |
|  |  - Type-safe API calls with method chaining            |  |
|  |  - Request/Response interceptors                       |  |
|  |  - Next.js caching integration                         |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
                              |
                              | fetch('/api/actions/users/123')
                              v
+---------------------------------------------------------------+
|                       Proxy Tier (Edge)                       |
|  +---------------------------------------------------------+  |
|  |  TypedProxy (Next.js API Route)                        |  |
|  |  - Request forwarding to SPFN backend                  |  |
|  |  - Interceptor system (path matching, cookies)         |  |
|  |  - Auto-discovery from registry                        |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
                              |
                              | fetch('http://spfn:8790/users/123')
                              v
+---------------------------------------------------------------+
|                       Backend Tier                            |
|  +---------------------------------------------------------+  |
|  |  SPFN Server (define-route system)                     |  |
|  |  - Route handlers with validation                      |  |
|  |  - Database operations                                 |  |
|  |  - Business logic                                      |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
```

### Core Components

```
client/nextjs/
├── typed-client.ts         # tRPC-style client with method chaining
├── typed-proxy.ts          # Next.js API Route proxy handler
├── interceptor.ts          # Interceptor execution and path matching
├── registry.ts             # Global interceptor registry
├── types.ts                # Shared types
└── index.ts                # Public API exports
```

### Design Principles

1. **tRPC-Inspired**: Method chaining, type inference, interceptors
2. **Zero-Config Default**: Works out of the box with sensible defaults
3. **Next.js Native**: Deep integration with App Router, caching, cookies
4. **Type Safety First**: End-to-end type inference from server to client
5. **Extensible**: Registry-based interceptor system for packages

---

## Type System

### Type Inference Flow

```typescript
// 1. Server-side route definition
const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        query: Type.Object({ include: Type.Optional(Type.String()) }),
    })
    .handler(async (c) => {
        const { params, query } = await c.data();
        return c.success({ id: params.id, name: 'John', email: 'john@example.com' });
    });

export const appRouter = defineRouter({ getUser });
export type AppRouter = typeof appRouter;

// 2. Type extraction utilities
export type InferRouteInput<TRoute> =
    TRoute extends RouteDef<infer TInput, any>
        ? StructuredInput<TInput>
        : never;

export type InferRouteOutput<TRoute> =
    TRoute extends RouteDef<any, infer TResponse>
        ? TResponse
        : never;

// 3. Client-side typed call
const user = await api.getUser
    .params({ id: '123' })           // Typed: { id: string }
    .query({ include: 'posts' })     // Typed: { include?: string }
    .call();                         // Returns: { id: string; name: string; email: string }
```

### Core Types

```typescript
// Route input structure (from define-route)
type StructuredInput<TInput extends RouteInput> = {
    params: TInput['params'] extends TSchema ? Static<TInput['params']> : {};
    query: TInput['query'] extends TSchema ? Static<TInput['query']> : {};
    body: TInput['body'] extends TSchema ? Static<TInput['body']> : {};
    headers: TInput['headers'] extends TSchema ? Static<TInput['headers']> : {};
    cookies: TInput['cookies'] extends TSchema ? Static<TInput['cookies']> : {};
};

// Type-safe client interface
export type ApiClient<TRoutes> = {
    [K in keyof TRoutes]: TRoutes[K] extends RouteDef<infer TInput, infer TOutput>
        ? RouteClient<TInput, TOutput>
        : TRoutes[K] extends Router<infer TNestedRoutes>
        ? ApiClient<TNestedRoutes>
        : never;
};

// Route client with method chaining
export interface RouteClient<TInput, TOutput>
{
    query(input?: Partial<StructuredInput<TInput>>, options?: CallOptions): Promise<TOutput>;
    mutate(input?: Partial<StructuredInput<TInput>>, options?: CallOptions): Promise<TOutput>;

    // Method chaining builder
    params(params: TInput extends { params: infer P } ? P : never): RouteCallBuilder<TInput, TOutput>;
    query(query: TInput extends { query: infer Q } ? Q : never): RouteCallBuilder<TInput, TOutput>;
    body(body: TInput extends { body: infer B } ? B : never): RouteCallBuilder<TInput, TOutput>;
    headers(headers: Record<string, string>): RouteCallBuilder<TInput, TOutput>;
    cookies(cookies: Record<string, string>): RouteCallBuilder<TInput, TOutput>;
    fetchOptions(options: RequestInit & NextjsRequestInit): RouteCallBuilder<TInput, TOutput>;
    call(): Promise<TOutput>;
}
```

---

## ApiClient (tRPC-Style Client)

### Method Chaining Builder

The `RouteCallBuilder` implements a fluent API for building API calls:

```typescript
export class RouteCallBuilder<TInput, TOutput>
{
    private _params?: any;
    private _query?: any;
    private _body?: any;
    private _headers?: Record<string, string>;
    private _cookies?: Record<string, string>;
    private _fetchOptions?: RequestInit;
    private _onRequest?: RequestInterceptor;
    private _onResponse?: ResponseInterceptor;

    // Chainable methods
    params(params: TInput extends { params: infer P } ? P : never): this
    {
        this._params = params;
        return this;
    }

    query(query: TInput extends { query: infer Q } ? Q : never): this
    {
        this._query = query;
        return this;
    }

    // ... other chainable methods

    // Terminal method
    async call(): Promise<TOutput>
    {
        // Build final input and options
        const input: any = {};
        if (this._params) input.params = this._params;
        if (this._query) input.query = this._query;
        if (this._body) input.body = this._body;

        const options: CallOptions = {};
        if (this._headers) options.headers = this._headers;
        if (this._cookies) options.cookies = this._cookies;
        if (this._fetchOptions) options.fetchOptions = this._fetchOptions;
        if (this._onRequest) options.onRequest = this._onRequest;
        if (this._onResponse) options.onResponse = this._onResponse;

        return this.executor(input, options);
    }
}
```

**Design Decisions:**

1. **Immutability**: Each method returns `this` for chaining
2. **Type Safety**: Conditional types ensure only valid properties are accepted
3. **Flexibility**: All parameters are optional at the builder level
4. **Terminal Call**: `.call()` is the only way to execute the request

### Usage Patterns

#### Pattern 1: Global Singleton (Recommended)

```typescript
// lib/api-client.ts
import { configureApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

// Configure once during app initialization
configureApi<AppRouter>({
    baseUrl: '/api/actions',
    headers: {
        'X-App-Version': '1.0.0',
    },
});

// components/UserProfile.tsx
import { api } from '@spfn/core/nextjs';

export async function UserProfile({ id }: { id: string })
{
    const user = await api.getUser
        .params({ id })
        .call();

    return <div>{user.name}</div>;
}
```

**Benefits:**
- Single configuration point
- No prop drilling
- Import and use anywhere
- Similar to tRPC's usage pattern

#### Pattern 2: Per-Instance (Flexibility)

```typescript
// For specific use cases requiring different configs
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

const adminApi = createApi<AppRouter>({
    baseUrl: '/api/admin',
    headers: {
        'X-Admin-Token': process.env.ADMIN_TOKEN,
    },
});

const publicApi = createApi<AppRouter>({
    baseUrl: '/api/public',
});
```

#### Pattern 3: Method Chaining

```typescript
// Flexible parameter building
const user = await api.getUser
    .params({ id: '123' })
    .query({ include: 'posts' })
    .headers({ 'X-Request-ID': uuid() })
    .fetchOptions({
        next: { revalidate: 60 },
    })
    .onResponse(async (response, body) => {
        console.log('Fetched user:', body);
        return { response, body };
    })
    .call();
```

### Client Interceptors

#### Request Interceptor

Modify request before sending:

```typescript
export type RequestInterceptor = (
    url: string,
    init: RequestInit
) => Promise<RequestInit> | RequestInit;

// Example: Add authentication
const api = createApi<AppRouter>({
    baseUrl: '/api/actions',
    onRequest: async (url, init) => {
        const token = await getAuthToken();
        return {
            ...init,
            headers: {
                ...init.headers,
                'Authorization': `Bearer ${token}`,
            },
        };
    },
});
```

#### Response Interceptor

Transform response data:

```typescript
export type ResponseInterceptor = (
    response: Response,
    body: any
) => Promise<{ response: Response; body: any }> | { response: Response; body: any };

// Example: Add metadata
const api = createApi<AppRouter>({
    baseUrl: '/api/actions',
    onResponse: async (response, body) => {
        return {
            response,
            body: {
                ...body,
                fetchedAt: new Date().toISOString(),
            },
        };
    },
});
```

### Next.js Integration

#### Server Components with Caching

```typescript
// app/users/[id]/page.tsx
import { api } from '@spfn/core/nextjs';

export default async function UserPage({ params }: { params: { id: string } })
{
    const user = await api.getUser
        .params({ id: params.id })
        .fetchOptions({
            next: { revalidate: 3600 }, // Cache for 1 hour
        })
        .call();

    return <div>{user.name}</div>;
}
```

#### Tag-Based Revalidation

```typescript
const posts = await api.getPosts
    .query({ page: 1 })
    .fetchOptions({
        next: { tags: ['posts'] },
    })
    .call();

// Later, in a Server Action:
import { revalidateTag } from 'next/cache';
revalidateTag('posts');
```

#### Client Components

```typescript
'use client';

import { api } from '@spfn/core/nextjs';
import { useState } from 'react';

export function CreateUserForm()
{
    const [loading, setLoading] = useState(false);

    async function handleSubmit(data: { name: string; email: string })
    {
        setLoading(true);

        try
        {
            const user = await api.createUser
                .body(data)
                .call();

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

## TypedProxy (Next.js API Route)

### Zero-Config Setup

The simplest setup with sensible defaults:

```typescript
// app/api/actions/[...path]/route.ts
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs';
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
import { createTypedProxy } from '@spfn/core/nextjs';

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
    disableAutoInterceptors: ['analytics'], // Exclude specific packages
});

export { GET, POST, PUT, PATCH, DELETE };
```

### Request Flow Implementation

```typescript
async function handleProxy(
    request: NextRequest,
    context: { params: { path: string[] } }
): Promise<NextResponse>
{
    // 1. Extract path and build target URL
    const path = context.params.path.join('/');
    let targetUrl = `${apiUrl}/${path}`;

    // 2. Forward query parameters
    const searchParams = request.nextUrl.searchParams;
    if (searchParams.toString())
    {
        targetUrl += `?${searchParams.toString()}`;
    }

    // 3. Build headers (forward + default + custom)
    const headers = new Headers();
    for (const header of headersToForward)
    {
        const value = request.headers.get(header);
        if (value) headers.set(header, value);
    }

    // 4. Execute simple request interceptor
    if (onRequest)
    {
        const result = await onRequest(request, targetUrl);
        targetUrl = result.url;
        if (result.headers)
        {
            for (const [key, value] of Object.entries(result.headers))
            {
                headers.set(key, value);
            }
        }
    }

    // 5. Collect and filter advanced interceptors
    let allInterceptors: InterceptorRule[] = [];

    if (autoDiscoverInterceptors !== false)
    {
        const registeredInterceptors = interceptorRegistry.getAll(disableAutoInterceptors || []);
        allInterceptors.push(...registeredInterceptors);
    }

    if (interceptors)
    {
        allInterceptors.push(...interceptors);
    }

    const matchingInterceptors = filterMatchingInterceptors(allInterceptors, `/${path}`, method);

    // 6. Execute request interceptors
    const requestCtx: RequestInterceptorContext = {
        path: `/${path}`,
        method,
        headers: Object.fromEntries(headers.entries()),
        body: requestBody,
        query: Object.fromEntries(searchParams.entries()),
        cookies: new Map(request.cookies.getAll().map(c => [c.name, c.value])),
        request,
        metadata: {},
    };

    await executeRequestInterceptors(
        requestCtx,
        matchingInterceptors.map(r => r.request).filter(i => !!i)
    );

    // 7. Apply modified headers/body
    for (const [key, value] of Object.entries(requestCtx.headers))
    {
        headers.set(key, value);
    }

    if (requestCtx.body)
    {
        fetchOptions.body = JSON.stringify(requestCtx.body);
    }

    // 8. Execute fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response = await fetch(targetUrl, {
        ...fetchOptions,
        signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 9. Parse response
    const contentType = response.headers.get('content-type');
    let body: any;

    if (contentType?.includes('application/json'))
    {
        const text = await response.text();
        body = text ? JSON.parse(text) : null;
    }
    else
    {
        body = await response.text();
    }

    // 10. Execute simple response interceptor
    if (onResponse)
    {
        const result = await onResponse(response, body);
        response = result.response;
        body = result.body;
    }

    // 11. Execute response interceptors
    const responseCtx: ResponseInterceptorContext = {
        path: `/${path}`,
        method,
        request: {
            headers: Object.fromEntries(headers.entries()),
            body: requestBody,
        },
        response: {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body,
        },
        setCookies: [],
        metadata: requestCtx.metadata,
    };

    await executeResponseInterceptors(
        responseCtx,
        matchingInterceptors.map(r => r.response).filter(i => !!i)
    );

    // 12. Apply modified response
    body = responseCtx.response.body;

    // 13. Build Next.js response
    const nextResponse = NextResponse.json(body, {
        status: responseCtx.response.status,
        statusText: responseCtx.response.statusText,
    });

    // 14. Forward response headers
    for (const header of headersToForwardBack)
    {
        const value = response.headers.get(header);
        if (value) nextResponse.headers.set(header, value);
    }

    // 15. Apply setCookies from interceptors
    for (const cookie of responseCtx.setCookies)
    {
        const parts = [`${cookie.name}=${cookie.value}`];
        const options = cookie.options || {};

        if (options.httpOnly) parts.push('HttpOnly');
        if (options.secure) parts.push('Secure');
        if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
        if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
        if (options.path) parts.push(`Path=${options.path}`);
        if (options.domain) parts.push(`Domain=${options.domain}`);

        nextResponse.headers.append('Set-Cookie', parts.join('; '));
    }

    return nextResponse;
}
```

### Error Handling

```typescript
try
{
    // ... fetch request
}
catch (error)
{
    clearTimeout(timeoutId);

    // Timeout -> 504 Gateway Timeout
    if (error instanceof Error && error.name === 'AbortError')
    {
        return NextResponse.json(
            {
                error: 'Request Timeout',
                message: `Request to SPFN API timed out after ${timeout}ms`,
            },
            { status: 504 }
        );
    }

    // Other fetch errors -> 502 Bad Gateway
    return NextResponse.json(
        {
            error: 'Bad Gateway',
            message: error instanceof Error ? error.message : 'Failed to connect to backend',
        },
        { status: 502 }
    );
}
```

**HTTP Status Codes:**
- `504 Gateway Timeout`: Request exceeded configured timeout
- `502 Bad Gateway`: Network error, DNS failure, or connection refused
- `500 Internal Server Error`: Unexpected proxy errors

---

## Interceptor System

### Architecture

The interceptor system provides two approaches:

1. **Simple Interceptors**: `onRequest` / `onResponse` - Applied to all requests
2. **Advanced Interceptors**: `InterceptorRule[]` - Path matching, cookie setting, chaining

### InterceptorRule Structure

```typescript
export interface InterceptorRule
{
    /**
     * Path pattern to match (supports wildcards)
     *
     * Examples:
     * - '/_auth/*'         -> Matches /auth/login, /auth/logout
     * - '/users/:id'       -> Matches /users/123, /users/abc
     * - '/api/*/posts'     -> Matches /api/v1/posts, /api/v2/posts
     */
    pathPattern?: string;

    /**
     * HTTP method to match
     *
     * If undefined, matches all methods
     */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

    /**
     * Request interceptor
     *
     * Called before sending request to backend.
     * Can modify headers, body, query, cookies.
     */
    request?: (ctx: RequestInterceptorContext, next: () => Promise<void>) => Promise<void>;

    /**
     * Response interceptor
     *
     * Called after receiving response from backend.
     * Can modify response body, set cookies.
     */
    response?: (ctx: ResponseInterceptorContext, next: () => Promise<void>) => Promise<void>;
}
```

### Request Interceptor Context

```typescript
export interface RequestInterceptorContext
{
    path: string;                                  // Request path: '/users/123'
    method: string;                                // HTTP method: 'GET', 'POST', etc.
    headers: Record<string, string>;               // Mutable headers
    body: any;                                     // Mutable request body
    query: Record<string, string>;                 // Query parameters
    cookies: Map<string, string>;                  // Request cookies
    request: NextRequest;                          // Raw Next.js request
    metadata: Record<string, any>;                 // Share data between interceptors
}
```

**Usage Example:**

```typescript
{
    pathPattern: '/_auth/*',
    request: async (ctx, next) => {
        // Add authentication header
        const token = ctx.cookies.get('session');
        if (token)
        {
            ctx.headers['Authorization'] = `Bearer ${token}`;
        }

        // Add request ID for tracing
        ctx.metadata.requestId = crypto.randomUUID();
        ctx.headers['X-Request-ID'] = ctx.metadata.requestId;

        await next();
    },
}
```

### Response Interceptor Context

```typescript
export interface ResponseInterceptorContext
{
    path: string;                                  // Request path
    method: string;                                // HTTP method
    request: {
        headers: Record<string, string>;           // Original request headers
        body: any;                                 // Original request body
    };
    response: {
        status: number;                            // HTTP status code
        statusText: string;                        // Status text
        headers: Headers;                          // Response headers
        body: any;                                 // Mutable response body
    };
    setCookies: Array<{                            // Cookies to set in response
        name: string;
        value: string;
        options?: {
            httpOnly?: boolean;
            secure?: boolean;
            sameSite?: 'strict' | 'lax' | 'none';
            maxAge?: number;
            path?: string;
            domain?: string;
        };
    }>;
    metadata: Record<string, any>;                 // Shared metadata
}
```

**Usage Example:**

```typescript
{
    pathPattern: '/_auth/login',
    method: 'POST',
    response: async (ctx, next) => {
        // Extract token from response
        const token = ctx.response.body?.token;

        if (token)
        {
            // Set HttpOnly cookie
            ctx.setCookies.push({
                name: 'session',
                value: token,
                options: {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 86400, // 24 hours
                    path: '/',
                },
            });

            // Remove token from response body
            delete ctx.response.body.token;
        }

        await next();
    },
}
```

### Path Pattern Matching

```typescript
export function matchPath(pattern: string, path: string): boolean
{
    // Convert wildcard pattern to regex
    // '/_auth/*' -> /^\/_auth\/.*$/
    // '/users/:id' -> /^\/users\/[^/]+$/

    const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/:\w+/g, '[^/]+');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
}

// Examples:
matchPath('/_auth/*', '/_auth/login')           // true
matchPath('/_auth/*', '/_auth/logout')          // true
matchPath('/_auth/*', '/users/123')             // false
matchPath('/users/:id', '/users/123')           // true
matchPath('/users/:id', '/users/123/posts')     // false
```

### Interceptor Execution Order

```
Request
    |
    v
[1. Auto-discovered interceptors from registry]
    - Package 1 request interceptors
    - Package 2 request interceptors
    - ...
    |
    v
[2. Config interceptors from TypedProxyConfig]
    - Custom request interceptors
    |
    v
[3. Simple onRequest] (if provided)
    |
    v
>>> Forward to SPFN backend >>>
    |
    v
[4. Simple onResponse] (if provided)
    |
    v
[5. Config interceptors from TypedProxyConfig]
    - Custom response interceptors
    |
    v
[6. Auto-discovered interceptors from registry]
    - Package 1 response interceptors
    - Package 2 response interceptors
    - ...
    |
    v
Response
```

**Chaining with next():**

```typescript
// Interceptor 1: Add auth header
request: async (ctx, next) => {
    console.log('Before: No auth header');
    ctx.headers['Authorization'] = 'Bearer token';
    await next(); // Continue to next interceptor
    console.log('After: Auth header added');
}

// Interceptor 2: Add request ID
request: async (ctx, next) => {
    console.log('Before: No request ID');
    ctx.headers['X-Request-ID'] = uuid();
    await next(); // Continue to fetch
    console.log('After: Request ID added');
}

// Execution:
// -> "Before: No auth header"
// -> "Before: No request ID"
// >>> Fetch request >>>
// <- "After: Request ID added"
// <- "After: Auth header added"
```

---

## Registry-Based Auto-Discovery

### Package Registration

Packages can register interceptors automatically on import:

```typescript
// @spfn/auth/src/adapters/nextjs/index.ts
import { registerInterceptors } from '@spfn/core/nextjs';

export const authInterceptors = [
    {
        pathPattern: '/_auth/*',
        request: async (ctx, next) => {
            // Add JWT token from session cookie
            const session = ctx.cookies.get('session');
            if (session)
            {
                ctx.headers['Authorization'] = `Bearer ${session}`;
            }
            await next();
        },
        response: async (ctx, next) => {
            // Set session cookie on login
            if (ctx.path === '/_auth/login' && ctx.response.body?.token)
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
                delete ctx.response.body.token;
            }
            await next();
        },
    },
];

// Auto-register on import
registerInterceptors('auth', authInterceptors);
```

### Application Usage

```typescript
// app/api/actions/[...path]/route.ts
import '@spfn/auth/adapters/nextjs'; // Auto-registers interceptors

// Default export with auto-discovery enabled
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs';
```

**Auto-discovery is enabled by default.** The proxy will automatically:
1. Load all registered interceptors from `interceptorRegistry`
2. Filter by path pattern and HTTP method
3. Execute matching interceptors in order

### Disabling Auto-Discovery

```typescript
// Disable all auto-discovered interceptors
const { GET, POST } = createTypedProxy({
    autoDiscoverInterceptors: false,
});

// Or exclude specific packages
const { GET, POST } = createTypedProxy({
    disableAutoInterceptors: ['analytics', 'telemetry'],
});
```

### Registry API

```typescript
export class InterceptorRegistry
{
    // Register interceptors for a package
    register(packageName: string, interceptors: InterceptorRule[]): void;

    // Get all registered interceptors (excluding specified packages)
    getAll(exclude: string[] = []): InterceptorRule[];

    // Get interceptors for specific package
    get(packageName: string): InterceptorRule[] | undefined;

    // Check if package has registered interceptors
    has(packageName: string): boolean;

    // Get list of registered package names
    getPackageNames(): string[];

    // Unregister interceptors for a package
    unregister(packageName: string): void;

    // Clear all registered interceptors (for testing)
    clear(): void;
}

// Global singleton
export const interceptorRegistry = new InterceptorRegistry();
```

---

## Request Flow

### Complete Flow Example

```typescript
// 1. Server-side route definition
// server/routes/users.ts
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        query: Type.Object({ include: Type.Optional(Type.String()) }),
    })
    .handler(async (c) => {
        const { params, query } = await c.data();
        const user = await db.users.findById(params.id);

        if (query.include === 'posts')
        {
            user.posts = await db.posts.findByUserId(params.id);
        }

        return c.success(user);
    });

export const appRouter = defineRouter({ getUser });

// 2. Next.js API Route (Proxy)
// app/api/actions/[...path]/route.ts
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs';

// 3. Client-side API call
// app/users/[id]/page.tsx
import { api } from '@spfn/core/nextjs';

export default async function UserPage({ params }: { params: { id: string } })
{
    const user = await api.getUser
        .params({ id: params.id })
        .query({ include: 'posts' })
        .fetchOptions({
            next: { revalidate: 60 },
        })
        .call();

    return (
        <div>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
            {user.posts && (
                <ul>
                    {user.posts.map(post => (
                        <li key={post.id}>{post.title}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}
```

### Flow Diagram

```
+---------------------------------------------------------------+
| 1. Client Call (api.getUser)                          |
|    - Build URL: /api/actions/users/123?include=posts          |
|    - Type check: params: { id: string }, query: { include?: string } |
|    - Execute fetch with Next.js caching                       |
+---------------------------------------------------------------+
                              |
                              | fetch('/api/actions/users/123?include=posts')
                              v
+---------------------------------------------------------------+
| 2. Next.js API Route (TypedProxy)                             |
|    - Extract path: ['users', '123']                           |
|    - Build target: http://localhost:8790/users/123?include=posts |
|    - Execute request interceptors:                            |
|      * Auto-discovered (auth, analytics, etc.)                |
|      * Config interceptors                                    |
|      * Simple onRequest                                       |
+---------------------------------------------------------------+
                              |
                              | fetch('http://localhost:8790/users/123?include=posts')
                              v
+---------------------------------------------------------------+
| 3. SPFN Backend (define-route)                                |
|    - Route: GET /users/:id                                    |
|    - Validate params: { id: '123' }                           |
|    - Validate query: { include: 'posts' }                     |
|    - Execute handler:                                         |
|      * Query database                                         |
|      * Load relationships                                     |
|      * Return response                                        |
+---------------------------------------------------------------+
                              |
                              | { success: true, data: { id: '123', name: 'John', ... } }
                              v
+---------------------------------------------------------------+
| 4. Next.js API Route (TypedProxy)                             |
|    - Execute response interceptors:                           |
|      * Simple onResponse                                      |
|      * Config interceptors                                    |
|      * Auto-discovered (auth sets cookies, etc.)              |
|    - Apply setCookies to response headers                     |
|    - Return NextResponse                                      |
+---------------------------------------------------------------+
                              |
                              | NextResponse with body and cookies
                              v
+---------------------------------------------------------------+
| 5. Client Call (api.getUser)                          |
|    - Parse JSON response                                      |
|    - Type assertion: Promise<{ id: string; name: string; ... }> |
|    - Return typed result                                      |
+---------------------------------------------------------------+
```

---

## Comparison with tRPC

### Similarities

| Feature | tRPC | SPFN NextJS Client |
|---------|------|-------------------|
| Type Safety | Yes (End-to-end) | Yes (End-to-end) |
| Method Chaining | Yes (.query(), .mutate()) | Yes (.params().query().call()) |
| Interceptors | Yes (Links) | Yes (Interceptors) |
| Type Inference | Yes (typeof appRouter) | Yes (typeof appRouter) |
| Batching | Yes (Built-in) | No (Not implemented) |
| Subscriptions | Yes (WebSocket) | No (Not implemented) |

### Differences

#### 1. URL Structure

**tRPC:**
```
/api/trpc/user.getById?input={"id":"123"}
```
- Single endpoint (`/api/trpc`)
- Procedure name in path (`user.getById`)
- Input in query string

**SPFN:**
```
/api/actions/users/123?include=posts
```
- Multiple endpoints (route-based)
- RESTful path structure
- Query params as defined in route

#### 2. Route Definition

**tRPC:**
```typescript
export const appRouter = router({
    user: router({
        getById: procedure
            .input(z.object({ id: z.string() }))
            .query(async ({ input }) => {
                return db.users.findById(input.id);
            }),
    }),
});
```

**SPFN:**
```typescript
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
    })
    .handler(async (c) => {
        const { params } = await c.data();
        return c.success(await db.users.findById(params.id));
    });

export const appRouter = defineRouter({ getUser });
```

#### 3. Client Usage

**tRPC:**
```typescript
const trpc = createTRPCProxyClient<AppRouter>({ links: [...] });
const user = await trpc.user.getById.query({ id: '123' });
```

**SPFN:**
```typescript
configureApi<AppRouter>({ baseUrl: '/api/actions' });
const user = await api.getUser.params({ id: '123' }).call();
```

#### 4. Server Adapter

**tRPC:**
```typescript
// Single unified adapter
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

const handler = (req: Request) =>
    fetchRequestHandler({
        endpoint: '/api/trpc',
        req,
        router: appRouter,
    });

export { handler as GET, handler as POST };
```

**SPFN:**
```typescript
// Separate proxy layer
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs';

// Proxy forwards to independent SPFN server
// Client -> Next.js API Route -> SPFN Backend
```

### Design Philosophy

**tRPC:**
- Single endpoint, procedure-based routing
- Optimized for monolithic fullstack apps
- RPC (Remote Procedure Call) paradigm
- Tight coupling between client and server

**SPFN:**
- RESTful paths, HTTP-based routing
- Designed for microservices / separate backend
- REST API paradigm
- Loose coupling via proxy layer

---

## Extension Points

### Custom Client Interceptors

Add global request/response transformations:

```typescript
// lib/api-client.ts
import { configureApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

configureApi<AppRouter>({
    baseUrl: '/api/actions',

    onRequest: async (url, init) => {
        // Add tracing headers
        const traceId = crypto.randomUUID();

        return {
            ...init,
            headers: {
                ...init.headers,
                'X-Trace-ID': traceId,
                'X-App-Version': process.env.NEXT_PUBLIC_APP_VERSION!,
            },
        };
    },

    onResponse: async (response, body) => {
        // Log slow requests
        const duration = parseFloat(response.headers.get('X-Response-Time') || '0');
        if (duration > 1000)
        {
            console.warn('Slow request detected:', {
                url: response.url,
                duration,
            });
        }

        return { response, body };
    },
});
```

### Custom Proxy Interceptors

Add advanced path-based logic:

```typescript
// app/api/actions/[...path]/route.ts
import { createTypedProxy } from '@spfn/core/nextjs';

const { GET, POST, PUT, PATCH, DELETE } = createTypedProxy({
    interceptors: [
        // Rate limiting
        {
            pathPattern: '/public/*',
            request: async (ctx, next) => {
                const ip = ctx.request.headers.get('x-forwarded-for') || 'unknown';
                const rateLimitOk = await checkRateLimit(ip);

                if (!rateLimitOk)
                {
                    throw new Error('Rate limit exceeded');
                }

                await next();
            },
        },

        // Response caching
        {
            pathPattern: '/cache/*',
            response: async (ctx, next) => {
                // Set cache headers
                ctx.response.headers.set('Cache-Control', 'public, max-age=3600');
                await next();
            },
        },

        // Analytics tracking
        {
            request: async (ctx, next) => {
                const startTime = Date.now();
                ctx.metadata.startTime = startTime;
                await next();
            },
            response: async (ctx, next) => {
                const duration = Date.now() - (ctx.metadata.startTime as number);

                await analytics.track({
                    path: ctx.path,
                    method: ctx.method,
                    status: ctx.response.status,
                    duration,
                });

                await next();
            },
        },
    ],
});

export { GET, POST, PUT, PATCH, DELETE };
```

### Package Interceptors

Create reusable interceptor packages:

```typescript
// @spfn/analytics/src/adapters/nextjs/index.ts
import { registerInterceptors } from '@spfn/core/nextjs';

export const analyticsInterceptors = [
    {
        request: async (ctx, next) => {
            ctx.metadata.analyticsStartTime = Date.now();
            await next();
        },
        response: async (ctx, next) => {
            const duration = Date.now() - (ctx.metadata.analyticsStartTime as number);

            await analytics.track({
                path: ctx.path,
                method: ctx.method,
                status: ctx.response.status,
                duration,
                timestamp: new Date().toISOString(),
            });

            await next();
        },
    },
];

registerInterceptors('analytics', analyticsInterceptors);

// Usage in app:
// app/api/actions/[...path]/route.ts
import '@spfn/analytics/adapters/nextjs'; // Auto-registers
export { GET, POST } from '@spfn/core/nextjs';
```

---

## Performance Considerations

### Type Inference Cost

- Type inference happens at **compile time** (zero runtime cost)
- `_input` and `_response` fields are never accessed at runtime
- Only used by TypeScript for type checking
- No performance impact on production builds

### Method Chaining Overhead

- Each chainable method returns `this` (minimal memory)
- No intermediate object creation until `.call()`
- Final `call()` collects all parameters into single object
- Comparable to object literal creation

### Interceptor Execution

- Path matching uses regex: O(n) where n = number of patterns
- Average case: < 10 patterns, negligible overhead (~1ms)
- Interceptor execution: O(m) where m = number of matching interceptors
- Typical: 2-5 interceptors per request

### Registry Lookup

- `getAll()` iterates Map entries: O(n) where n = number of packages
- Typical: < 10 packages, ~1ms overhead
- Exclude check uses Set: O(1) per package
- Total registry overhead: < 5ms

### Proxy Overhead

- Header copying: ~0.5ms (6-10 headers)
- JSON parsing/stringifying: ~1-2ms for typical payloads
- Cookie formatting: ~0.1ms per cookie
- Total proxy overhead: **~5-10ms per request**

### Optimization Tips

1. **Use singleton pattern**: Avoid creating new client instances
2. **Minimize interceptors**: Only add necessary interceptors
3. **Use specific path patterns**: Avoid catch-all patterns like `*`
4. **Disable auto-discovery if not needed**: `autoDiscoverInterceptors: false`
5. **Cache responses**: Use Next.js `next.revalidate` for static data

---

## Testing Strategy

### Unit Tests

Test individual components in isolation:

```typescript
// ApiClient tests
describe('ApiClient', () => {
    it('should build correct URL with params', async () => {
        const api = createApi<AppRouter>({ baseUrl: '/api/actions' });

        // Mock fetch
        global.fetch = jest.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ id: '123', name: 'John' }),
            })
        );

        const user = await api.getUser.params({ id: '123' }).call();

        expect(fetch).toHaveBeenCalledWith(
            '/api/actions/users/123',
            expect.any(Object)
        );
        expect(user).toEqual({ id: '123', name: 'John' });
    });
});

// TypedProxy tests
describe('TypedProxy', () => {
    it('should forward request to backend', async () => {
        const { GET } = createTypedProxy({ apiUrl: 'http://backend:8790' });

        const req = new NextRequest('http://localhost:3000/api/actions/users/123');
        const context = { params: { path: ['users', '123'] } };

        const response = await GET(req, context);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toHaveProperty('success', true);
    });
});
```

### Integration Tests

Test full request/response cycle:

```typescript
describe('End-to-End', () => {
    it('should handle typed request from client to server', async () => {
        // 1. Define route
        const getUser = route.get('/users/:id')
            .input({ params: Type.Object({ id: Type.String() }) })
            .handler(async (c) => {
                const { params } = await c.data();
                return c.success({ id: params.id, name: 'John' });
            });

        const appRouter = defineRouter({ getUser });

        // 2. Create server with proxy
        const app = await createServer(
            defineServerConfig().routes(appRouter).build()
        );

        // 3. Create client
        const api = createApi<typeof appRouter>({
            baseUrl: 'http://localhost:8790',
        });

        // 4. Make request
        const user = await api.getUser.params({ id: '123' }).call();

        // 5. Verify response
        expect(user).toEqual({ id: '123', name: 'John' });
    });
});
```

### Interceptor Tests

Test interceptor execution:

```typescript
describe('Interceptors', () => {
    it('should execute interceptors in correct order', async () => {
        const executionOrder: string[] = [];

        const { POST } = createTypedProxy({
            interceptors: [
                {
                    pathPattern: '/_auth/*',
                    request: async (ctx, next) => {
                        executionOrder.push('request-1-before');
                        await next();
                        executionOrder.push('request-1-after');
                    },
                },
                {
                    pathPattern: '/_auth/*',
                    request: async (ctx, next) => {
                        executionOrder.push('request-2-before');
                        await next();
                        executionOrder.push('request-2-after');
                    },
                },
            ],
        });

        const req = new NextRequest('http://localhost:3000/api/actions/_auth/login', {
            method: 'POST',
        });

        await POST(req, { params: { path: ['_auth', 'login'] } });

        expect(executionOrder).toEqual([
            'request-1-before',
            'request-2-before',
            'request-2-after',
            'request-1-after',
        ]);
    });
});
```

---

## Migration Guide

### From Contract-Based to define-route

If you're migrating from the deprecated contract-based system:

```typescript
// OLD: Contract-based
import { createClient } from '@spfn/core/nextjs';
import { userContract } from '@/contracts/user';

const client = createClient(userContract);
const user = await client.getUser({ id: '123' });

// NEW: define-route based
import { api } from '@spfn/core/nextjs';

const user = await api.getUser
    .params({ id: '123' })
    .call();
```

**Key Changes:**
1. Import `api` instead of `createClient`
2. Use method chaining (`.params().call()`) instead of single object
3. Use global singleton instead of per-contract instances

### From Direct Fetch to ApiClient

```typescript
// OLD: Manual fetch
const response = await fetch('/api/actions/users/123');
const data = await response.json();

// NEW: ApiClient
const user = await api.getUser
    .params({ id: '123' })
    .call();
```

**Benefits:**
- Type safety (compile-time errors for invalid params)
- Automatic request/response handling
- Built-in error handling
- Next.js caching integration

---

## Related Systems

### Integration with Other Modules

- **@spfn/core/route**: Server-side route definitions, type extraction
- **@spfn/core/server**: Server configuration and startup
- **@spfn/core/errors**: Error classes (ApiError, HttpError)
- **@spfn/core/logger**: Client-side logging
- **@spfn/auth**: Authentication interceptors
- **@spfn/storage**: File upload interceptors

### Comparison with Other Client Systems

| Feature | ApiClient | NextjsClient | tRPC Client |
|---------|------------|--------------|-------------|
| Type Safety | Yes (Full) | Yes (Full) | Yes (Full) |
| Method Chaining | Yes | No | Yes |
| define-route Support | Yes | No (contract) | N/A |
| Next.js Integration | Yes (Deep) | Yes (Deep) | Yes (Deep) |
| Interceptors | Yes (Advanced) | Yes (Basic) | Yes (Links) |
| **Status** | **Active** | **Deprecated** | **External** |

---

## Future Enhancements

### Potential Improvements

1. **Request Batching**: Combine multiple requests into single HTTP call
2. **Automatic Retries**: Retry failed requests with exponential backoff
3. **Query Deduplication**: Prevent duplicate in-flight requests
4. **Optimistic Updates**: Update UI before server confirmation
5. **WebSocket Support**: Real-time updates via WebSocket connections
6. **OpenAPI Generation**: Generate OpenAPI spec from route definitions
7. **React Query Integration**: First-class support for TanStack Query
8. **Streaming Responses**: Support streaming for large payloads

### Experimental Features

Currently exploring:

- **Middleware Composition**: Compose interceptors from multiple sources
- **Request Mocking**: Built-in mock mode for testing
- **Type-Safe Errors**: Typed error responses from backend
- **Automatic Pagination**: Handle pagination automatically

---

## References

- [tRPC](https://trpc.io) - Inspiration for type-safe API design
- [Next.js App Router](https://nextjs.org/docs/app) - Server Components, caching
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema validation
- [Hono](https://hono.dev) - Underlying web framework

---

## Troubleshooting

### Common Issues

#### 1. Type errors with params/query

**Problem:**
```typescript
// Error: Property 'params' does not exist
const user = await api.getUser.params({ id: '123' }).call();
```

**Solution:**
- Ensure route has `input` with `params` defined
- Check `typeof appRouter` is correctly passed to client
- Verify TypeScript version >= 4.7

#### 2. Cookies not being set

**Problem:**
```typescript
// Cookie not appearing in browser
ctx.setCookies.push({ name: 'session', value: 'xxx' });
```

**Solution:**
- Ensure interceptor is in **response** phase (not request)
- Check `httpOnly`, `secure`, `sameSite` options
- Verify domain/path settings
- Check browser console for cookie errors

#### 3. Interceptors not executing

**Problem:**
```typescript
// Interceptor registered but not running
registerInterceptors('mypackage', [...]);
```

**Solution:**
- Ensure package is imported before proxy usage
- Check `autoDiscoverInterceptors` is not `false`
- Verify package not in `disableAutoInterceptors` list
- Check path pattern matches request path

#### 4. CORS errors in development

**Problem:**
```
Access to fetch at 'http://localhost:8790' has been blocked by CORS
```

**Solution:**
- Use typed-proxy (Next.js API Route) instead of direct backend calls
- Configure CORS on SPFN backend if needed
- Ensure `SPFN_API_URL` is set correctly

#### 5. Type inference not working

**Problem:**
```typescript
// No autocomplete for route methods
api.getUser // No suggestions
```

**Solution:**
- Ensure `configureApi<AppRouter>` includes type parameter
- Check `appRouter` is exported with `typeof`
- Restart TypeScript server
- Verify no circular import issues

---

**For more examples and detailed API documentation, see:**
- `/src/route/README.md` - Route system architecture
- `/src/server/README.md` - Server configuration
- `/src/client/nextjs/typed-client.ts` - Client implementation
- `/src/client/nextjs/typed-proxy.ts` - Proxy implementation