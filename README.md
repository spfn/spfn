# Superfunction (SPFN)

> **The Backend Layer for Next.js**

[![npm version](https://badge.fury.io/js/@spfn%2Fcore.svg)](https://www.npmjs.com/package/@spfn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

Superfunction (shortened as **SPFN**) is a backend framework for Next.js that brings full backend capabilities with Next.js developer experience.

## Core Philosophy

### Contract-based Routing
Define your API with TypeBox contracts, get validation and type safety automatically:
```typescript
// Define once
export const getUserContract = {
  method: 'GET' as const,
  path: '/:id',
  params: Type.Object({ id: Type.String() }),
  response: Type.Object({ id: Type.Number(), name: Type.String() })
};

// Use in route - params are automatically validated and typed!
app.bind(getUserContract, async (c) => {
  const { id } = c.params;  // Type-safe! string from params
  return c.json({ id: Number(id), name: 'Alice' });
});
```

### End-to-End Type Safety
Auto-generated clients from co-located contracts:
```typescript
// Client auto-generated at src/lib/api/client.ts
import { api } from '@/lib/api/client';

// Frontend: Call APIs with full type inference
const user = await api.users.getById({ params: { id: '123' } });
//    ^? { id: number, name: string }

// Client regenerates automatically when contracts change (watch mode)
// No manual codegen needed - just edit contracts and go!
```

### Function Call Style, Not HTTP
Write backend logic, call it like a function:
```typescript
// Backend
app.bind(createUserContract, async (c) => {
  const data = c.body;  // Automatically validated!
  return c.json(await userRepo.create(data));
});

// Frontend - feels like calling a function, not making an HTTP request
const newUser = await api.users.create({
  body: { name: 'Bob', email: 'bob@example.com' }
});
```

## Why Superfunction?

Next.js excels at what it does. But when you need **full backend capabilities**, architecture matters:

### Backend Requirements Next.js Wasn't Built For
- **Long-running processes** — Video encoding, batch jobs, ML inference
- **Persistent connections** — WebSocket servers, database connection pools
- **Background workers** — Job queues, scheduled tasks, event processors
- **Stateful operations** — Session stores, distributed caches

### The Architecture Gap
Next.js API Routes use a **serverless function model**:
- Request-response only
- No state between calls
- Not designed for persistent processes

This is by design — it's what makes Next.js deployable anywhere.

### Superfunction Fills the Gap
A **dedicated backend runtime** that runs alongside Next.js:
- Persistent Node.js process
- Full backend patterns (WebSocket, workers, queues)
- File-based routing (Next.js DX)
- Deploy together in containers

**Next.js for UI. Superfunction for backend. Perfect together.**

## How It Works

Superfunction runs as a **separate backend server** alongside your Next.js app:

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js App)                                 │
│  • Server Components                                    │
│  • Client Components              Port 3790             │
│  • Static Assets                                        │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ HTTP/WebSocket
                 │
┌────────────────▼────────────────────────────────────────┐
│  Backend (Superfunction)                                │
│  • File-based Routes                                    │
│  • WebSocket Servers               Port 8790            │
│  • Background Workers                                   │
│  • Persistent Connections                               │
└────────────────┬────────────────────────────────────────┘
                 │
                 │
┌────────────────▼────────────────────────────────────────┐
│  External Services                                      │
│  • PostgreSQL  • Redis  • S3  • Email  • etc.          │
└─────────────────────────────────────────────────────────┘
```

**Key Points:**
- Next.js and Superfunction run as **separate processes**
- Frontend calls Superfunction APIs directly (no proxy needed)
- End-to-end type safety (contracts + code generation)
- Deploy together in Docker/Kubernetes

## Quick Start

**1. Install CLI**
```bash
npm install -g @spfn/cli
```

**2. Initialize in your Next.js project**
```bash
cd your-nextjs-project
spfn init
```

**3. Start development**
```bash
npm run spfn:dev
```

Visit:
- **Next.js app**: http://localhost:3790
- **API health**: http://localhost:8790/health

**4. Create your first route**
```typescript
// src/server/routes/users/contract.ts
import { Type } from '@sinclair/typebox';

export const getUsersContract = {
  method: 'GET' as const,
  path: '/',
  response: Type.Object({
    users: Type.Array(Type.Object({
      id: Type.Number(),
      name: Type.String(),
    })),
  }),
};
```

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { getUsersContract } from './contract.js';

const app = createApp();

app.bind(getUsersContract, async (c) => {
  return c.json({
    users: [{ id: 1, name: 'Alice' }],
  });
});

export default app;
```

**That's it.** Your backend is running at http://localhost:8790/users

→ [CLI Reference](./packages/cli/README.md) | [Core API](./packages/core/README.md)

## Core Features

### 🗂️ File-based Routing
Next.js-style routing for your backend with co-located contracts:
```typescript
src/server/routes/
  users/
    contract.ts    → Contract definitions
    index.ts       → GET /users
  [id]/
    contract.ts    → Contract definitions
    index.ts       → GET /users/:id
  posts/
    [id]/
      comments/
        contract.ts → Contract definitions
        index.ts   → GET /posts/:id/comments
```

### 📝 Contract-first Development
Define contracts co-located with routes, get auto-generated type-safe clients:
```typescript
// 1. Define contract (routes/users/[id]/contract.ts)
export const getUserContract = {
  method: 'GET' as const,
  path: '/:id',
  params: Type.Object({ id: Type.String() }),
  response: Type.Object({ id: Type.Number(), name: Type.String() })
};

// 2. Backend: Bind to route (routes/users/[id]/index.ts)
import { getUserContract } from './contract.js';

app.bind(getUserContract, async (c) => {
  const { id } = c.params;  // Automatically validated!
  return c.json({ id: Number(id), name: 'Alice' });
});

// 3. Frontend: Auto-generated client with full type safety
import { api } from '@/lib/api/client'; // Auto-generated!

const user = await api.users.getById({ params: { id: '123' } });
//    ^? { id: number, name: string }
```

### 🗄️ Repository Pattern
Type-safe database operations with Drizzle ORM:
```typescript
const repo = new Repository(db, users);
const result = await repo.findPage({
  where: eq(users.status, 'active'),
  pagination: { page: 1, limit: 10 }
});
```

### 💾 Production-ready Patterns
Built-in support for:
- **Transactions** — Automatic context propagation with `@Transactional()`
- **Caching** — Redis with master-replica support
- **Error handling** — Custom error classes with HTTP responses
- **Middleware** — Logging, CORS, validation

### 🚀 Deploy Anywhere
Container-based deployment:
- Docker / Kubernetes
- AWS ECS / Fargate
- Google Cloud Run
- Any Node.js environment

## Packages

### [@spfn/cli](./packages/cli)
Command-line tools for project initialization and development:
```bash
spfn init      # Initialize SPFN in Next.js project
spfn dev       # Start development servers
spfn start     # Start production server
```

### [@spfn/core](./packages/core)
Core framework with all the building blocks:
- **Routing** — File-based routes with contract validation
- **Database** — Repository pattern with Drizzle ORM
- **Transactions** — AsyncLocalStorage-based context
- **Cache** — Redis with master-replica support
- **Client** — Type-safe client generation
- **Middleware** — Logging, CORS, error handling

[→ Full API Documentation](./packages/core/README.md)

## Documentation

### Package Documentation
- [CLI Reference](./packages/cli/README.md)
- [Core API Reference](./packages/core/README.md)

### Module Guides
- [Routing Guide](./packages/core/src/route/README.md)
- [Database & Repository](./packages/core/src/db/README.md)
- [Transaction Management](./packages/core/src/db/docs/transactions.md)
- [Caching with Redis](./packages/core/src/cache/README.md)
- [Error Handling](./packages/core/src/errors/README.md)
- [Middleware](./packages/core/src/middleware/README.md)
- [Client API](./packages/core/src/client/README.md)

## Requirements

- Node.js >= 18
- Next.js 15+ with App Router
- PostgreSQL
- Redis (optional)

## Community

- [GitHub Issues](https://github.com/spfn/spfn/issues)
- [Discussions](https://github.com/spfn/spfn/discussions)

## License

MIT

---

**Built with ❤️ for the Next.js community**