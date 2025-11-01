---
title: "Type Safety"
description: "Learn how SPFN ensures end-to-end type safety from contracts to frontend"
order: 3
available: true
---

# Type Safety

SPFN provides end-to-end type safety from contract definition to frontend usage, with zero manual type definitions.

## How Type Safety Works

Type safety flows through your entire application in four stages:

1. **Contract Definition** - Define API shape with TypeBox schemas
2. **Handler Types** - Backend handlers automatically infer types from contracts
3. **Code Generation** - CLI generates type-safe client with extracted types
4. **Frontend Usage** - Import and use with full TypeScript autocomplete

## InferContract Utility

The `InferContract` utility extracts TypeScript types from your contracts:

```typescript
import type { InferContract } from '@spfn/core';
import { createTeamContract } from '@/lib/contracts/teams';

// Extract types from contract
type CreateTeamBody = InferContract<typeof createTeamContract>['body'];
// { name: string; slug: string; description?: string }

type CreateTeamResponse = InferContract<typeof createTeamContract>['response'];
// { id: number; name: string; slug: string; createdAt: string }

// Available properties:
// - InferContract<Contract>['params']   - Path parameters
// - InferContract<Contract>['query']    - Query parameters
// - InferContract<Contract>['body']     - Request body
// - InferContract<Contract>['response'] - Response data
```

## Auto-Generated Types

When you run `npm run spfn:dev`, SPFN automatically generates `src/lib/api.ts` with all types extracted:

```typescript
/**
 * Auto-generated API Client
 * DO NOT EDIT MANUALLY
 */
import { client } from '@spfn/core/client';
import type { InferContract } from '@spfn/core';
import { getTeamsContract, createTeamContract, updateTeamContract } from '@/lib/contracts/teams';

// ============================================
// Auto-generated Types
// ============================================

export type GetTeamsResponse = InferContract<typeof getTeamsContract>['response'];
export type GetTeamsQuery = InferContract<typeof getTeamsContract>['query'];

export type CreateTeamResponse = InferContract<typeof createTeamContract>['response'];
export type CreateTeamBody = InferContract<typeof createTeamContract>['body'];

export type UpdateTeamResponse = InferContract<typeof updateTeamContract>['response'];
export type UpdateTeamParams = InferContract<typeof updateTeamContract>['params'];
export type UpdateTeamBody = InferContract<typeof updateTeamContract>['body'];

/**
 * Type-safe API client
 */
export const api = {
    teams: {
        list: (options: { query?: GetTeamsQuery }) =>
            client.call(getTeamsContract, options),
        create: (options: { body: CreateTeamBody }) =>
            client.call(createTeamContract, options),
        update: (options: { params: UpdateTeamParams; body: UpdateTeamBody }) =>
            client.call(updateTeamContract, options),
    }
} as const;
```

## Using Types in Frontend

Import auto-generated types directly from `@/lib/api`:

### Type-Safe API Calls

```typescript
'use client';

import { api } from '@/lib/api';
import type { CreateTeamBody } from '@/lib/api';

export function CreateTeamForm() {
  const handleSubmit = async (data: CreateTeamBody) => {
    // ✅ body is type-checked
    const team = await api.teams.create({ body: data });

    // ✅ Response is fully typed
    console.log(team.id);      // number
    console.log(team.name);    // string
    console.log(team.invalid); // ❌ TypeScript error!
  };

  return <form onSubmit={...} />;
}
```

### Type-Safe Form State

```typescript
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { CreateTeamBody } from '@/lib/api';

export function TeamForm() {
  // ✅ Form state uses contract type
  const [formData, setFormData] = useState<CreateTeamBody>({
    name: '',
    slug: '',
    description: undefined
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ TypeScript ensures all required fields are present
    const team = await api.teams.create({ body: formData });
    console.log('Created:', team.id);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={formData.name}
        onChange={(e) => setFormData({
          ...formData,
          name: e.target.value
        })}
      />
      {/* TypeScript autocomplete works! */}
    </form>
  );
}
```

### Type-Safe React Hooks

```typescript
'use client';

import { api } from '@/lib/api';
import type { GetTeamsResponse, UpdateTeamParams, UpdateTeamBody } from '@/lib/api';
import { useCrudManager } from '@/hooks/useCrudManager';

export function TeamManagement() {
  const {
    items,
    handleSave,
    handleDelete
  } = useCrudManager<
    GetTeamsResponse['items'][0],  // Item type
    CreateTeamBody,                 // Create input type
    UpdateTeamParams,               // Update params type
    UpdateTeamBody,                 // Update body type
    DeleteTeamResponse              // Delete response type
  >({
    list: () => api.teams.list({ query: {} }),
    create: (data) => api.teams.create({ body: data }),
    update: (id, data) => api.teams.update({
      params: { id },
      body: data
    }),
    delete: (id) => api.teams.delete({ params: { id } })
  });

  // ✅ All CRUD operations are fully typed!
  return <div>{/* ... */}</div>;
}
```

## Compile-Time Type Checking

TypeScript catches errors at compile time, not runtime:

### Missing Required Fields

```typescript
// ❌ TypeScript Error: Property 'name' is missing
await api.teams.create({
  body: {
    slug: 'my-team'
    // Missing required 'name' field!
  }
});

// ✅ Correct: All required fields present
await api.teams.create({
  body: {
    name: 'My Team',
    slug: 'my-team'
  }
});
```

### Wrong Field Types

```typescript
// ❌ TypeScript Error: Type 'number' is not assignable to type 'string'
await api.teams.create({
  body: {
    name: 123,  // Should be string!
    slug: 'my-team'
  }
});

// ✅ Correct: Proper types
await api.teams.create({
  body: {
    name: 'My Team',
    slug: 'my-team'
  }
});
```

### Invalid Field Names

```typescript
// ❌ TypeScript Error: Object literal may only specify known properties
await api.teams.create({
  body: {
    name: 'My Team',
    slug: 'my-team',
    invalid: 'field'  // This field doesn't exist in contract!
  }
});

// ✅ Correct: Only contract fields
await api.teams.create({
  body: {
    name: 'My Team',
    slug: 'my-team'
  }
});
```

## Backend Type Safety

Backend handlers automatically infer types from contracts:

```typescript
// src/server/routes/teams/index.ts
import { createApp } from '@spfn/core/route';
import { createTeamContract } from '@/lib/contracts/teams';

const app = createApp();

app.bind(createTeamContract, async (c) => {
  // ✅ c.data() return type is inferred from contract.body
  const data = await c.data();
  // data: { name: string; slug: string; description?: string }

  // ❌ TypeScript Error: Return type doesn't match contract.response
  return c.json({
    id: 1,
    name: data.name
    // Missing required fields: slug, createdAt
  });

  // ✅ Correct: Matches contract.response
  return c.json({
    id: 1,
    name: data.name,
    slug: data.slug,
    createdAt: new Date().toISOString()
  });
});
```

## Runtime vs Compile-Time

SPFN provides both runtime and compile-time safety:

**Runtime Safety:**
- Request validation with TypeBox
- Automatic type conversion (String → Number)
- Structured error responses
- Schema constraints (minLength, pattern, etc.)

**Compile-Time Safety:**
- TypeScript type checking
- IDE autocomplete
- Refactoring support
- Catch errors before deployment

> **Note:** Your contract is the single source of truth. TypeScript types, runtime validation, and API documentation all derive from the same source—ensuring consistency across your entire stack.

## Best Practices

### 1. Always Import Types from @/lib/api

```typescript
// ✅ Good: Use auto-generated types
import type { CreateTeamBody, GetTeamsResponse } from '@/lib/api';

// ❌ Bad: Manual type definitions
type CreateTeamBody = {
  name: string;
  slug: string;
};
```

### 2. Use InferContract for Custom Types

```typescript
import type { InferContract } from '@spfn/core';
import { getTeamsContract } from '@/lib/contracts/teams';

// Extract single item type from array response
type Team = InferContract<typeof getTeamsContract>['response']['items'][0];

// Use in component
function TeamCard({ team }: { team: Team }) {
  return <div>{team.name}</div>;
}
```

### 3. Keep Contracts Updated

When you modify a contract:

1. Update the contract schema in `src/lib/contracts/`
2. Codegen automatically runs in dev mode
3. TypeScript will show errors in frontend code that needs updating
4. Fix all TypeScript errors before deploying

> **Next: Client Generation**
>
> Learn how SPFN's code generation works and how to customize the generated client.
>
> [Client Generation →](/docs/core-concepts/client-generation)