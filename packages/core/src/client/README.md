# @spfn/core/client - Contract-based HTTP Client

Type-safe HTTP client with end-to-end type safety using RouteContract.

## Features

- ✅ **End-to-End Type Safety**: Full TypeScript inference from server contracts
- ✅ **Contract-based**: Shares types with server routes via RouteContract
- ✅ **Zero Runtime Validation**: Types only, no schema validation overhead
- ✅ **Path Parameters**: Automatic `:id` substitution
- ✅ **Query Parameters**: Support for strings, numbers, arrays
- ✅ **Timeout Control**: Built-in AbortController with configurable timeout
- ✅ **Error Handling**: Structured ApiClientError with status codes
- ✅ **Next.js Safe**: No server dependencies, safe for client components
- ✅ **Minimal**: Uses native `fetch` API, zero dependencies

---

## Quick Start

### Installation

```bash
pnpm install @spfn/core
```

### Basic Usage

```typescript
import { createClient } from '@spfn/core/client';
import { getUserContract, createUserContract } from './contracts';

// Create client instance
const client = createClient({
  baseUrl: 'http://localhost:4000'
});

// GET request - fully typed from contract
const user = await client.call('/users/:id', getUserContract, {
  params: { id: '123' }
});
// ✅ user.name is typed based on contract.response

// POST request - body and response typed
const newUser = await client.call('/users', createUserContract, {
  body: { name: 'John', email: 'john@example.com' }
});
// ✅ TypeScript validates body matches contract.body
// ✅ newUser is typed from contract.response
```

---

## Core Concepts

### Contract-based Type Safety

The client integrates with your server-side `RouteContract` definitions for full type safety:

```typescript
// contracts/users.ts - Shared between client and server
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

export const getUserContract = {
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
// client code - Full type safety
import { createClient } from '@spfn/core/client';
import { getUserContract, createUserContract } from './contracts';

const client = createClient();

// TypeScript knows the exact shape of user
const user = await client.call('/users/:id', getUserContract, {
  params: { id: '123' }
});

console.log(user.name); // ✅ TypeScript knows user.name is string
console.log(user.unknown); // ❌ TypeScript error - property doesn't exist

// TypeScript validates body structure
const newUser = await client.call('/users', createUserContract, {
  body: { name: 'John', email: 'john@example.com' } // ✅ Correct
  // body: { name: 123 } // ❌ TypeScript error - wrong type
});
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

### `client.call(path, contract, options?)`

Makes a type-safe API request using a contract.

```typescript
const user = await client.call('/users/:id', getUserContract, {
  params: { id: '123' },
  query: { include: 'posts' },
  headers: { 'Authorization': 'Bearer token' }
});
```

**Parameters:**

- `path: string` - API endpoint (supports `:param` placeholders)
- `contract: RouteContract` - Route contract defining request/response types
- `options?: CallOptions<TContract>` - Request options
  - `params?: Record<string, string | number>` - Path parameters for `:id` substitution
  - `query?: Record<string, string | string[] | number | boolean>` - Query parameters
  - `body?: InferContract<TContract>['body']` - Request body (typed from contract)
  - `headers?: Record<string, string>` - Additional headers for this request
  - `baseUrl?: string` - Override base URL for this request

**Returns:** `Promise<InferContract<TContract>['response']>` - Typed response data

**Throws:** `ApiClientError` if response is not OK (status >= 400)

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
const user = await authClient.call('/users/me', getUserContract);
```

**Parameters:**

- `config: Partial<ClientConfig>` - Configuration to merge

**Returns:** New `ContractClient` instance with merged config

---

### `ApiClientError`

Error class for failed API requests.

```typescript
try {
  const user = await client.call('/users/:id', getUserContract, {
    params: { id: '999' }
  });
} catch (error) {
  if (error instanceof ApiClientError) {
    console.log(error.status);      // 404
    console.log(error.statusText);  // "Not Found"
    console.log(error.url);         // "http://localhost:4000/users/999"
    console.log(error.response);    // Error body from server
    console.log(error.message);     // "GET /users/999 failed: 404 Not Found"
  }
}
```

**Properties:**

- `status: number` - HTTP status code (0 for network errors)
- `statusText: string` - HTTP status text
- `url: string` - Full URL that was requested
- `response?: unknown` - Parsed error response body (if available)
- `message: string` - Human-readable error message

---

## Advanced Usage

### Path Parameter Substitution

Automatic replacement of `:param` placeholders:

```typescript
// Single parameter
await client.call('/users/:id', contract, {
  params: { id: '123' }
});
// → GET http://localhost:4000/users/123

// Multiple parameters
await client.call('/users/:userId/posts/:postId', contract, {
  params: { userId: '123', postId: '456' }
});
// → GET http://localhost:4000/users/123/posts/456

// Number parameters (auto-converted to string)
await client.call('/users/:id', contract, {
  params: { id: 123 }
});
// → GET http://localhost:4000/users/123
```

---

### Query Parameters

Supports strings, numbers, booleans, and arrays:

```typescript
// Simple query parameters
await client.call('/users', listUsersContract, {
  query: { page: '1', limit: '10' }
});
// → GET /users?page=1&limit=10

// Array query parameters
await client.call('/posts', listPostsContract, {
  query: { tags: ['javascript', 'typescript'] }
});
// → GET /posts?tags=javascript&tags=typescript

// Mixed types
await client.call('/posts', listPostsContract, {
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
const user = await client.call('/users', createUserContract, {
  body: {
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  }
});
// ✅ Body is validated by TypeScript
// ✅ Automatically sets Content-Type: application/json
// ✅ Automatically JSON.stringify()
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
await client.call('/users', contract, {
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
  const data = await fastClient.call('/slow-endpoint', contract);
} catch (error) {
  if (error instanceof ApiClientError && error.statusText === 'Timeout') {
    console.log('Request timed out after 5 seconds');
  }
}
```

---

### Error Handling

```typescript
import { ApiClientError } from '@spfn/core/client';

try {
  const user = await client.call('/users/:id', getUserContract, {
    params: { id: '123' }
  });
} catch (error) {
  if (error instanceof ApiClientError) {
    // HTTP errors (4xx, 5xx)
    if (error.status === 404) {
      console.log('User not found');
    } else if (error.status === 401) {
      console.log('Unauthorized - redirect to login');
    } else if (error.status >= 500) {
      console.log('Server error - try again later');
    }

    // Network errors
    if (error.status === 0) {
      console.log('Network error - check connection');
    }

    // Access error details
    console.log(error.response); // Server error body
  }
}
```

---

## Integration Examples

### Next.js App Router

```typescript
'use client';

import { createClient } from '@spfn/core/client';
import { getUsersContract } from '@/contracts/users';
import { useState, useEffect } from 'react';

const client = createClient(); // Uses NEXT_PUBLIC_API_URL

export function UserList() {
  const [users, setUsers] = useState<InferContract<typeof getUsersContract>['response']>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.call('/users', getUsersContract)
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
import { createClient } from '@spfn/core/client';
import { getUsersContract, createUserContract } from '@/contracts/users';

const client = createClient();

// Query hook
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => client.call('/users', getUsersContract)
  });
}

// Mutation hook
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InferContract<typeof createUserContract>['body']) =>
      client.call('/users', createUserContract, { body: data }),
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

### Service Layer Pattern

```typescript
import { createClient, type ContractClient } from '@spfn/core/client';
import type { InferContract } from '@spfn/core';
import {
  getUsersContract,
  getUserContract,
  createUserContract,
  updateUserContract,
  deleteUserContract
} from '@/contracts/users';

class UserService {
  constructor(private client: ContractClient) {}

  async getAll() {
    return this.client.call('/users', getUsersContract);
  }

  async getById(id: string) {
    return this.client.call('/users/:id', getUserContract, {
      params: { id }
    });
  }

  async create(data: InferContract<typeof createUserContract>['body']) {
    return this.client.call('/users', createUserContract, {
      body: data
    });
  }

  async update(id: string, data: InferContract<typeof updateUserContract>['body']) {
    return this.client.call('/users/:id', updateUserContract, {
      params: { id },
      body: data
    });
  }

  async delete(id: string) {
    return this.client.call('/users/:id', deleteUserContract, {
      params: { id }
    });
  }
}

// Export singleton instance
export const userService = new UserService(createClient());

// Usage
const users = await userService.getAll();
const user = await userService.getById('123');
```

---

### Authentication Pattern

```typescript
import { createClient } from '@spfn/core/client';

// Base client (public endpoints)
const publicClient = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL
});

// Create authenticated client factory
export function createAuthClient(token: string) {
  return publicClient.withConfig({
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
}

// Usage in React component
function ProtectedComponent() {
  const token = useAuthToken(); // Your auth hook
  const authClient = createAuthClient(token);

  const fetchPrivateData = async () => {
    const data = await authClient.call('/private/data', contract);
    return data;
  };

  // ...
}
```

---

## Comparison with Simple HTTP Client

### Before (Manual typing)

```typescript
// ❌ No type safety, manual typing
const response = await fetch('http://localhost:4000/users/123');
const user: User = await response.json(); // Manual typing, no validation

// ❌ Manual parameter substitution
const userId = '123';
const url = `http://localhost:4000/users/${userId}`;

// ❌ Manual error handling
if (!response.ok) {
  throw new Error('Failed');
}
```

### After (Contract-based)

```typescript
// ✅ Full type safety from contract
const user = await client.call('/users/:id', getUserContract, {
  params: { id: '123' }
});
// TypeScript knows exact type of user

// ✅ Automatic parameter substitution
// ✅ Automatic error handling with ApiClientError
// ✅ Timeout control
// ✅ Header management
```

---

## Best Practices

### 1. Share Contracts Between Client and Server

```typescript
// ✅ Good - Single source of truth
// contracts/users.ts (shared)
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

export const getUserContract = {
  params: Type.Object({ id: Type.String() }),
  response: Type.Object({ id: Type.Number(), name: Type.String() })
} as const satisfies RouteContract;

// server/routes/users/[id].ts
import { getUserContract } from '@/contracts/users';
app.get('/', bind(getUserContract, handler));

// client/services/users.ts
import { getUserContract } from '@/contracts/users';
const user = await client.call('/users/:id', getUserContract, { params: { id } });
```

### 2. Use Service Layer

```typescript
// ✅ Good - Encapsulate API calls
class UserService {
  constructor(private client: ContractClient) {}
  async getById(id: string) { /* ... */ }
}
export const userService = new UserService(createClient());

// ❌ Bad - Direct client calls everywhere
const user = await client.call('/users/:id', contract, { params: { id } });
```

### 3. Handle Errors Consistently

```typescript
// ✅ Good - Centralized error handling
async function safeApiCall<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiClientError) {
      if (error.status === 401) {
        redirectToLogin();
      } else {
        showErrorToast(error.message);
      }
    }
    return null;
  }
}

// Usage
const user = await safeApiCall(() =>
  client.call('/users/:id', contract, { params: { id } })
);
```

### 4. Use withConfig for Auth

```typescript
// ✅ Good - Reusable authenticated client
const authClient = baseClient.withConfig({
  headers: { Authorization: `Bearer ${token}` }
});

// ❌ Bad - Repeat auth header everywhere
await client.call('/endpoint', contract, {
  headers: { Authorization: `Bearer ${token}` }
});
```

---

## Request Interceptors

Add request interceptors to modify requests before they're sent:

```typescript
const client = createClient({
  baseUrl: 'http://localhost:4000'
});

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

// All requests will now include auth and logging
const user = await client.call('/users/:id', contract, { params: { id: '123' } });
```

Interceptors are executed in the order they are added.

---

## Limitations

### JSON Only

Only supports JSON request/response bodies. For other content types (FormData, Blob, etc.), use native `fetch`:

```typescript
// Use native fetch for file uploads
const formData = new FormData();
formData.append('file', file);
await fetch('/api/upload', { method: 'POST', body: formData });
```

### No Request Cancellation API

Uses AbortController internally for timeout, but doesn't expose cancellation API. For manual cancellation:

```typescript
const controller = new AbortController();
const customFetch = (url: RequestInfo, init?: RequestInit) =>
  fetch(url, { ...init, signal: controller.signal });

const client = createClient({ fetch: customFetch });

// Later: controller.abort();
```

---

## Related

- [RouteContract Type Reference](../route/types.ts) - Contract type definitions
- [Server Route Binding](../route/README.md) - Server-side bind() function
- [Next.js Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)
- [TypeBox Schema](https://github.com/sinclairzx81/typebox) - Schema definitions
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)