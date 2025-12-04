---
title: "Type Safety"
description: "Learn how Superfunction ensures end-to-end type safety from routes to frontend"
order: 4
available: true
---

# Type Safety

Superfunction provides end-to-end type safety from route definition to frontend usage, with zero manual type definitions.

## How Type Safety Works

Type safety flows through your entire application:

1. **Route Definition** - Define API with TypeBox schemas
2. **Handler Types** - Context automatically infers types from input
3. **Code Generation** - CLI generates type-safe client
4. **Frontend Usage** - Import and use with full TypeScript autocomplete

## Backend Type Inference

### Input Types

Handler context automatically infers types from `.input()`:

```typescript
export const updateUser = route.put('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
            name: Type.String(),
            email: Type.Optional(Type.String())
        })
    })
    .handler(async (c) => {
        const { params, body } = await c.data();

        // params.id: string (inferred)
        // body.name: string (inferred)
        // body.email: string | undefined (inferred)

        const user = await userRepo.update(params.id, body);
        return user;
    });
```

### Response Types

Return type is inferred from the handler:

```typescript
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        const user = await userRepo.findById(params.id);

        // Return type is inferred: { id: string, name: string, email: string }
        return user;
    });
```

### Explicit Response Type

For complex types, you can explicitly type the handler:

```typescript
type UserResponse =
    | { status: 'found'; user: User }
    | { status: 'not_found' };

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler<UserResponse>(async (c) => {
        const { params } = await c.data();
        const user = await userRepo.findById(params.id);

        if (!user) {
            return { status: 'not_found' };
        }

        return { status: 'found', user };
    });
```

## Client Type Safety

### Generated Client

The generated client provides full type safety:

```typescript
// Generated: src/lib/api-client.ts
import { api } from '@/lib/api-client';

// Params are type-checked
const user = await api.getUser
    .params({ id: '123' })  // Must be { id: string }
    .call();

// Response is fully typed
console.log(user.name);   // string
console.log(user.invalid); // ❌ TypeScript error!
```

### tRPC-Style Chaining

The client uses chainable methods for different input types:

```typescript
// GET with params
await api.getUser
    .params({ id: '123' })
    .call();

// GET with query
await api.listUsers
    .query({ limit: 10, offset: 0 })
    .call();

// POST with body
await api.createUser
    .body({ name: 'John', email: 'john@example.com' })
    .call();

// PUT with params and body
await api.updateUser
    .params({ id: '123' })
    .body({ name: 'John Updated' })
    .call();

// With headers
await api.protectedRoute
    .headers({ authorization: 'Bearer token' })
    .call();
```

## Compile-Time Error Checking

TypeScript catches errors at compile time:

### Missing Required Fields

```typescript
// ❌ TypeScript Error: Property 'email' is missing
await api.createUser
    .body({
        name: 'John'
        // Missing required 'email' field!
    })
    .call();

// ✅ Correct
await api.createUser
    .body({
        name: 'John',
        email: 'john@example.com'
    })
    .call();
```

### Wrong Field Types

```typescript
// ❌ TypeScript Error: Type 'number' is not assignable to type 'string'
await api.createUser
    .body({
        name: 123,  // Should be string!
        email: 'john@example.com'
    })
    .call();
```

### Invalid Response Access

```typescript
const user = await api.getUser.params({ id: '123' }).call();

user.name;     // ✅ OK - property exists
user.invalid;  // ❌ TypeScript Error: Property 'invalid' does not exist
```

## Type-Safe Error Handling

### Error Instance Checks

```typescript
import { NotFoundError, ValidationError } from '@spfn/core/errors';

try {
    const user = await api.getUser.params({ id: '999' }).call();
} catch (error) {
    if (error instanceof NotFoundError) {
        // error.resource is typed
        console.log('Not found:', error.resource);
    }

    if (error instanceof ValidationError) {
        // error.fields is typed
        error.fields?.forEach(field => {
            console.log(`${field.path}: ${field.message}`);
        });
    }
}
```

### Error Properties

Each error type has typed properties:

```typescript
// NotFoundError
error.resource    // string | undefined
error.statusCode  // 404

// ValidationError
error.fields      // Array<{ path: string, message: string, value?: any }>
error.statusCode  // 400

// TooManyRequestsError
error.retryAfter  // number | undefined
error.statusCode  // 429
```

## Frontend Integration

### React Components

```typescript
'use client';

import { api } from '@/lib/api-client';
import { useState, useEffect } from 'react';

// Type is inferred from api.getUser response
type User = Awaited<ReturnType<typeof api.getUser.call>>;

export function UserProfile({ id }: { id: string }) {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        api.getUser.params({ id }).call()
            .then(setUser);
    }, [id]);

    if (!user) return <div>Loading...</div>;

    return (
        <div>
            <h1>{user.name}</h1>      {/* ✅ Typed */}
            <p>{user.email}</p>       {/* ✅ Typed */}
        </div>
    );
}
```

### Form Handling

```typescript
'use client';

import { api } from '@/lib/api-client';
import { useState } from 'react';

// Extract body type from route
type CreateUserInput = Parameters<typeof api.createUser.body>[0];

export function CreateUserForm() {
    const [formData, setFormData] = useState<CreateUserInput>({
        name: '',
        email: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // TypeScript ensures formData matches expected type
        const user = await api.createUser.body(formData).call();
        console.log('Created:', user.id);
    };

    return (
        <form onSubmit={handleSubmit}>
            <input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
            <input
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
            <button type="submit">Create</button>
        </form>
    );
}
```

### Server Components

```typescript
// app/users/[id]/page.tsx
import { api } from '@/lib/api-client';

export default async function UserPage({ params }: { params: { id: string } }) {
    const user = await api.getUser.params({ id: params.id }).call();

    return (
        <div>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
        </div>
    );
}
```

## Runtime vs Compile-Time

Superfunction provides both:

**Runtime Safety:**
- Request validation with TypeBox
- Automatic type conversion
- Structured error responses
- Schema constraints (minLength, pattern, etc.)

**Compile-Time Safety:**
- TypeScript type checking
- IDE autocomplete
- Refactoring support
- Catch errors before deployment

## Best Practices

### 1. Let TypeScript Infer

Don't manually define types - let TypeScript infer from routes:

```typescript
// ✅ Good - Type inferred from api
type User = Awaited<ReturnType<typeof api.getUser.call>>;

// ❌ Bad - Manual type definition that can drift
type User = {
    id: string;
    name: string;
};
```

### 2. Use Strict TypeScript

Enable strict mode in `tsconfig.json`:

```json
{
    "compilerOptions": {
        "strict": true,
        "noUncheckedIndexedAccess": true
    }
}
```

### 3. Handle Errors Type-Safely

```typescript
import { NotFoundError } from '@spfn/core/errors';

try {
    const user = await api.getUser.params({ id }).call();
    return user;
} catch (error) {
    if (error instanceof NotFoundError) {
        return null;  // Handle gracefully
    }
    throw error;  // Re-throw unexpected errors
}
```

> **Next:** Learn how client generation works.
>
> [Client Generation →](/docs/core-concepts/client-generation)