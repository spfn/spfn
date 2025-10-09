# Superfunction (SPFN)

> **The Backend Layer for Next.js**

[![npm version](https://badge.fury.io/js/@spfn%2Fcore.svg)](https://www.npmjs.com/package/@spfn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

Superfunction (shortened as **SPFN**) is a backend framework for Next.js that brings full backend capabilities with Next.js developer experience.

## Why Superfunction?

Next.js excels at what it does. But when you need **full backend capabilities**, architecture matters:

### Backend Requirements Next.js Wasn't Built For
- **Long-running processes** — Video encoding, batch jobs, ML inference
- **Persistent connections** — WebSocket servers, database connection pools
- **Background workers** — Job queues, scheduled tasks, event processors
- **Stateful services** — In-memory caches, connection pools, singleton services that maintain state across requests

### The Architecture Gap
Next.js API Routes use a **serverless function model**:
- Request-response only
- Cold starts on each invocation
- No persistent state between requests
- Not designed for long-running processes

This is by design — it's what makes Next.js deployable anywhere.

### Superfunction Fills the Gap
A **dedicated backend runtime** that runs alongside Next.js:
- Always-on Node.js process (no cold starts)
- Persistent connections and in-memory state
- Full backend patterns (WebSocket, workers, queues)
- File-based routing (Next.js DX)
- Flexible deployment (single server, containers, orchestration)

**Next.js for UI. Superfunction for backend. Perfect together.**

## How It Works

Superfunction runs as a **separate backend server** alongside your Next.js app:

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js App)                Port 3790        │
│  • Server Components                                    │
│  • Client Components                                    │
│  • API Routes (BFF Proxy for security)                 │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ Internal HTTP/WebSocket
                 │
┌────────────────▼────────────────────────────────────────┐
│  Backend (Superfunction)               Port 8790        │
│  • File-based Routes                                    │
│  • WebSocket Servers                                    │
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
- For secure production, use Next.js API Routes as BFF proxy layer
- End-to-end type safety (contracts + code generation)
- Flexible deployment (single server, VPS, containers, orchestration)

## Quick Start

**1. Initialize in your Next.js project**

You can either use npx or install the CLI globally:

```bash
# Option 1: Using npx (no installation required)
cd your-nextjs-project
npx spfn@latest init

# Option 2: Install CLI globally
npm install -g spfn
spfn init
```

**2. Start development**
```bash
npm run spfn:dev
```

Visit:
- **Next.js app**: http://localhost:3790
- **API health**: http://localhost:8790/health

**3. Create your first route**
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

## Auto-Generate CRUD from Entity

The fastest way to create a complete CRUD API is using the `spfn generate` command:

```bash
# 1. Create your entity
# src/server/entities/posts.ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const posts = pgTable('posts', {
  id: id(),                    // Auto-increment primary key
  title: text('title').notNull(),
  content: text('content').notNull(),
  ...timestamps(),             // createdAt, updatedAt
});

# 2. Generate everything automatically
spfn generate posts

# Creates:
# ✅ src/server/routes/posts/contract.ts     (TypeBox contracts)
# ✅ src/server/routes/posts/index.ts        (GET / + POST /)
# ✅ src/server/routes/posts/[id]/index.ts   (GET/:id + PUT/:id + DELETE/:id)
# ✅ src/server/repositories/posts.repository.ts (Repository with findById, create, update, delete)
```

**What you get:**
- 5 REST endpoints (list, create, get, update, delete)
- Type-safe contracts auto-generated from Drizzle schema
- Repository pattern with pagination support
- Full CRUD implementation ready to use

**Generated API:**
```
GET    /posts          # List with pagination
POST   /posts          # Create new post
GET    /posts/:id      # Get by ID
PUT    /posts/:id      # Update post
DELETE /posts/:id      # Delete post
```

→ [Full Generate Command Documentation](./packages/cli/README.md#spfn-generate)

**Key benefits:**
- ✅ Type-safe from database to frontend
- ✅ Automatic validation on body/params/query
- ✅ Repository pattern handles pagination, filtering
- ✅ Auto-generated client keeps frontend in sync

## Core Philosophy

### Contract-Based Routing
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
  const data = await c.data();  // Automatically validated!
  return c.json(await userRepo.save(data));
});

// Frontend - feels like calling a function, not making an HTTP request
const newUser = await api.users.create({
  body: { name: 'Bob', email: 'bob@example.com' }
});
```

### Type-Safe Data Layer
Repository pattern with Drizzle ORM for clean, type-safe database operations:
```typescript
import { getDb } from '@spfn/core/db';
import { users } from './entities/users.js';

// Get repository instance with transaction support
const db = getDb();
const repo = db.for(users);

// Type-safe queries with full IDE autocomplete
const result = await repo.findPage({
  where: eq(users.status, 'active'),
  orderBy: desc(users.createdAt),
  pagination: { page: 1, limit: 10 }
});
// ^? { items: User[], total: number, page: number, limit: number }
```

### Schema Helpers
Reduce boilerplate with built-in helpers for common patterns:
```typescript
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core/db';

export const users = pgTable('users', {
  id: id(),                    // bigserial primary key
  email: text('email').notNull().unique(),
  ...timestamps(),             // createdAt, updatedAt
});

export const posts = pgTable('posts', {
  id: id(),
  title: text('title').notNull(),
  authorId: foreignKey('author', () => users.id),  // Foreign key with cascade
  ...timestamps(),
});
```

**Available helpers:**
- `id()` — Auto-increment primary key (bigserial)
- `timestamps()` — createdAt, updatedAt with timezone
- `foreignKey(name, ref)` — Foreign key with cascade delete
- `optionalForeignKey(name, ref)` — Nullable foreign key

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

### Development & Release
- [Contributing Guide](./CONTRIBUTING.md)
- [Release Guide](./RELEASE.md)

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