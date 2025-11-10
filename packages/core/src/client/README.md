# @spfn/core/client - Next.js API Client with Interceptors

Contract-based type-safe HTTP client for Next.js applications with API Route Proxy architecture.

## Features

- ✅ **Contract-based Type Safety**: Full TypeScript inference from server contracts
- ✅ **API Route Proxy**: Unified request path for all environments (Server/Client Components)
- ✅ **HttpOnly Cookie Support**: Seamless authentication with secure cookies
- ✅ **Interceptor System**: Middleware pattern for request/response manipulation
- ✅ **Auto-discovery Registry**: Package-level interceptor registration
- ✅ **CORS-free**: Same-origin requests through Next.js API Routes
- ✅ **Security**: API URLs and secrets hidden from browser
- ✅ **Next.js Optimized**: Native support for caching, ISR, and revalidation

---

## Why API Route Proxy Pattern? 🤔

### ❌ Problem: Direct API Call Limitations

**Before (Direct API Calls):**
```
Browser (Client Component)
    ↓ fetch('http://api.server.com/_auth/login')
    ❌ CORS configuration required
    ❌ HttpOnly cookies cannot be forwarded
    ❌ API URL exposed in browser
    ❌ Different code paths for Server vs Client Components
    ↓
SPFN API Server
```

#### Issues with Direct Calls:

**1. 🍪 HttpOnly Cookie Problem**
```typescript
// ❌ Inaccessible from JavaScript
document.cookie; // HttpOnly cookies are hidden

// ❌ Cannot manually include cookies in fetch
fetch('http://api.server.com/api', {
  headers: {
    'Cookie': 'session=xxx' // ⚠️ Browser blocks this
  }
});
```

**2. 🌐 CORS Issues**
```typescript
// Next.js App: http://localhost:3000
// SPFN API: http://localhost:8790

// ❌ Cross-Origin Request
fetch('http://localhost:8790/_auth/login')
// → CORS preflight required
// → CORS configuration needed on SPFN API
// → credentials: 'include' required
```

**3. 🔒 Security Concerns**
```typescript
// ❌ API URL exposed to browser
const apiUrl = 'http://internal-api.company.com:8790';

// ❌ Risk of exposing API keys or internal tokens
```

**4. 🔀 Environment-specific Code**
```typescript
// ❌ Complex environment detection logic
const isServer = typeof window === 'undefined';

if (isServer) {
  // Server Component: Direct call
  await fetch('http://localhost:8790/api');
} else {
  // Client Component: How to forward cookies?
}
```

---

### ✅ Solution: API Route Proxy Pattern

**After (API Route Proxy):**
```
Browser (Client Component)
    ↓ fetch('/api/actions/_auth/login')  ← Same Origin
    ✅ No CORS issues
    ✅ Cookies forwarded automatically
    ✅ Only /api path exposed
    ↓
Next.js API Route (/api/actions/[...path])
    ↓ Server-side fetch('http://localhost:8790/_auth/login')
    ✅ Manual cookie forwarding possible
    ✅ Header manipulation (Interceptors)
    ✅ Response transformation (Interceptors)
    ↓
SPFN API Server (http://localhost:8790)
```

#### Advantages:

**1. 🍪 Perfect HttpOnly Cookie Support**
```typescript
// Client Component
const result = await client.call(loginContract, {
  body: { email, password }
});
// ✅ Browser → API Route: Cookies included automatically
// ✅ API Route → SPFN API: Server manually forwards cookies
// ✅ SPFN API → API Route: Set-Cookie response
// ✅ API Route → Browser: Set-Cookie forwarded
```

**2. 🌐 CORS Problem Solved**
```typescript
// ✅ Same-origin request
fetch('/api/actions/_auth/login')
// localhost:3000 → localhost:3000
// No CORS needed!
```

**3. 🔒 Enhanced Security**
```typescript
// ✅ Only /api path exposed to browser
// ✅ Actual SPFN API URL hidden in server environment variables
const SPFN_API_URL = process.env.SPFN_API_URL; // Inaccessible from browser

// ✅ Additional validation possible in API Route
export const POST = async (request) => {
  // Rate limiting, IP check, etc.
  return handleProxy(request, ...);
};
```

**4. 🔧 Unified Interceptor System**
```typescript
// ✅ Same interceptor logic for all environments
// Request Interceptor: Add headers, inject auth tokens
// Response Interceptor: Set cookies, transform responses

export const { POST } = createProxy({
  interceptors: [{
    pathPattern: '/_auth/*',
    request: async (ctx, next) => {
      // 🎯 Runs on server - sensitive operations allowed
      const secret = process.env.API_SECRET;
      ctx.headers['X-API-Secret'] = secret;
      await next();
    },
    response: async (ctx, next) => {
      // 🎯 Runs on server - set HttpOnly cookies
      ctx.setCookies.push({
        name: 'session',
        value: ctx.response.body.token,
        options: { httpOnly: true, secure: true }
      });
      await next();
    }
  }]
});
```

**5. 🎨 Simple Client Code**
```typescript
// ✅ Server Component
export default async function Page() {
  const client = createNextjsClient();
  const user = await client.call(getUserContract, {
    params: { id: '123' }
  });
  return <div>{user.name}</div>;
}

// ✅ Client Component - Same API!
'use client';
export function UserProfile() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const client = createNextjsClient();
    client.call(getUserContract, { params: { id: '123' } })
      .then(setUser);
  }, []);

  // 🎯 No environment branching!
  // 🎯 Cookie handling automatic!
}
```

**6. 📊 Next.js Features Integration**
```typescript
// ✅ Next.js caching
await client.call(getUserContract, {
  params: { id: '123' },
  fetchOptions: {
    next: { revalidate: 60 } // 60 second cache
  }
});

// ✅ ISR (Incremental Static Regeneration)
// ✅ On-demand Revalidation
```

---

### 🏗️ Architecture Comparison

#### Before: UniversalClient (Environment Branching)
```
┌─────────────────────┐
│ Server Component    │
├─────────────────────┤
│ UniversalClient     │
│   isServer? → Yes   │
│   ↓                 │
│   Direct Call       │ ──→ http://localhost:8790
└─────────────────────┘

┌─────────────────────┐
│ Client Component    │
├─────────────────────┤
│ UniversalClient     │
│   isServer? → No    │
│   ↓                 │
│   API Route Call    │ ──→ /api/proxy/* ──→ http://localhost:8790
└─────────────────────┘

⚠️ Issues:
- Two different code paths
- Server Component direct calls → interceptors not applied
- Environment detection logic needed
- Inconsistent cookie handling
```

#### After: NextjsClient (Unified Path)
```
┌─────────────────────┐
│ Server Component    │
├─────────────────────┤
│ NextjsClient        │
│   ↓                 │
│   API Route Call    │ ──→ /api/actions/* ──┐
└─────────────────────┘                       │
                                              ↓
┌─────────────────────┐              ┌──────────────┐
│ Client Component    │              │ API Route    │
├─────────────────────┤              │ + Interceptor│
│ NextjsClient        │              └──────┬───────┘
│   ↓                 │                     │
│   API Route Call    │ ──→ /api/actions/* ─┘
└─────────────────────┘                     ↓
                                    http://localhost:8790

✅ Benefits:
- Single code path
- Interceptors applied to all requests
- No environment detection needed
- Consistent cookie handling
```

---

## Quick Start

### 1. Install

```bash
pnpm install @spfn/core
```

### 2. Environment Variables

```bash
# .env.local (or .env)

# Next.js app URL (required for Server Components)
SPFN_APP_URL=http://localhost:3000

# SPFN API server URL (used by API Route Proxy)
SPFN_API_URL=http://localhost:8790
```

### 3. Create API Route Proxy

Create `app/api/actions/[...path]/route.ts`:

```typescript
/**
 * SPFN API Route Proxy
 *
 * Forwards all requests to SPFN API server with automatic:
 * - Cookie forwarding
 * - Interceptor execution
 * - Header manipulation
 */
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/client/nextjs';
```

That's it! The proxy automatically discovers and applies all registered interceptors.

### 4. Use Client

```typescript
// app/users/[id]/page.tsx
import { createNextjsClient } from '@spfn/core/client';
import { getUserContract } from '@/lib/contracts/users';

export default async function UserPage({ params }: { params: { id: string } }) {
  const client = createNextjsClient();

  const user = await client.call(getUserContract, {
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

```typescript
// app/components/LoginForm.tsx
'use client';

import { useState } from 'react';
import { createNextjsClient } from '@spfn/core/client';
import { loginContract } from '@/lib/contracts/auth';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    const client = createNextjsClient();

    try {
      const result = await client.call(loginContract, {
        body: { email, password }
      });

      console.log('Logged in:', result.userId);
      // Cookies are automatically set by interceptors
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                     Next.js Application                    │
│                                                            │
│  ┌──────────────────┐       ┌──────────────────┐         │
│  │ Server Component │       │ Client Component │         │
│  │                  │       │  'use client'    │         │
│  └────────┬─────────┘       └────────┬─────────┘         │
│           │                          │                    │
│           └──────────┬───────────────┘                    │
│                      │                                    │
│                      │ nextjsClient.call()               │
│                      ↓                                    │
│           ┌─────────────────────┐                        │
│           │   NextjsClient      │                        │
│           └──────────┬──────────┘                        │
│                      │                                    │
│                      │ POST /api/actions/_auth/login     │
│                      ↓                                    │
│           ┌─────────────────────────────────────┐        │
│           │  API Route Proxy                    │        │
│           │  /api/actions/[...path]/route.ts    │        │
│           │                                     │        │
│           │  1. Request Interceptors            │        │
│           │     - Add headers                   │        │
│           │     - Auth token injection          │        │
│           │     - Cookie forwarding             │        │
│           │                                     │        │
│           │  2. Forward to SPFN API             │        │
│           │     fetch(SPFN_API_URL + path)      │        │
│           │                                     │        │
│           │  3. Response Interceptors           │        │
│           │     - Set cookies                   │        │
│           │     - Transform response            │        │
│           │     - Error handling                │        │
│           └──────────┬──────────────────────────┘        │
└──────────────────────┼───────────────────────────────────┘
                       │
                       │ HTTP Request
                       ↓
            ┌──────────────────────┐
            │   SPFN API Server    │
            │  http://localhost:8790│
            │                      │
            │  /_auth/login        │
            │  /users/:id          │
            │  ...                 │
            └──────────────────────┘
```

---

## NextjsClient API

### `createNextjsClient(config?)`

Creates a new Next.js API client instance.

```typescript
import { createNextjsClient } from '@spfn/core/client';

const client = createNextjsClient({
  baseUrl: 'http://localhost:3000',
  proxyBasePath: '/api/actions',
  headers: {
    'X-App-Version': '1.0.0'
  },
  timeout: 30000
});
```

**Configuration:**

```typescript
interface NextjsClientConfig {
  /**
   * Next.js API route base path
   *
   * @default '/api/actions'
   */
  proxyBasePath?: string;

  /**
   * Base URL for server-side API Route calls
   *
   * Required in Server Components when calling API routes
   *
   * @default process.env.SPFN_APP_URL || 'http://localhost:3000'
   */
  baseUrl?: string;

  /**
   * Additional headers for all requests
   */
  headers?: Record<string, string>;

  /**
   * Request timeout in milliseconds
   *
   * @default 30000
   */
  timeout?: number;

  /**
   * Custom fetch implementation
   */
  fetch?: typeof fetch;
}
```

**Environment Variables:**

- `SPFN_APP_URL`: Next.js app URL (required for Server Components)
- `SPFN_API_URL`: SPFN API server URL (used by API Route Proxy)

---

### `client.call(contract, options?)`

Makes a type-safe API request using a contract.

```typescript
const user = await client.call(getUserContract, {
  params: { id: '123' },
  query: { include: 'posts' },
  headers: { 'Authorization': 'Bearer token' },
  fetchOptions: { next: { revalidate: 60 } }
});
```

**Parameters:**

```typescript
interface CallOptions<TContract extends RouteContract> {
  /**
   * Path parameters for :id substitution
   */
  params?: InferContract<TContract>['params'];

  /**
   * Query parameters
   */
  query?: InferContract<TContract>['query'];

  /**
   * Request body (typed from contract)
   */
  body?: InferContract<TContract>['body'];

  /**
   * Additional headers for this request
   */
  headers?: Record<string, string>;

  /**
   * Next.js-specific fetch options
   *
   * @example
   * // Time-based revalidation
   * { next: { revalidate: 60 } }
   *
   * // Disable cache
   * { cache: 'no-store' }
   *
   * // Tag-based revalidation
   * { next: { tags: ['users'] } }
   */
  fetchOptions?: RequestInit & {
    next?: {
      revalidate?: number | false;
      tags?: string[];
    };
  };
}
```

**Returns:** `Promise<InferContract<TContract>['response']>` - Typed response

**Throws:** `ApiClientError` if response is not OK (status >= 400)

---

### Global Singleton

For convenience, use the global singleton:

```typescript
import { configureNextjsClient, nextjsClient } from '@spfn/core/client';

// Configure once in app initialization
configureNextjsClient({
  baseUrl: process.env.SPFN_APP_URL,
  proxyBasePath: '/api/actions',
});

// Use anywhere
const user = await nextjsClient.call(getUserContract, {
  params: { id: '123' }
});
```

---

## API Route Proxy

### Basic Setup (Auto-discovery)

The simplest setup automatically discovers all registered interceptors:

```typescript
// app/api/actions/[...path]/route.ts
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/client/nextjs';
```

This is equivalent to:

```typescript
import { createProxy } from '@spfn/core/client/nextjs';

export const { GET, POST, PUT, PATCH, DELETE } = createProxy({
  apiUrl: process.env.SPFN_API_URL || 'http://localhost:8790',
  autoDiscoverInterceptors: true, // default
});
```

### Custom Configuration

```typescript
// app/api/actions/[...path]/route.ts
import { createProxy } from '@spfn/core/client/nextjs';

export const { GET, POST, PUT, PATCH, DELETE } = createProxy({
  /**
   * SPFN API base URL
   */
  apiUrl: 'http://localhost:8790',

  /**
   * Enable automatic interceptor discovery
   *
   * @default true
   */
  autoDiscoverInterceptors: true,

  /**
   * Disable interceptors from specific packages
   */
  disableAutoInterceptors: ['old-auth-package'],

  /**
   * Additional custom interceptors
   *
   * Executed after auto-discovered interceptors
   */
  interceptors: [
    {
      pathPattern: '/users/:id',
      method: 'GET',
      request: async (ctx, next) => {
        console.log(`Fetching user ${ctx.path}`);
        await next();
      }
    }
  ],

  /**
   * Enable debug logging
   */
  debug: true,
});
```

---

## Interceptor System

Interceptors provide middleware-style hooks for request/response manipulation.

### Concepts

- **Request Interceptor**: Executed before calling SPFN API
- **Response Interceptor**: Executed after SPFN API responds
- **InterceptorRule**: Defines when and how to intercept
- **Path Matching**: Supports wildcards, params, and RegExp
- **Method Matching**: Filter by HTTP method

### Request Interceptor

Modify requests before they reach SPFN API:

```typescript
import type { RequestInterceptor } from '@spfn/core/client/nextjs';

const authInterceptor: RequestInterceptor = async (ctx, next) => {
  // Add authorization header
  const session = await getSession(ctx.cookies);
  if (session) {
    ctx.headers['Authorization'] = `Bearer ${session.token}`;
  }

  // Store data for response interceptor
  ctx.metadata.userId = session?.userId;

  // Continue to next interceptor
  await next();
};
```

**Request Context:**

```typescript
interface RequestInterceptorContext {
  path: string;                        // e.g., '/_auth/login'
  method: string;                      // e.g., 'POST'
  headers: Record<string, string>;     // Mutable
  body?: any;                          // Mutable
  query: Record<string, string | string[]>;
  cookies: Map<string, string>;
  request: NextRequest;                // Original Next.js request
  metadata: Record<string, any>;       // Share data between interceptors
}
```

### Response Interceptor

Transform responses or set cookies:

```typescript
import type { ResponseInterceptor } from '@spfn/core/client/nextjs';

const cookieInterceptor: ResponseInterceptor = async (ctx, next) => {
  // Set HttpOnly cookie on successful login
  if (ctx.path === '/_auth/login' && ctx.response.status === 200) {
    ctx.setCookies.push({
      name: 'session',
      value: ctx.response.body.sessionToken,
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400, // 24 hours
        path: '/'
      }
    });

    // Remove sensitive data from response
    delete ctx.response.body.sessionToken;
  }

  await next();
};
```

**Response Context:**

```typescript
interface ResponseInterceptorContext {
  path: string;
  method: string;
  request: {
    headers: Record<string, string>;   // Immutable
    body?: any;                        // Immutable
  };
  response: {
    status: number;                    // Mutable
    statusText: string;                // Mutable
    headers: Headers;                  // Mutable
    body: any;                         // Mutable
  };
  setCookies: Array<{                  // Push to set cookies
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
  metadata: Record<string, any>;       // From request interceptor
}
```

### Interceptor Rule

Combine request/response interceptors with path/method matching:

```typescript
import type { InterceptorRule } from '@spfn/core/client/nextjs';

const authRule: InterceptorRule = {
  /**
   * Path pattern to match
   *
   * - Wildcards: '/_auth/*' matches /_auth/login, /_auth/register
   * - Params: '/users/:id' matches /users/123, /users/456
   * - RegExp: /^\/_auth\/.+$/ for complex patterns
   * - All: '*' matches any path
   */
  pathPattern: '/_auth/*',

  /**
   * HTTP method filter (optional)
   *
   * - Single: 'POST'
   * - Multiple: ['POST', 'PUT']
   * - Omit: matches all methods
   */
  method: 'POST',

  /**
   * Request interceptor (optional)
   */
  request: async (ctx, next) => {
    // Runs before SPFN API call
    await next();
  },

  /**
   * Response interceptor (optional)
   */
  response: async (ctx, next) => {
    // Runs after SPFN API responds
    await next();
  }
};
```

### Path Matching Examples

```typescript
// Wildcard: matches all paths under /_auth/
{
  pathPattern: '/_auth/*',
  // Matches: /_auth/login, /_auth/register, /_auth/logout
}

// Path parameter: matches dynamic segments
{
  pathPattern: '/users/:id',
  // Matches: /users/123, /users/abc
}

// Multiple parameters
{
  pathPattern: '/users/:userId/posts/:postId',
  // Matches: /users/123/posts/456
}

// RegExp: for complex patterns
{
  pathPattern: /^\/(users|posts)\/[^/]+$/,
  // Matches: /users/123, /posts/456
}

// Match all
{
  pathPattern: '*',
  // Matches: any path
}
```

### Method Matching Examples

```typescript
// Single method
{
  pathPattern: '/_auth/login',
  method: 'POST',
  // Only POST requests
}

// Multiple methods
{
  pathPattern: '/users/:id',
  method: ['GET', 'PUT', 'DELETE'],
  // GET, PUT, or DELETE requests
}

// All methods (omit field)
{
  pathPattern: '/users/*',
  // Any HTTP method
}
```

---

## Registry System

The Registry enables packages to automatically register interceptors without manual configuration.

### Package Registration

Packages register their interceptors on import:

```typescript
// packages/auth/src/interceptors/index.ts
import { registerInterceptors } from '@spfn/core/client/nextjs';

const authInterceptors = [
  {
    pathPattern: '/_auth/login',
    method: 'POST',
    response: async (ctx, next) => {
      if (ctx.response.status === 200) {
        ctx.setCookies.push({
          name: 'session',
          value: ctx.response.body.sessionToken,
          options: { httpOnly: true, maxAge: 86400 }
        });
      }
      await next();
    }
  },
  {
    pathPattern: '/_auth/logout',
    method: 'POST',
    response: async (ctx, next) => {
      ctx.setCookies.push({
        name: 'session',
        value: '',
        options: { maxAge: 0 } // Delete cookie
      });
      await next();
    }
  }
];

// Auto-register on import
registerInterceptors('auth', authInterceptors);
```

### Import Interceptors

Import the interceptor file before creating the proxy:

```typescript
// app/api/actions/[...path]/route.ts

// Import to trigger registration
import '@/packages/auth/src/interceptors';
import '@/packages/storage/src/interceptors';

// Proxy automatically discovers registered interceptors
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/client/nextjs';
```

### Selective Disable

Disable auto-discovered interceptors from specific packages:

```typescript
import { createProxy } from '@spfn/core/client/nextjs';

export const { GET, POST } = createProxy({
  // Disable auth interceptors (maybe using custom implementation)
  disableAutoInterceptors: ['auth'],

  // Provide custom auth interceptor
  interceptors: [
    {
      pathPattern: '/_auth/*',
      request: async (ctx, next) => {
        // Custom auth logic
        await next();
      }
    }
  ]
});
```

### Manual Registry Access

For advanced use cases:

```typescript
import { interceptorRegistry } from '@spfn/core/client/nextjs';

// Check if package has registered interceptors
if (interceptorRegistry.has('auth')) {
  console.log('Auth interceptors are registered');
}

// Get interceptors for specific package
const authInterceptors = interceptorRegistry.get('auth');

// Get all registered package names
const packages = interceptorRegistry.getPackageNames();
console.log('Registered packages:', packages);

// Get all interceptors (excluding some)
const all = interceptorRegistry.getAll(['old-package']);
```

---

## Examples

### Authentication with Interceptors

Complete authentication flow using interceptors:

```typescript
// packages/auth/src/interceptors/index.ts
import { registerInterceptors } from '@spfn/core/client/nextjs';
import type { InterceptorRule } from '@spfn/core/client/nextjs';

const authInterceptors: InterceptorRule[] = [
  // Login: Set session cookie
  {
    pathPattern: '/_auth/login',
    method: 'POST',
    response: async (ctx, next) => {
      if (ctx.response.status === 200) {
        const { sessionToken, ...userInfo } = ctx.response.body;

        // Set HttpOnly session cookie
        ctx.setCookies.push({
          name: 'session',
          value: sessionToken,
          options: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 86400, // 24 hours
            path: '/'
          }
        });

        // Remove token from response body
        ctx.response.body = userInfo;
      }

      await next();
    }
  },

  // Logout: Delete session cookie
  {
    pathPattern: '/_auth/logout',
    method: 'POST',
    response: async (ctx, next) => {
      ctx.setCookies.push({
        name: 'session',
        value: '',
        options: { maxAge: 0, path: '/' }
      });

      await next();
    }
  },

  // Protected routes: Forward session cookie
  {
    pathPattern: '*',
    request: async (ctx, next) => {
      const session = ctx.cookies.get('session');
      if (session) {
        ctx.headers['Cookie'] = `session=${session}`;
      }
      await next();
    }
  }
];

registerInterceptors('auth', authInterceptors);
```

```typescript
// app/api/actions/[...path]/route.ts
import '@/packages/auth/src/interceptors';
export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/client/nextjs';
```

```typescript
// app/components/LoginForm.tsx
'use client';

import { useState } from 'react';
import { nextjsClient } from '@spfn/core/client';
import { loginContract } from '@/lib/contracts/auth';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Call login API
      const user = await nextjsClient.call(loginContract, {
        body: { email, password }
      });

      // Session cookie is automatically set by interceptor
      console.log('Logged in:', user);
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
      />
      <button type="submit">Login</button>
    </form>
  );
}
```

### Logging Interceptor

Log all API requests and responses:

```typescript
// lib/interceptors/logging.ts
import { registerInterceptors } from '@spfn/core/client/nextjs';

const loggingInterceptors = [
  {
    pathPattern: '*',
    request: async (ctx, next) => {
      const startTime = Date.now();
      ctx.metadata.startTime = startTime;

      console.log(`→ ${ctx.method} ${ctx.path}`);

      await next();
    },
    response: async (ctx, next) => {
      const duration = Date.now() - (ctx.metadata.startTime || 0);

      console.log(
        `← ${ctx.method} ${ctx.path}: ${ctx.response.status} (${duration}ms)`
      );

      await next();
    }
  }
];

registerInterceptors('logging', loggingInterceptors);
```

### API Key Injection

Inject API keys from server environment:

```typescript
// lib/interceptors/api-key.ts
import { registerInterceptors } from '@spfn/core/client/nextjs';

const apiKeyInterceptors = [
  {
    pathPattern: '/external-api/*',
    request: async (ctx, next) => {
      // API key is only accessible on server
      const apiKey = process.env.EXTERNAL_API_KEY;

      if (apiKey) {
        ctx.headers['X-API-Key'] = apiKey;
      }

      await next();
    }
  }
];

registerInterceptors('api-key', apiKeyInterceptors);
```

### Rate Limiting

Implement rate limiting in interceptor:

```typescript
// lib/interceptors/rate-limit.ts
import { registerInterceptors } from '@spfn/core/client/nextjs';

const rateLimitMap = new Map<string, number[]>();

const rateLimitInterceptors = [
  {
    pathPattern: '/_auth/login',
    method: 'POST',
    request: async (ctx, next) => {
      const ip = ctx.request.headers.get('x-forwarded-for') || 'unknown';
      const now = Date.now();
      const windowMs = 60000; // 1 minute
      const maxRequests = 5;

      // Get recent requests for this IP
      const requests = rateLimitMap.get(ip) || [];
      const recentRequests = requests.filter(time => now - time < windowMs);

      if (recentRequests.length >= maxRequests) {
        // Rate limit exceeded - short-circuit
        throw new Error('Too many requests');
      }

      // Record this request
      recentRequests.push(now);
      rateLimitMap.set(ip, recentRequests);

      await next();
    }
  }
];

registerInterceptors('rate-limit', rateLimitInterceptors);
```

### Response Transformation

Transform API responses:

```typescript
// lib/interceptors/response-transform.ts
import { registerInterceptors } from '@spfn/core/client/nextjs';

const transformInterceptors = [
  {
    pathPattern: '/api/v1/*',
    response: async (ctx, next) => {
      // Wrap response in standard format
      ctx.response.body = {
        success: ctx.response.status >= 200 && ctx.response.status < 300,
        data: ctx.response.body,
        timestamp: new Date().toISOString()
      };

      await next();
    }
  }
];

registerInterceptors('transform', transformInterceptors);
```

### Next.js Caching

Use Next.js caching with the client:

```typescript
// app/users/[id]/page.tsx
import { createNextjsClient } from '@spfn/core/client';
import { getUserContract } from '@/lib/contracts/users';

export default async function UserPage({ params }: { params: { id: string } }) {
  const client = createNextjsClient();

  // Cache for 60 seconds
  const user = await client.call(getUserContract, {
    params: { id: params.id },
    fetchOptions: {
      next: { revalidate: 60 }
    }
  });

  return <div>{user.name}</div>;
}
```

```typescript
// app/posts/page.tsx
import { createNextjsClient } from '@spfn/core/client';
import { getPostsContract } from '@/lib/contracts/posts';

export default async function PostsPage() {
  const client = createNextjsClient();

  // Tag-based revalidation
  const posts = await client.call(getPostsContract, {
    fetchOptions: {
      next: { tags: ['posts'] }
    }
  });

  return (
    <div>
      {posts.map(post => (
        <article key={post.id}>{post.title}</article>
      ))}
    </div>
  );
}
```

```typescript
// app/actions/revalidate.ts
'use server';

import { revalidateTag } from 'next/cache';

export async function revalidatePosts() {
  revalidateTag('posts');
}
```

---

## Error Handling

### ApiClientError

All errors thrown by the client are instances of `ApiClientError`:

```typescript
import {
  ApiClientError,
  isHttpError,
  isNetworkError,
  isTimeoutError,
  isServerError,
  getServerErrorType,
  getServerErrorDetails
} from '@spfn/core/client';

try {
  const user = await client.call(getUserContract, {
    params: { id: '123' }
  });
} catch (error) {
  if (error instanceof ApiClientError) {
    console.log(error.status);      // HTTP status code
    console.log(error.url);         // Request URL
    console.log(error.response);    // Error response body
    console.log(error.errorType);   // 'http' | 'network' | 'timeout'
  }
}
```

### Type Guards

```typescript
try {
  await client.call(loginContract, { body: { email, password } });
} catch (error) {
  if (isHttpError(error)) {
    // HTTP errors (4xx, 5xx)
    if (error.status === 401) {
      console.log('Unauthorized - redirect to login');
    } else if (error.status === 404) {
      console.log('Not found');
    } else if (error.status >= 500) {
      console.log('Server error');
    }
  } else if (isNetworkError(error)) {
    // Network connectivity issues
    console.log('Network error - check connection');
  } else if (isTimeoutError(error)) {
    // Request timeout
    console.log('Request timed out - retry?');
  }
}
```

### Server Error Types

SPFN API returns structured error responses:

```typescript
try {
  await client.call(getWorkflowContract, {
    params: { uuid: 'xxx' }
  });
} catch (error) {
  // Check for specific server error type
  if (isServerError(error, 'NotFoundError')) {
    console.log('Workflow not found');
  } else if (isServerError(error, 'ValidationError')) {
    const details = getServerErrorDetails(error);
    console.log('Validation failed:', details);
  } else if (isServerError(error, 'PaymentFailedError')) {
    const details = getServerErrorDetails(error);
    console.log('Payment failed:', details.paymentId);
  }

  // Or get error type dynamically
  const errorType = getServerErrorType(error);
  console.log('Error type:', errorType);
}
```

---

## Best Practices

### 1. Use NextjsClient (Not ContractClient)

```typescript
// ✅ Good - NextjsClient with API Route Proxy
import { createNextjsClient } from '@spfn/core/client';

const client = createNextjsClient();
const user = await client.call(getUserContract, { params: { id } });

// ❌ Bad - ContractClient with direct calls
import { ContractClient } from '@spfn/core/client';

const client = new ContractClient({ baseUrl: 'http://localhost:8790' });
const user = await client.call(getUserContract, { params: { id } });
// → Bypasses interceptors, cookie handling, and proxy benefits
```

### 2. Use Interceptors for Cross-cutting Concerns

```typescript
// ✅ Good - Centralized auth via interceptor
registerInterceptors('auth', [{
  pathPattern: '*',
  request: async (ctx, next) => {
    const session = ctx.cookies.get('session');
    if (session) {
      ctx.headers['Cookie'] = `session=${session}`;
    }
    await next();
  }
}]);

// ❌ Bad - Repeat auth header everywhere
await client.call(contract, {
  headers: { 'Cookie': `session=${getSession()}` }
});
```

### 3. Package-level Interceptor Registration

```typescript
// ✅ Good - Auto-register on import
// packages/auth/src/interceptors/index.ts
registerInterceptors('auth', [...]);

// app/api/actions/[...path]/route.ts
import '@/packages/auth/src/interceptors';
export { GET, POST } from '@spfn/core/client/nextjs';

// ❌ Bad - Manual configuration in every proxy
export const { GET, POST } = createProxy({
  interceptors: [
    // Manually copying interceptor code...
  ]
});
```

### 4. Contracts Must Use Absolute Paths

```typescript
// ✅ Good - Absolute path
export const getUserContract = {
  method: 'GET' as const,
  path: '/users/:id',  // Absolute
  // ...
} as const satisfies RouteContract;

// ❌ Bad - Relative path
export const getUserContract = {
  method: 'GET' as const,
  path: '/:id',  // Relative - DON'T USE
  // ...
};
```

### 5. Use Global Singleton with Configuration

```typescript
// ✅ Good - Configure once, use everywhere
// app/layout.tsx
import { configureNextjsClient } from '@spfn/core/client';

configureNextjsClient({
  baseUrl: process.env.SPFN_APP_URL,
  proxyBasePath: '/api/actions',
});

// app/components/UserProfile.tsx
import { nextjsClient } from '@spfn/core/client';

const user = await nextjsClient.call(getUserContract, { params: { id } });

// ❌ Bad - Create new client instance every time
const client = createNextjsClient();
```

### 6. Leverage Next.js Caching

```typescript
// ✅ Good - Use Next.js caching features
const posts = await client.call(getPostsContract, {
  fetchOptions: {
    next: { revalidate: 60, tags: ['posts'] }
  }
});

// ❌ Bad - No caching, always fetches
const posts = await client.call(getPostsContract);
```

---

## Migration Guide

### From UniversalClient to NextjsClient

**Before (UniversalClient):**

```typescript
import { createUniversalClient } from '@spfn/core/client';

const client = createUniversalClient({
  apiUrl: 'http://localhost:8790',
  proxyBasePath: '/api/proxy'
});

// Environment detection happens internally
const user = await client.call(getUserContract, { params: { id } });
```

**After (NextjsClient):**

```typescript
import { createNextjsClient } from '@spfn/core/client';

const client = createNextjsClient({
  baseUrl: 'http://localhost:3000',  // Next.js app URL
  proxyBasePath: '/api/actions'      // API Route path
});

// Always routes through API Route
const user = await client.call(getUserContract, { params: { id } });
```

**Key Changes:**

1. **Import Path:**
   ```typescript
   // Before
   import { createUniversalClient } from '@spfn/core/client';

   // After
   import { createNextjsClient } from '@spfn/core/client';
   // or
   import { createClient } from '@spfn/core/client'; // Alias
   ```

2. **Configuration:**
   ```typescript
   // Before
   createUniversalClient({
     apiUrl: 'http://localhost:8790',  // SPFN API URL
     proxyBasePath: '/api/proxy'
   });

   // After
   createNextjsClient({
     baseUrl: 'http://localhost:3000',  // Next.js app URL
     proxyBasePath: '/api/actions'
   });
   ```

3. **Environment Variables:**
   ```bash
   # Before
   SERVER_API_URL=http://localhost:8790

   # After
   SPFN_APP_URL=http://localhost:3000  # For Server Components
   SPFN_API_URL=http://localhost:8790  # For API Route Proxy
   ```

4. **API Route Proxy:**
   ```typescript
   // Before: app/api/proxy/[...path]/route.ts
   export { GET, POST } from '@spfn/core/client';

   // After: app/api/actions/[...path]/route.ts
   export { GET, POST } from '@spfn/core/client/nextjs';
   ```

5. **Behavior Change:**
   - **Before**: Server Components → Direct call, Client Components → Proxy
   - **After**: Both Server and Client Components → Always proxy

### From ContractClient to NextjsClient

If you're using `ContractClient` directly:

**Before:**

```typescript
import { ContractClient } from '@spfn/core/client';

const client = new ContractClient({
  baseUrl: 'http://localhost:8790'
});

const user = await client.call(getUserContract, { params: { id } });
```

**After:**

```typescript
import { createNextjsClient } from '@spfn/core/client';

const client = createNextjsClient();

const user = await client.call(getUserContract, { params: { id } });
```

**Benefits:**
- ✅ Automatic cookie handling
- ✅ Interceptor support
- ✅ No CORS issues
- ✅ Enhanced security

---

## Legacy: ContractClient

> ⚠️ **Note**: `ContractClient` is a low-level client for direct API calls. Use `NextjsClient` for all Next.js applications.

`ContractClient` is only recommended for:
- Non-Next.js environments (Node.js scripts, other frameworks)
- Testing and debugging
- Advanced use cases where you need direct API access

### Basic Usage

```typescript
import { ContractClient } from '@spfn/core/client';

const client = new ContractClient({
  baseUrl: 'http://localhost:8790',
  headers: { 'X-API-Key': 'secret' },
  timeout: 30000
});

const user = await client.call(getUserContract, {
  params: { id: '123' }
});
```

### Limitations

- ❌ No interceptor support
- ❌ No automatic cookie handling
- ❌ CORS configuration needed
- ❌ API URL exposed to browser
- ❌ Separate code paths for server/client

For full details, see legacy documentation.

---

## API Reference

### Types

```typescript
// Client configuration
interface NextjsClientConfig {
  proxyBasePath?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
  fetch?: typeof fetch;
}

// Call options
interface CallOptions<TContract extends RouteContract> {
  params?: InferContract<TContract>['params'];
  query?: InferContract<TContract>['query'];
  body?: InferContract<TContract>['body'];
  headers?: Record<string, string>;
  fetchOptions?: RequestInit & {
    next?: { revalidate?: number | false; tags?: string[] };
  };
}

// Interceptor types
interface RequestInterceptorContext {
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: any;
  query: Record<string, string | string[]>;
  cookies: Map<string, string>;
  request: NextRequest;
  metadata: Record<string, any>;
}

interface ResponseInterceptorContext {
  path: string;
  method: string;
  request: { headers: Record<string, string>; body?: any };
  response: {
    status: number;
    statusText: string;
    headers: Headers;
    body: any;
  };
  setCookies: Array<{
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
  metadata: Record<string, any>;
}

type RequestInterceptor = (
  context: RequestInterceptorContext,
  next: () => Promise<void>
) => Promise<void>;

type ResponseInterceptor = (
  context: ResponseInterceptorContext,
  next: () => Promise<void>
) => Promise<void>;

interface InterceptorRule {
  pathPattern: string | RegExp;
  method?: string | string[];
  request?: RequestInterceptor;
  response?: ResponseInterceptor;
}

// Proxy configuration
interface ProxyConfig {
  apiUrl?: string;
  interceptors?: InterceptorRule[];
  autoDiscoverInterceptors?: boolean;
  disableAutoInterceptors?: string[];
  debug?: boolean;
}

// Error class
class ApiClientError extends Error {
  status: number;
  url: string;
  response?: unknown;
  errorType?: 'http' | 'network' | 'timeout';
}
```

### Functions

```typescript
// Client creation
function createNextjsClient(config?: NextjsClientConfig): NextjsClient
function configureNextjsClient(config: NextjsClientConfig): void
function getNextjsClient(): NextjsClient

// Proxy creation
function createProxy(config?: ProxyConfig): {
  GET: RouteHandler;
  POST: RouteHandler;
  PUT: RouteHandler;
  PATCH: RouteHandler;
  DELETE: RouteHandler;
}

// Registry
function registerInterceptors(
  packageName: string,
  interceptors: InterceptorRule[]
): void

// Error type guards
function isHttpError(error: unknown): error is ApiClientError
function isNetworkError(error: unknown): error is ApiClientError
function isTimeoutError(error: unknown): error is ApiClientError
function isServerError(error: unknown, errorType: string): error is ApiClientError
function getServerErrorType(error: ApiClientError): string | undefined
function getServerErrorDetails<T = any>(error: ApiClientError): T | undefined

// Interceptor utilities
function matchPath(path: string, pattern: string | RegExp): boolean
function matchMethod(method: string, pattern?: string | string[]): boolean
function filterMatchingInterceptors(
  rules: InterceptorRule[],
  path: string,
  method: string
): InterceptorRule[]
```

---

## Related

- [@spfn/core/route](../route/README.md) - Server-side routing with contracts
- [@spfn/core/codegen](../codegen/README.md) - Auto-generate API client
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema definitions
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)