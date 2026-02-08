---
title: "Codegen"
description: "Automatic API client generation from route definitions"
order: 9
available: true
---

# Codegen

SPFN automatically generates type-safe API clients from your route definitions. The codegen system analyzes your `defineRouter` configuration and produces client code with full type inference.

## Setup

### Configure Generator

Create a `codegen.config.ts` at the project root:

```typescript
// codegen.config.ts
import { defineConfig } from '@spfn/core/codegen';

export default defineConfig({
    generators: [
        {
            name: 'api-client',
            output: './src/client/api.ts',
            router: './src/server/server.config.ts',
        },
    ],
});
```

## CLI Commands

```bash
# Generate API client
pnpm spfn codegen run

# Run specific generator
pnpm spfn codegen run --name api-client

# List registered generators
pnpm spfn codegen list

# Watch mode (included in dev server)
pnpm spfn:dev
```

## Generated Client

The codegen produces a typed API client file:

```typescript
// src/client/api.ts (generated)
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/server.config';

export const api = createApi<AppRouter>();
```

## Usage

```typescript
import { api } from '@/client/api';

// Type-safe API calls
const user = await api.getUser.call({
    params: { id: '123' },
});

const users = await api.getUsers.call({
    query: { page: 1, limit: 20 },
});

const created = await api.createUser.call({
    body: { email: 'user@example.com', name: 'User' },
});
```

## Custom Generators

For advanced use cases, define custom generators using `defineGenerator`:

```typescript
import { defineGenerator } from '@spfn/core/codegen';

const myGenerator = defineGenerator({
    name: 'my-package:generator',
    // ... custom generator configuration
});
```

> For a complete guide on building custom generators, see [Custom Generators](/docs/guides/custom-generators).

## Related

- [Next.js Integration](/docs/guides/nextjs) - Using generated clients in Next.js
- [Custom Generators](/docs/guides/custom-generators) - Building custom code generators
- [Route Definition](/docs/core-concepts/contracts) - Defining routes for codegen
