# @spfn/core/client - HTTP Client

Minimal type-safe HTTP client for browser and Next.js client components.

## Features

- ✅ **Type-Safe**: Full TypeScript support with generics
- ✅ **Zero Dependencies**: Uses native `fetch` API
- ✅ **Next.js Safe**: No server dependencies, safe for client components
- ✅ **URL Parameters**: Automatic path parameter substitution
- ✅ **REST Methods**: GET, POST, PATCH, DELETE support
- ✅ **Environment-Aware**: Configurable base URL via env variables

---

## Quick Start

### Installation

```bash
pnpm install @spfn/core
```

### Basic Usage

```typescript
import { get, post, patch, del } from '@spfn/core/client';

// GET request
const users = await get<User[]>('/users');

// POST request
const newUser = await post<CreateUserDto, User>('/users', {
  body: { name: 'John', email: 'john@example.com' }
});

// PATCH request
const updated = await patch<UpdateUserDto, User>('/users/:id', {
  params: { id: '123' },
  body: { name: 'Jane' }
});

// DELETE request
await del('/users/:id', { params: { id: '123' } });
```

---

## Environment Configuration

### Base URL

Configure the API base URL using environment variables:

```bash
# .env.local (Next.js)
NEXT_PUBLIC_API_URL=https://api.example.com

# .env (Other environments)
NEXT_PUBLIC_API_URL=http://localhost:4000
```

**Default:** `http://localhost:4000`

---

## API Reference

### `get<T>(url, options?)`

Perform a GET request.

```typescript
import { get } from '@spfn/core/client';

// Simple GET
const users = await get<User[]>('/users');

// With path parameters
const user = await get<User>('/users/:id', {
  params: { id: '123' }
});
```

**Parameters:**
- `url: string` - API endpoint (supports `:param` placeholders)
- `options?: RequestOptions` - Optional request configuration
  - `params?: Record<string, string>` - Path parameters for substitution

**Returns:** `Promise<T>` - Typed response data

**Throws:** `Error` if response is not OK (status >= 400)

---

### `post<TRequest, TResponse>(url, options?)`

Perform a POST request.

```typescript
import { post } from '@spfn/core/client';

// Create user
const newUser = await post<CreateUserDto, User>('/users', {
  body: {
    name: 'John Doe',
    email: 'john@example.com'
  }
});

// With path parameters
const comment = await post<CreateCommentDto, Comment>('/posts/:id/comments', {
  params: { id: '456' },
  body: { text: 'Great post!' }
});
```

**Parameters:**
- `url: string` - API endpoint
- `options?: RequestOptions<TRequest>` - Request configuration
  - `params?: Record<string, string>` - Path parameters
  - `body?: TRequest` - Request body (will be JSON stringified)

**Returns:** `Promise<TResponse>` - Typed response data

---

### `patch<TRequest, TResponse>(url, options?)`

Perform a PATCH request.

```typescript
import { patch } from '@spfn/core/client';

// Update user
const updated = await patch<UpdateUserDto, User>('/users/:id', {
  params: { id: '123' },
  body: { name: 'Jane Doe' }
});
```

**Parameters:**
- `url: string` - API endpoint
- `options?: RequestOptions<TRequest>` - Request configuration

**Returns:** `Promise<TResponse>` - Typed response data

---

### `del<T>(url, options?)`

Perform a DELETE request.

```typescript
import { del } from '@spfn/core/client';

// Delete user
await del('/users/:id', {
  params: { id: '123' }
});

// With response data
const deleted = await del<User>('/users/:id', {
  params: { id: '123' }
});
```

**Parameters:**
- `url: string` - API endpoint
- `options?: RequestOptions` - Request configuration

**Returns:** `Promise<T>` - Typed response data

---

## Advanced Usage

### Type Safety with Generics

```typescript
// Define your types
interface User {
  id: string;
  name: string;
  email: string;
}

interface CreateUserDto {
  name: string;
  email: string;
}

interface UpdateUserDto {
  name?: string;
  email?: string;
}

// Use with full type safety
const user = await get<User>('/users/123');
const created = await post<CreateUserDto, User>('/users', {
  body: { name: 'John', email: 'john@example.com' }
});
```

### Path Parameter Substitution

```typescript
// Single parameter
await get('/users/:id', { params: { id: '123' } });
// → GET /users/123

// Multiple parameters
await get('/users/:userId/posts/:postId', {
  params: { userId: '123', postId: '456' }
});
// → GET /users/123/posts/456

// Nested resources
await post('/orgs/:orgId/teams/:teamId/members', {
  params: { orgId: '1', teamId: '2' },
  body: { userId: '3' }
});
// → POST /orgs/1/teams/2/members
```

### Error Handling

```typescript
import { get } from '@spfn/core/client';

try {
  const user = await get<User>('/users/123');
} catch (error) {
  if (error instanceof Error) {
    console.error('Request failed:', error.message);
    // Example: "GET /users/123 failed: 404"
  }
}
```

### Next.js Integration

```typescript
'use client';

import { get, post } from '@spfn/core/client';
import { useState, useEffect } from 'react';

export function UserList() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    get<User[]>('/users').then(setUsers);
  }, []);

  const handleCreate = async (data: CreateUserDto) => {
    const newUser = await post<CreateUserDto, User>('/users', {
      body: data
    });
    setUsers([...users, newUser]);
  };

  return (
    <div>
      {users.map(user => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

### React Query Integration

```typescript
import { useQuery, useMutation } from '@tanstack/react-query';
import { get, post } from '@spfn/core/client';

// Fetch users
function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => get<User[]>('/users')
  });
}

// Create user mutation
function useCreateUser() {
  return useMutation({
    mutationFn: (data: CreateUserDto) =>
      post<CreateUserDto, User>('/users', { body: data })
  });
}
```

---

## Use Cases

### RESTful API Client

```typescript
class UserService {
  async getAll() {
    return get<User[]>('/users');
  }

  async getById(id: string) {
    return get<User>('/users/:id', { params: { id } });
  }

  async create(data: CreateUserDto) {
    return post<CreateUserDto, User>('/users', { body: data });
  }

  async update(id: string, data: UpdateUserDto) {
    return patch<UpdateUserDto, User>('/users/:id', {
      params: { id },
      body: data
    });
  }

  async delete(id: string) {
    return del('/users/:id', { params: { id } });
  }
}

export const userService = new UserService();
```

### Form Submission

```typescript
async function handleSubmit(formData: FormData) {
  const data = {
    name: formData.get('name') as string,
    email: formData.get('email') as string
  };

  try {
    const user = await post<CreateUserDto, User>('/users', {
      body: data
    });
    console.log('User created:', user);
  } catch (error) {
    console.error('Failed to create user:', error);
  }
}
```

---

## Limitations

### No Request Interceptors

This is a minimal client. For advanced features like:
- Request/response interceptors
- Automatic retries
- Request cancellation
- Upload progress

Consider using a full-featured library like `axios` or `ky`.

### No Query Parameters

Currently only supports path parameters. For query strings:

```typescript
// Manual query string construction
const params = new URLSearchParams({ page: '1', limit: '10' });
const users = await get<User[]>(`/users?${params}`);
```

### JSON Only

Only supports JSON request/response bodies. For FormData or other content types, use native `fetch` directly.

---

## Related

- [fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) - Native browser API
- [Next.js Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components) - Safe for client-side use
- [@spfn/core](../../README.md) - Main package documentation