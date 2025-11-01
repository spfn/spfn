---
title: "Your First API"
description: "Create your first type-safe API with Superfunction"
order: 5
available: true
---

# Your First API

Learn how to create a fully type-safe API endpoint in three steps: define a contract, implement the route, and use it in your Next.js app.

## Step 1: Define the Contract

Contracts define the shape of your API using TypeBox schemas. They're shared between backend and frontend.

```typescript
// src/lib/contracts/users.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core';

export const createUserContract = {
  method: 'POST',
  path: '/users',
  body: Type.Object({
    name: Type.String(),
    email: Type.String({ format: 'email' })
  }),
  response: Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
    createdAt: Type.String()
  })
} satisfies RouteContract; // ⚠️ Always add this for type safety!
```

## Step 2: Implement the Route

Bind the contract to a handler in your backend. The handler is fully type-safe based on the contract.

```typescript
// src/server/routes/users/index.ts  ⚠️ Must be [route]/index.ts
import { createApp } from '@spfn/core/route';
import { createUserContract } from '@/lib/contracts/users';
import { create } from '@spfn/core/db';
import { users } from '@/server/entities/users';

const app = createApp();

// POST /users - Create user
app.bind(createUserContract, async (c) => {
  const data = await c.data();

  // Use Superfunction helper functions
  const user = await create(users, {
    name: data.name,
    email: data.email
  });

  return c.json(user);
});

export default app;
```

## Step 3: Use in Next.js

The Superfunction CLI automatically generates a type-safe client. Just import and use it!

```typescript
// src/app/page.tsx
'use client';

import { api } from '@/lib/api'; // Auto-generated client

export default function Home() {
  const handleCreateUser = async () => {
    const user = await api.users.create({
      body: {
        name: 'John Doe',
        email: 'john@example.com'
      }
    });

    // ✅ user is fully typed!
    console.log(user.id);
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
> You've created your first type-safe API with Superfunction. The types flow automatically from contract to implementation to client usage.

## What Happens Behind the Scenes?

1. Superfunction validates request body against the contract schema
2. TypeScript ensures your handler returns the correct response type
3. The CLI generates a type-safe client with full autocomplete
4. All types are inferred—no manual type definitions needed!

## Next Steps

### Core Concepts

Dive deeper into contracts, route binding, and type safety.

[Learn Core Concepts →](/docs/core-concepts/contracts)

### Guides

Learn how to handle authentication, transactions, and more.

[Browse Guides →](/docs/guides/database)