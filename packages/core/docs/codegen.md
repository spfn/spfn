# Codegen

Automatic API client generation from route definitions.

## Setup

### Configure Generator

```typescript
// codegen.config.ts
import { defineCodegenConfig } from '@spfn/core/codegen';

export default defineCodegenConfig({
    generators: [
        {
            name: 'api-client',
            output: './src/client/api.ts',
            router: './src/server/server.config.ts'
        }
    ]
});
```

## Generate Client

```bash
# Generate once
pnpm spfn codegen run

# Watch mode (dev server includes this)
pnpm spfn:dev
```

## Generated Client

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
    params: { id: '123' }
});

const users = await api.getUsers.call({
    query: { page: 1, limit: 20 }
});

const created = await api.createUser.call({
    body: { email: 'user@example.com', name: 'User' }
});
```

## CLI Commands

```bash
# Generate API client
pnpm spfn codegen run

# List registered generators
pnpm spfn codegen list

# Run specific generator
pnpm spfn codegen run --name api-client
```
