---
title: "Your First API"
description: "Create your first type-safe API with Superfunction"
order: 5
available: true
---

# Your First API

Learn how to create a fully type-safe API endpoint in three steps: define a route, register it, and use it in your Next.js app.

## Step 1: Define the Route

Routes are defined using the `route` helper with TypeBox schemas for validation.

```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import { NotFoundError } from '@spfn/core/errors';
import { UserRepository } from '../repositories/user.repository';

const userRepo = new UserRepository();

/**
 * POST /users - Create a new user
 */
export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            name: Type.String(),
            email: Type.String({ format: 'email' })
        })
    })
    .handler(async (c) => {
        const { body } = await c.data();

        const user = await userRepo.create({
            name: body.name,
            email: body.email
        });

        return c.created(user);
    });

/**
 * GET /users/:id - Get user by ID
 */
export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({
            id: Type.String()
        })
    })
    .handler(async (c) => {
        const { params } = await c.data();

        const user = await userRepo.findById(params.id);

        if (!user) {
            throw new NotFoundError({ resource: 'User' });
        }

        return user;
    });
```

## Step 2: Register Routes

Add your routes to the application router for type inference and client generation.

```typescript
// src/server/router.ts
import { defineRouter } from '@spfn/core/route';
import { createUser, getUser } from './routes/users';

export const appRouter = defineRouter({
    createUser,
    getUser,
    // ... other routes
});

export type AppRouter = typeof appRouter;
```

## Step 3: Generate Client & Use in Next.js

Generate a type-safe client and use it anywhere in your Next.js app.

```bash
# Generate type-safe client
pnpm spfn codegen router
```

```typescript
// app/page.tsx
'use client';

import { api } from '@/lib/api-client';
import { NotFoundError } from '@spfn/core/errors';

export default function Home() {
    const handleCreateUser = async () => {
        // Create user - fully typed!
        const user = await api.createUser
            .body({
                name: 'John Doe',
                email: 'john@example.com'
            })
            .call();

        console.log(user.id);  // ✅ Typed!
    };

    const handleGetUser = async (id: string) => {
        try {
            const user = await api.getUser
                .params({ id })
                .call();

            console.log(user.name);  // ✅ Typed!
        } catch (error) {
            if (error instanceof NotFoundError) {
                console.log('User not found:', error.resource);
            }
        }
    };

    return (
        <button onClick={handleCreateUser}>
            Create User
        </button>
    );
}
```

> **That's it!**
>
> You've created your first type-safe API with Superfunction. The types flow automatically from route definition to client usage.

## What Happens Behind the Scenes?

1. Superfunction validates request body against the TypeBox schema
2. TypeScript ensures your handler returns the correct response type
3. The CLI generates a type-safe client with full autocomplete
4. All types are inferred—no manual type definitions needed!

## Route Builder API

The route builder provides a chainable API:

```typescript
route.get('/path/:id')      // HTTP method + path
    .input({                // Input validation
        params: Type.Object({ id: Type.String() }),
        query: Type.Object({ limit: Type.Number() }),
        body: Type.Object({ name: Type.String() }),
        headers: Type.Object({ authorization: Type.String() }),
    })
    .middleware([auth])     // Route-specific middleware
    .skip(['rateLimit'])    // Skip global middleware
    .handler(async (c) => { // Handler function
        const { params, query, body, headers } = await c.data();
        return { ... };
    });
```

## Response Helpers

The context provides convenient response helpers:

```typescript
.handler(async (c) => {
    // Return data directly (200 OK)
    return { id: '123', name: 'John' };

    // Or use response helpers:
    return c.created(user);           // 201 Created
    return c.accepted({ jobId });     // 202 Accepted
    return c.noContent();             // 204 No Content
    return c.paginated(items, page, limit, total);  // Paginated response
});
```

## Next Steps

### Core Concepts

Dive deeper into routes, middleware, and type safety.

[Learn Core Concepts →](/docs/core-concepts/how-it-works)

### Guides

Learn how to handle authentication, transactions, and more.

[Browse Guides →](/docs/guides/database)
