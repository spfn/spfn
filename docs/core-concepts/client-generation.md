---
title: "Client Generation"
description: "Learn how to use the auto-generated type-safe API client"
order: 5
available: true
---

# Client Generation

Superfunction automatically generates a fully type-safe API client from your contracts, providing autocomplete and type checking for all API calls.

## Auto-Generated Client

When you run `npm run spfn:dev`, Superfunction scans all contracts in `src/lib/contracts/` and generates `src/lib/api/` with resource-based file splitting:

```typescript
// File structure (auto-generated)
src/lib/api/
├─ index.ts       # Unified exports + api object
├─ teams.ts       # Teams API + types
├─ users.ts       # Users API + types
└─ examples.ts    # Examples API + types

// src/lib/api/teams.ts (Auto-generated)
import { client } from '@spfn/core/client';
import type { InferContract } from '@spfn/core';
import { getTeamsContract, createTeamContract } from '@/lib/contracts/teams';

// Types extracted automatically (reusable)
export type GetTeamsResponse = InferContract<typeof getTeamsContract>['response'];
export type GetTeamsQuery = InferContract<typeof getTeamsContract>['query'];
export type CreateTeamBody = InferContract<typeof createTeamContract>['body'];
export type CreateTeamResponse = InferContract<typeof createTeamContract>['response'];

// Individual function exports with full type safety
export const getTeams = (options: { query?: GetTeamsQuery }) =>
    client.call(getTeamsContract, options);

export const createTeam = (options: { body: CreateTeamBody }) =>
    client.call(createTeamContract, options);

// src/lib/api/index.ts (Auto-generated)
export { client } from '@spfn/core/client';

// Re-export types from resource modules
export type { GetTeamsResponse, GetTeamsQuery, CreateTeamBody, CreateTeamResponse } from './teams.js';
export type { GetUsersResponse, CreateUserBody, CreateUserResponse } from './users.js';

// Import functions from resource modules
import { getTeams, createTeam } from './teams.js';
import { getUsers, createUser } from './users.js';

// Flat API object with all functions
export const api = {
    getTeams,
    createTeam,
    getUsers,
    createUser
} as const;
```

> **Resource-Based Splitting**
>
> Each resource gets its own file, making the codebase more scalable and enabling better tree-shaking:
>
> - File size stays manageable as your API grows
> - Types and APIs are co-located by resource
> - Import only what you need for better performance
> - Team members can work on different resources in parallel

> **Automatic Updates with Smart Regeneration**
>
> The client regenerates automatically when contracts change, with intelligent optimizations:
>
> - **Incremental updates**: Only regenerates when contract signatures actually change
> - **Smart detection**: Skips regeneration if only formatting or comments changed
> - **Fast rebuilds**: Contract signature comparison ensures minimal rebuild times
> - **No manual steps**: Everything happens automatically in watch mode

## Client Structure

The generated client provides flat function exports organized by resource files:

```typescript
import { api } from '@/lib/api';

// Flat API object with camelCase function names
api.getTeams()          // GET /teams
api.getTeam()           // GET /teams/:id
api.createTeam()        // POST /teams
api.updateTeam()        // PUT /teams/:id
api.deleteTeam()        // DELETE /teams/:id

api.getUsers()          // GET /users
api.createUser()        // POST /users
// ... and so on

// Function names are derived from contract names
// getTeamsContract → getTeams
// createTeamContract → createTeam
// updateTeamContract → updateTeam
```

## Using the Client

### Server Components (Recommended)

Use the client directly in Next.js Server Components:

```typescript
// app/teams/page.tsx (Server Component)
import { api } from '@/lib/api';

export default async function TeamsPage() {
  // Direct API call - no useState, no useEffect
  const { items: teams, total } = await api.getTeams({
    query: { published: true }
  });

  return (
    <div>
      <h1>{total} Teams</h1>
      {teams.map((team) => (
        <div key={team.id}>
          <h2>{team.name}</h2>
          <p>{team.description}</p>
        </div>
      ))}
    </div>
  );
}
```

### Client Components

Use with React hooks for interactive features:

```typescript
'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { CreateTeamBody } from '@/lib/api';

export function CreateTeamForm() {
  const [formData, setFormData] = useState<CreateTeamBody>({
    name: '',
    slug: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const team = await api.createTeam({ body: formData });
      console.log('Created team:', team.id);
    } catch (error) {
      console.error('Failed to create team:', error);
    } finally {
      setLoading(false);
    }
  };

  return <form onSubmit={handleSubmit}>{/* ... */}</form>;
}
```

## API Method Patterns

The generated client follows consistent patterns for different HTTP methods:

### GET Requests (List)

```typescript
// GET /teams with query parameters
const result = await api.getTeams({
  query: {
    published: true,
    limit: 10,
    offset: 0
  }
});

// GET /teams (no query parameters - if query is optional)
const result = await api.getTeams();
```

### GET Requests (Single Item)

```typescript
// GET /teams/:id
const team = await api.getTeam({
  params: { id: 123 }
});

console.log(team.name); // Fully typed!
```

### POST Requests

```typescript
// POST /teams with body
const team = await api.createTeam({
  body: {
    name: 'Engineering',
    slug: 'engineering',
    description: 'Engineering team'
  }
});
```

### PUT Requests

```typescript
// PUT /teams/:id with params and body
const team = await api.updateTeam({
  params: { id: 123 },
  body: {
    name: 'Engineering Team',
    slug: 'engineering'
  }
});
```

### DELETE Requests

```typescript
// DELETE /teams/:id
const result = await api.deleteTeam({
  params: { id: 123 }
});
```

## Customizing the Client

The generated client exports the underlying `client` instance for customization:

### Adding Interceptors

Add request/response interceptors for authentication, logging, etc.:

```typescript
// src/lib/api-config.ts
import { client } from '@/lib/api';

// Add authentication interceptor
client.use(async (request, next) => {
  // Add auth token to all requests
  const token = getAuthToken();
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await next(request);
  return response;
});

// Add logging interceptor
client.use(async (request, next) => {
  console.log('Request:', request.method, request.url);

  const response = await next(request);

  console.log('Response:', response.status);
  return response;
});
```

### Setting Base URL

Configure the API base URL (useful for different environments):

```typescript
// src/lib/api-config.ts
import { client } from '@/lib/api';

// Set base URL
client.setBaseURL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8790');

// Now all API calls use this base URL
await api.getTeams(); // → http://localhost:8790/teams
```

## Error Handling

The client throws errors that you can catch and handle:

```typescript
try {
  const team = await api.createTeam({
    body: { name: 'Team', slug: 'team' }
  });
} catch (error) {
  if (error instanceof Error) {
    // Validation error (400)
    if (error.message.includes('ValidationError')) {
      console.error('Invalid data:', error);
    }
    // Not found error (404)
    else if (error.message.includes('NotFoundError')) {
      console.error('Team not found:', error);
    }
    // Other errors
    else {
      console.error('Failed to create team:', error);
    }
  }
}
```

## Method Naming Convention

Function names are derived from contract variable names by removing the "Contract" suffix:

```typescript
// src/lib/contracts/teams.ts
export const getTeamsContract = { /* ... */ };         // → api.getTeams()
export const getTeamContract = { /* ... */ };          // → api.getTeam()
export const createTeamContract = { /* ... */ };       // → api.createTeam()
export const updateTeamContract = { /* ... */ };       // → api.updateTeam()
export const deleteTeamContract = { /* ... */ };       // → api.deleteTeam()

// Special naming examples:
export const getTeamBySlugContract = { /* ... */ };    // → api.getTeamBySlug()
export const publishTeamContract = { /* ... */ };      // → api.publishTeam()
```

## Best Practices

### 1. Always Use the Generated Client

```typescript
// ✅ Good: Use generated client
import { api } from '@/lib/api';
const teams = await api.getTeams();

// ❌ Bad: Manual fetch
const response = await fetch('/teams');
const teams = await response.json();
```

### 2. Initialize Client Configuration Early

```typescript
// src/lib/api-config.ts
import { client } from '@/lib/api';

// Set up once at app initialization
client.setBaseURL(process.env.NEXT_PUBLIC_API_URL!);
client.use(authInterceptor);
client.use(loggingInterceptor);

// Then import in app/layout.tsx
import '@/lib/api-config';
```

### 3. Handle Errors Consistently

```typescript
// Create a wrapper for consistent error handling
export async function apiCall<T>(
  fn: () => Promise<T>,
  errorMessage: string
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(errorMessage, error);
    toast.error(errorMessage);
    return null;
  }
}

// Usage
const team = await apiCall(
  () => api.createTeam({ body: data }),
  'Failed to create team'
);
```

### 4. Use Server Components When Possible

Prefer Server Components for data fetching:

- No client-side JavaScript overhead
- Direct database access (faster)
- No loading states needed
- Better SEO

> **Next: Middleware**
>
> Learn how to create custom middlewares for authentication, logging, and more.
>
> [Middleware →](/docs/core-concepts/middleware)