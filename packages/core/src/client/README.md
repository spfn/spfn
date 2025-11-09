# @spfn/core/client - Contract-based HTTP Client

Type-safe HTTP client with end-to-end type safety using RouteContract.

## Features

### ContractClient (Basic Client)
- ✅ **End-to-End Type Safety**: Full TypeScript inference from server contracts
- ✅ **Contract-based**: Shares types with server routes via RouteContract
- ✅ **Zero Runtime Validation**: Types only, no schema validation overhead
- ✅ **Absolute Paths**: Contracts define their own URL paths
- ✅ **Path Parameters**: Automatic `:id` substitution from contract.path
- ✅ **Query Parameters**: Support for strings, numbers, arrays
- ✅ **Timeout Control**: Built-in AbortController with configurable timeout
- ✅ **Error Handling**: Structured ApiClientError with status codes
- ✅ **Request Interceptors**: Add authentication, logging, etc.
- ✅ **Next.js Safe**: No server dependencies, safe for client components
- ✅ **Minimal**: Uses native `fetch` API, zero dependencies

### UniversalClient (Auto-routing Client)
- ✅ **Environment Detection**: Automatically detects server vs browser
- ✅ **Auto-routing**: Server → Direct API call, Browser → Proxy route
- ✅ **Cookie Forwarding**: HttpOnly cookies work seamlessly
- ✅ **Same API**: Identical interface as ContractClient
- ✅ **Zero Configuration**: Works out of the box with sensible defaults
- ✅ **Flexible Proxy Path**: Configurable API route path

---

## Quick Start

### Installation

```bash
pnpm install @spfn/core
```

### Basic Usage

```typescript
import { createClient } from '@spfn/core/client';
import { getUserContract, createUserContract } from '@/lib/contracts/users';

// Create client instance
const client = createClient({
  baseUrl: 'http://localhost:4000'
});

// GET request - fully typed from contract
const user = await client.call(getUserContract, {
  params: { id: '123' }
});
// ✅ user.name is typed based on contract.response
// ✅ URL is /users/123 from contract.path: '/users/:id'

// POST request - body and response typed
const newUser = await client.call(createUserContract, {
  body: { name: 'John', email: 'john@example.com' }
});
// ✅ TypeScript validates body matches contract.body
// ✅ newUser is typed from contract.response
// ✅ URL is /users from contract.path: '/users'
```

---

## Core Concepts

### Contract-based Type Safety

The client integrates with your server-side `RouteContract` definitions for full type safety. Contracts **must** be in `src/lib/contracts/` with absolute paths:

```typescript
// src/lib/contracts/users.ts - Shared between client and server
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

export const getUserContract = {
  method: 'GET' as const,
  path: '/users/:id',  // ← Absolute path with parameter
  params: Type.Object({
    id: Type.String()
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String()
  })
} as const satisfies RouteContract;

export const createUserContract = {
  method: 'POST' as const,
  path: '/users',  // ← Absolute path
  body: Type.Object({
    name: Type.String(),
    email: Type.String()
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String()
  })
} as const satisfies RouteContract;
```

```typescript
// Client code - Full type safety
import { createClient } from '@spfn/core/client';
import { getUserContract, createUserContract } from '@/lib/contracts/users';

const client = createClient();

// TypeScript knows the exact shape of user
const user = await client.call(getUserContract, {
  params: { id: '123' }
});
// URL: GET /users/123 (from contract.path: '/users/:id')

console.log(user.name); // ✅ TypeScript knows user.name is string
console.log(user.unknown); // ❌ TypeScript error - property doesn't exist

// TypeScript validates body structure
const newUser = await client.call(createUserContract, {
  body: { name: 'John', email: 'john@example.com' } // ✅ Correct
  // body: { name: 123 } // ❌ TypeScript error - wrong type
});
// URL: POST /users (from contract.path: '/users')
```

### Environment Configuration

Configure base URL via environment variables:

```bash
# .env.local (Next.js)
NEXT_PUBLIC_API_URL=https://api.example.com

# .env (Other environments)
NEXT_PUBLIC_API_URL=http://localhost:4000
```

**Default:** `http://localhost:4000`

---

## API Reference

### `createClient(config?)`

Creates a new contract-based API client instance.

```typescript
import { createClient } from '@spfn/core/client';

const client = createClient({
  baseUrl: 'http://localhost:4000',
  headers: {
    'X-Custom-Header': 'value'
  },
  timeout: 30000 // 30 seconds
});
```

**Parameters:**

- `config?: ClientConfig` - Optional configuration
  - `baseUrl?: string` - API base URL (default: `process.env.NEXT_PUBLIC_API_URL` or `http://localhost:4000`)
  - `headers?: Record<string, string>` - Default headers for all requests
  - `timeout?: number` - Request timeout in milliseconds (default: 30000)
  - `fetch?: typeof fetch` - Custom fetch implementation (for testing)

**Returns:** `ContractClient` instance

---

### `client.call(contract, options?)`

Makes a type-safe API request using a contract. The URL is determined by `contract.path`.

```typescript
const user = await client.call(getUserContract, {
  params: { id: '123' },
  query: { include: 'posts' },
  headers: { 'Authorization': 'Bearer token' }
});
// URL: GET /users/123?include=posts (from contract.path: '/users/:id')
```

**Parameters:**

- `contract: RouteContract` - Route contract defining path, method, and types
- `options?: CallOptions<TContract>` - Request options
  - `params?: InferContract<TContract>['params']` - Path parameters for `:id` substitution
  - `query?: InferContract<TContract>['query']` - Query parameters
  - `body?: InferContract<TContract>['body']` - Request body (typed from contract)
  - `headers?: Record<string, string>` - Additional headers for this request
  - `baseUrl?: string` - Override base URL for this request

**Returns:** `Promise<InferContract<TContract>['response']>` - Typed response data

**Throws:** `ApiClientError` if response is not OK (status >= 400)

**Key Changes:**
- ✅ No more `path` parameter - URL comes from `contract.path`
- ✅ Contracts must use absolute paths (e.g., `/users/:id`)
- ✅ Cleaner API: `client.call(contract, options)` instead of `client.call(path, contract, options)`

---

### `client.use(interceptor)`

Adds a request interceptor. Interceptors can modify requests before they're sent.

```typescript
client.use(async (url, init) => {
  const token = await getAuthToken();
  return {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`
    }
  };
});
```

**Parameters:**

- `interceptor: RequestInterceptor` - Function that receives and can modify request
  - `url: string` - Full request URL
  - `init: RequestInit` - Fetch init object
  - Returns: `RequestInit` or `Promise<RequestInit>`

Interceptors are executed in the order they are added.

---

### `client.withConfig(config)`

Creates a new client with merged configuration. Useful for adding authentication tokens.

```typescript
const baseClient = createClient({ baseUrl: 'http://localhost:4000' });

// Create authenticated client
const authClient = baseClient.withConfig({
  headers: { 'Authorization': `Bearer ${token}` }
});

// authClient inherits baseUrl and adds Authorization header
const user = await authClient.call(getUserContract, {
  params: { id: 'me' }
});
```

**Parameters:**

- `config: Partial<ClientConfig>` - Configuration to merge

**Returns:** New `ContractClient` instance with merged config

---

### `ApiClientError`

Error class for failed API requests.

```typescript
try {
  const user = await client.call(getUserContract, {
    params: { id: '999' }
  });
} catch (error) {
  if (error instanceof ApiClientError) {
    console.log(error.status);      // 404
    console.log(error.url);         // "http://localhost:4000/users/999"
    console.log(error.response);    // Error body from server
    console.log(error.errorType);   // 'http' | 'network' | 'timeout'
    console.log(error.message);     // "GET /users/:id failed: 404 Not Found"
  }
}
```

**Properties:**

- `status: number` - HTTP status code (0 for network/timeout errors)
- `url: string` - Full URL that was requested
- `response?: unknown` - Parsed error response body (if available)
- `errorType?: 'http' | 'network' | 'timeout'` - Error classification
- `message: string` - Human-readable error message

**Type Guards:**

```typescript
import { isHttpError, isNetworkError, isTimeoutError } from '@spfn/core/client';

try {
  const data = await client.call(contract, options);
} catch (error) {
  if (isHttpError(error)) {
    // HTTP error (4xx, 5xx)
    console.log('Status:', error.status);
  } else if (isNetworkError(error)) {
    // Network connectivity issue
    console.log('Network error');
  } else if (isTimeoutError(error)) {
    // Request timed out
    console.log('Timeout');
  }
}
```

---

## Advanced Usage

### Path Parameter Substitution

Automatic replacement of `:param` placeholders from `contract.path`:

```typescript
// Single parameter
const getUserContract = {
  method: 'GET' as const,
  path: '/users/:id',  // ← Path defined in contract
  params: Type.Object({ id: Type.String() }),
  response: UserSchema
} as const satisfies RouteContract;

await client.call(getUserContract, {
  params: { id: '123' }
});
// → GET http://localhost:4000/users/123

// Multiple parameters
const getPostContract = {
  method: 'GET' as const,
  path: '/users/:userId/posts/:postId',  // ← Multiple params in path
  params: Type.Object({
    userId: Type.String(),
    postId: Type.String()
  }),
  response: PostSchema
} as const satisfies RouteContract;

await client.call(getPostContract, {
  params: { userId: '123', postId: '456' }
});
// → GET http://localhost:4000/users/123/posts/456

// Number parameters (auto-converted to string)
await client.call(getUserContract, {
  params: { id: 123 }
});
// → GET http://localhost:4000/users/123
```

---

### Query Parameters

Supports strings, numbers, booleans, and arrays:

```typescript
// Simple query parameters
const listUsersContract = {
  method: 'GET' as const,
  path: '/users',
  query: Type.Object({
    page: Type.String(),
    limit: Type.String()
  }),
  response: UsersListSchema
} as const satisfies RouteContract;

await client.call(listUsersContract, {
  query: { page: '1', limit: '10' }
});
// → GET /users?page=1&limit=10

// Array query parameters
const listPostsContract = {
  method: 'GET' as const,
  path: '/posts',
  query: Type.Object({
    tags: Type.Array(Type.String())
  }),
  response: PostsListSchema
} as const satisfies RouteContract;

await client.call(listPostsContract, {
  query: { tags: ['javascript', 'typescript'] }
});
// → GET /posts?tags=javascript&tags=typescript

// Mixed types
await client.call(listPostsContract, {
  query: {
    page: 1,              // number
    featured: true,       // boolean
    tags: ['js', 'ts']   // array
  }
});
// → GET /posts?page=1&featured=true&tags=js&tags=ts
```

---

### Request Body

Automatically JSON-stringified and typed:

```typescript
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

const createUserContract = {
  method: 'POST' as const,
  path: '/users',
  body: Type.Object({
    name: Type.String(),
    email: Type.String(),
    age: Type.Optional(Type.Number())
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String()
  })
} as const satisfies RouteContract;

// TypeScript validates body structure
const user = await client.call(createUserContract, {
  body: {
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  }
});
// ✅ Body is validated by TypeScript
// ✅ Automatically sets Content-Type: application/json
// ✅ Automatically JSON.stringify()
// URL: POST /users (from contract.path)
```

---

### Custom Headers

```typescript
// Default headers for all requests
const client = createClient({
  headers: {
    'X-API-Key': 'secret',
    'X-Client-Version': '1.0.0'
  }
});

// Override or add headers per request
await client.call(getUserContract, {
  params: { id: '123' },
  headers: {
    'X-Request-ID': 'abc123',
    'Authorization': 'Bearer token'
  }
});
// Headers are merged: X-API-Key, X-Client-Version, X-Request-ID, Authorization
```

---

### Timeout Control

```typescript
// Default timeout: 30 seconds
const client = createClient({ timeout: 30000 });

// Custom timeout per client
const fastClient = createClient({ timeout: 5000 }); // 5 seconds

try {
  const data = await fastClient.call(slowEndpointContract);
} catch (error) {
  if (isTimeoutError(error)) {
    console.log('Request timed out after 5 seconds');
  }
}
```

---

### Error Handling

```typescript
import { ApiClientError, isHttpError, isNetworkError, isTimeoutError } from '@spfn/core/client';

try {
  const user = await client.call(getUserContract, {
    params: { id: '123' }
  });
} catch (error) {
  if (isHttpError(error)) {
    // HTTP errors (4xx, 5xx)
    if (error.status === 404) {
      console.log('User not found');
    } else if (error.status === 401) {
      console.log('Unauthorized - redirect to login');
    } else if (error.status >= 500) {
      console.log('Server error - try again later');
    }

    // Access error details
    console.log(error.response); // Server error body
  } else if (isNetworkError(error)) {
    // Network connectivity issues
    console.log('Network error - check connection');
  } else if (isTimeoutError(error)) {
    // Request timeout
    console.log('Request timed out');
  }
}
```

---

## Integration Examples

### Auto-generated API Client

SPFN automatically generates a type-safe API client from your contracts:

```typescript
// src/lib/api.ts (auto-generated)
import { client } from '@spfn/core/client';
import { getUsersContract, getUserContract, createUserContract } from '@/lib/contracts/users';

export const api = {
  users: {
    list: () => client.call(getUsersContract),
    getById: (options: { params: { id: string } }) => client.call(getUserContract, options),
    create: (options: { body: CreateUserBody }) => client.call(createUserContract, options),
  }
} as const;

export { client };
```

```typescript
// Usage in your app - fully type-safe!
import { api } from '@/lib/api';

// ✅ No need to import contracts directly
const users = await api.users.list();
const user = await api.users.getById({ params: { id: '123' } });
const newUser = await api.users.create({
  body: { name: 'John', email: 'john@example.com' }
});
```

---

### Next.js App Router

```typescript
'use client';

import { api } from '@/lib/api';
import { useState, useEffect } from 'react';

export function UserList() {
  const [users, setUsers] = useState<Awaited<ReturnType<typeof api.users.list>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.users.list()
      .then(setUsers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

---

### React Query Integration

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { InferContract } from '@spfn/core';
import { createUserContract } from '@/lib/contracts/users';

// Query hook
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.users.list()
  });
}

// Mutation hook
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InferContract<typeof createUserContract>['body']) =>
      api.users.create({ body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
}

// Component usage
function UserManager() {
  const { data: users, isLoading } = useUsers();
  const createUser = useCreateUser();

  const handleCreate = () => {
    createUser.mutate({
      name: 'New User',
      email: 'new@example.com'
    });
  };

  return (
    <div>
      {users?.map(user => <div key={user.id}>{user.name}</div>)}
      <button onClick={handleCreate}>Create User</button>
    </div>
  );
}
```

---

### Request Interceptors

Add authentication, logging, or other cross-cutting concerns:

```typescript
import { client } from '@/lib/api';

// Add authentication header
client.use(async (url, init) => {
  const token = await getAuthToken();
  return {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`
    }
  };
});

// Add request logging
client.use(async (url, init) => {
  console.log(`[${init.method}] ${url}`);
  return init;
});

// Add request ID
client.use(async (url, init) => {
  return {
    ...init,
    headers: {
      ...init.headers,
      'X-Request-ID': crypto.randomUUID()
    }
  };
});

// All api.* calls will now include auth, logging, and request ID
const user = await api.users.getById({ params: { id: '123' } });
```

---

### Authentication Pattern

```typescript
import { client } from '@/lib/api';

// Configure client with auth token
export function configureAuth(token: string) {
  client.use(async (url, init) => {
    return {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${token}`
      }
    };
  });
}

// Usage in React component
function App() {
  const { token } = useAuth();

  useEffect(() => {
    if (token) {
      configureAuth(token);
    }
  }, [token]);

  // All API calls now authenticated
  return <UserList />;
}
```

---

## Comparison with Manual fetch

### Before (Manual typing)

```typescript
// ❌ No type safety, manual typing
const response = await fetch('http://localhost:4000/users/123');
const user: User = await response.json(); // Manual typing, no validation

// ❌ Manual URL construction
const userId = '123';
const url = `http://localhost:4000/users/${userId}`;

// ❌ Manual error handling
if (!response.ok) {
  throw new Error('Failed');
}

// ❌ No query param handling
const tags = ['js', 'ts'];
const queryString = tags.map(t => `tags=${t}`).join('&');
```

### After (Contract-based)

```typescript
// ✅ Full type safety from contract
const user = await api.users.getById({ params: { id: '123' } });
// TypeScript knows exact type of user
// URL automatically constructed from contract.path: '/users/:id'

// ✅ Automatic parameter substitution
// ✅ Automatic error handling with ApiClientError
// ✅ Timeout control
// ✅ Header management
// ✅ Query param handling
const posts = await api.posts.list({
  query: { tags: ['javascript', 'typescript'] }
});
```

---

## Best Practices

### 1. Use Auto-generated API Client

```typescript
// ✅ Good - Use auto-generated api object
import { api } from '@/lib/api';
const users = await api.users.list();

// ❌ Bad - Import contracts and call client manually
import { client } from '@spfn/core/client';
import { getUsersContract } from '@/lib/contracts/users';
const users = await client.call(getUsersContract);
```

### 2. Contracts Must Use Absolute Paths

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

### 3. Handle Errors Consistently

```typescript
// ✅ Good - Use type guards
import { isHttpError, isNetworkError, isTimeoutError } from '@spfn/core/client';

try {
  const data = await api.users.getById({ params: { id } });
} catch (error) {
  if (isHttpError(error)) {
    if (error.status === 404) {
      showNotFoundError();
    } else if (error.status === 401) {
      redirectToLogin();
    }
  } else if (isNetworkError(error)) {
    showOfflineMessage();
  } else if (isTimeoutError(error)) {
    showTimeoutError();
  }
}
```

### 4. Use Interceptors for Cross-cutting Concerns

```typescript
// ✅ Good - Centralized auth via interceptor
import { client } from '@/lib/api';

client.use(async (url, init) => {
  const token = await getAuthToken();
  return {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` }
  };
});

// ❌ Bad - Repeat auth header everywhere
await client.call(contract, {
  headers: { Authorization: `Bearer ${token}` }
});
```

---

## Migration from Old API

If you have existing code using the old `client.call(path, contract, options)` signature:

### Before

```typescript
// ❌ Old API - path as first parameter
const user = await client.call('/users/:id', getUserContract, {
  params: { id: '123' }
});

const users = await client.call('/users', getUsersContract);
```

### After

```typescript
// ✅ New API - contract only (path comes from contract.path)
const user = await client.call(getUserContract, {
  params: { id: '123' }
});
// URL: GET /users/123 (from contract.path: '/users/:id')

const users = await client.call(getUsersContract);
// URL: GET /users (from contract.path: '/users')
```

**Migration Steps:**
1. Ensure all contracts use absolute paths (e.g., `/users/:id` not `/:id`)
2. Move contracts to `src/lib/contracts/` if not already there
3. Remove the first `path` parameter from all `client.call()` calls
4. Use auto-generated `api` object instead of calling `client.call()` directly

---

## UniversalClient - Auto-routing Client

The `UniversalClient` automatically detects execution environment and routes requests accordingly:

- **Server Components**: Direct call to SPFN API server (internal network)
- **Client Components**: Proxies through Next.js API Route (enables cookie forwarding)

### Why UniversalClient?

When using authentication with HttpOnly cookies:

1. **Browser Security**: HttpOnly cookies cannot be accessed by JavaScript
2. **CORS Protection**: Direct browser → SPFN server calls require CORS configuration
3. **Cookie Forwarding**: API Routes can forward cookies to SPFN server

### Architecture

```
Client Component (Browser)
    ↓ fetch('/api/proxy/_auth/login')
Next.js API Route (/api/proxy/[...path])
    ↓ Forward cookies + request
SPFN API Server (http://localhost:8790)
```

### Setup

#### 1. Create API Route Proxy

Create `app/api/proxy/[...path]/route.ts` in your Next.js app:

```typescript
import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SPFN_API_URL = process.env.SERVER_API_URL || 'http://localhost:8790';

async function handleProxy(
    request: NextRequest,
    pathSegments: string[],
    method: string
): Promise<NextResponse>
{
    const path = `/${pathSegments.join('/')}`;
    const url = `${SPFN_API_URL}${path}`;

    // Get cookies from request
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('session');

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // Forward session cookie
    if (sessionCookie)
    {
        headers['Cookie'] = `session=${sessionCookie.value}`;
    }

    const init: RequestInit = { method, headers };

    // Forward body for POST/PUT/PATCH
    if (method === 'POST' || method === 'PUT' || method === 'PATCH')
    {
        const body = await request.text();
        if (body) init.body = body;
    }

    const response = await fetch(url, init);
    const data = await response.text();

    let jsonData;
    try
    {
        jsonData = JSON.parse(data);
    }
    catch (error)
    {
        jsonData = { data };
    }

    const nextResponse = NextResponse.json(jsonData, {
        status: response.status,
    });

    // Forward Set-Cookie header
    const setCookieHeader = response.headers.get('Set-Cookie');
    if (setCookieHeader)
    {
        nextResponse.headers.set('Set-Cookie', setCookieHeader);
    }

    return nextResponse;
}

export async function GET(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'GET');
}

export async function POST(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'POST');
}

export async function PUT(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'PUT');
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: { path: string[] } }
)
{
    return handleProxy(request, params.path, 'DELETE');
}
```

#### 2. Configure Environment Variables

```bash
# .env.local
SERVER_API_URL=http://localhost:8790
```

#### 3. Use UniversalClient

```typescript
import { createUniversalClient } from '@spfn/core/client';

const client = createUniversalClient();

// Server Component - direct call to SPFN API
const result = await client.call(contract, options);

// Client Component - proxies through /api/proxy
'use client';
const result = await client.call(contract, options); // Automatic
```

### API Reference

#### `createUniversalClient(config?)`

Creates a new universal API client.

```typescript
const client = createUniversalClient({
  apiUrl: 'http://localhost:8790',  // Server-side direct calls
  proxyBasePath: '/api/proxy',       // Client-side proxy path
  headers: { 'X-Custom': 'value' },
  timeout: 30000,
});
```

**Parameters:**

- `config?: UniversalClientConfig`
  - `apiUrl?: string` - SPFN API server URL (default: `process.env.SERVER_API_URL` or `http://localhost:8790`)
  - `proxyBasePath?: string` - Next.js API route path (default: `/api/proxy`)
  - `headers?: Record<string, string>` - Default headers
  - `timeout?: number` - Request timeout in milliseconds
  - `fetch?: typeof fetch` - Custom fetch implementation

#### `client.call(contract, options?)`

Identical to `ContractClient.call()` - automatically routes based on environment.

#### `client.isServerEnv()`

Check if currently running in server environment:

```typescript
const client = createUniversalClient();
console.log(client.isServerEnv()); // true (server), false (browser)
```

### Usage Examples

#### Server Component (Direct Call)

```typescript
// app/dashboard/page.tsx
import { createUniversalClient } from '@spfn/core/client';
import { loginContract } from '@/lib/contracts/auth';

export default async function DashboardPage()
{
    const client = createUniversalClient();

    // Runs on server → direct call to SPFN API
    const result = await client.call(loginContract, {
        body: { email: 'user@example.com', password: 'pass123' }
    });

    return <div>User: {result.userId}</div>;
}
```

#### Client Component (Proxied Call)

```typescript
// app/login/LoginForm.tsx
'use client';

import { useState } from 'react';
import { createUniversalClient } from '@spfn/core/client';
import { loginContract } from '@/lib/contracts/auth';

export default function LoginForm()
{
    const [email, setEmail] = useState('');

    const handleLogin = async () =>
    {
        const client = createUniversalClient();

        // Runs in browser → proxies through /api/proxy/_auth/login
        // Cookies are automatically forwarded
        const result = await client.call(loginContract, {
            body: { email, password: 'pass123' }
        });

        console.log('Logged in:', result.userId);
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <button type="submit">Login</button>
        </form>
    );
}
```

### Custom Proxy Path

To use a different proxy path:

```typescript
// app/layout.tsx
import { configureUniversalClient } from '@spfn/core/client';

configureUniversalClient({
    proxyBasePath: '/api/spfn', // Custom path
});
```

Then create your proxy at `app/api/spfn/[...path]/route.ts` instead.

### Security Considerations

#### Cookie Security

Ensure cookies are set with secure attributes:

```typescript
// In SPFN API login route
c.header(
    'Set-Cookie',
    `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`
);
```

**Attributes:**
- `HttpOnly`: Prevents JavaScript access
- `Secure`: HTTPS only (disable in development)
- `SameSite=Strict`: CSRF protection
- `Path=/`: Available on all routes
- `Max-Age`: Expiry time (7 days = 604800 seconds)

#### Environment Detection

UniversalClient detects environment using:

1. `process.env.SERVER_API_URL` (server-only)
2. `process.env.SPFN_API_URL` (server-only)
3. `process.env.NODE_ENV` (server-only)

If any of these exist, it's considered server environment.

### Troubleshooting

#### Problem: Cookies not being forwarded

**Solution:** Check:
1. Cookies are set with correct domain
2. `credentials: 'include'` in fetch options (automatic in UniversalClient)
3. CORS is configured properly (if needed)

#### Problem: 404 on proxy route

**Solution:** Verify:
1. File is at: `app/api/proxy/[...path]/route.ts`
2. File exports GET, POST, etc. functions
3. Next.js dev server was restarted

#### Problem: Direct calls in browser

**Solution:** Check environment variable detection:
```typescript
console.log('SERVER_API_URL:', process.env.SERVER_API_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
```

If `process.env` is undefined in browser, the client will use proxy.

---

## Limitations

### JSON Only

Only supports JSON request/response bodies. For other content types (FormData, Blob, etc.), use native `fetch` or FormData-specific endpoints.

### No Streaming Support

Does not support streaming responses. For streaming, use native `fetch` with ReadableStream.

---

## Related

- [@spfn/core/route](../route/README.md) - Server-side routing with contracts
- [@spfn/core/codegen](../codegen/README.md) - Auto-generate API client
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema definitions
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)