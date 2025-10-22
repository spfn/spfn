# @spfn/core

> Core framework for building type-safe backend APIs with Next.js and Hono

[![npm version](https://badge.fury.io/js/@spfn%2Fcore.svg)](https://www.npmjs.com/package/@spfn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

> ⚠️ **Alpha Release**: SPFN is currently in alpha. APIs may change. Use `@alpha` tag for installation.

## Installation

**Recommended: Create New Project**
```bash
npx spfn@alpha create my-app
```

**Add to Existing Next.js Project**
```bash
cd your-nextjs-project
npx spfn@alpha init
```

**Manual Installation**
```bash
npm install @spfn/core hono drizzle-orm postgres @sinclair/typebox
```

## Quick Start

### 1. Define a Contract

```typescript
// src/server/routes/users/contract.ts
import { Type } from '@sinclair/typebox';

export const getUsersContract = {
  method: 'GET' as const,
  path: '/',
  query: Type.Object({
    page: Type.Optional(Type.Number()),
    limit: Type.Optional(Type.Number()),
  }),
  response: Type.Object({
    users: Type.Array(Type.Object({
      id: Type.Number(),
      name: Type.String(),
      email: Type.String(),
    })),
    total: Type.Number(),
  }),
};
```

### 2. Create a Route

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { getUsersContract } from './contract.js';
import { findMany } from '@spfn/core/db';
import { users } from '../../entities/users.js';

const app = createApp();

app.bind(getUsersContract, async (c) => {
  const { page = 1, limit = 10 } = c.query;

  // Use helper function directly - no Repository needed
  const offset = (page - 1) * limit;
  const result = await findMany(users, { limit, offset });

  return c.json({ users: result, total: result.length });
});

export default app;
```

### 3. Start Server

```bash
npm run spfn:dev
# Server starts on http://localhost:8790
```

## Architecture Pattern

SPFN follows a **layered architecture** that separates concerns and keeps code maintainable:

```
┌─────────────────────────────────────────┐
│            Routes Layer                  │  HTTP handlers, contracts
│  - Define API contracts (TypeBox)       │
│  - Handle requests/responses            │
│  - Thin handlers                        │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│           Service Layer                  │  Business logic
│  - Orchestrate operations               │
│  - Implement business rules             │
│  - Use helper functions or custom logic │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Data Access Layer                │  Database operations
│  - Use helper functions (findOne, etc)  │
│  - Custom queries with Drizzle          │
│  - Domain-specific wrappers             │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│           Entity Layer                   │  Database schema
│  - Table definitions (Drizzle)          │
│  - Type inference                       │
│  - Schema helpers                       │
└─────────────────────────────────────────┘
```

### Complete Example: Blog Post System

**1. Entity Layer** - Define database schema

```typescript
// src/server/entities/posts.ts
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const posts = pgTable('posts', {
  id: id(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  content: text('content').notNull(),
  status: text('status', {
    enum: ['draft', 'published']
  }).notNull().default('draft'),
  ...timestamps(),
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
```

**2. Data Access Layer** - Helper functions with domain-specific wrappers

```typescript
// src/server/repositories/posts.repository.ts
import { findOne, findMany, create as createHelper } from '@spfn/core/db';
import { eq, desc } from 'drizzle-orm';
import { posts, type Post, type NewPost } from '../entities/posts';

// Domain-specific wrappers using helper functions
export async function findPostBySlug(slug: string): Promise<Post | null> {
  return findOne(posts, { slug });
}

export async function findPublishedPosts(): Promise<Post[]> {
  return findMany(posts, {
    where: { status: 'published' },
    orderBy: desc(posts.createdAt)
  });
}

export async function createPost(data: NewPost): Promise<Post> {
  return createHelper(posts, data);
}

// Or use helper functions directly in routes for simple cases
// const post = await findOne(posts, { id: 1 });
```

**3. Routes Layer** - HTTP API

```typescript
// src/server/routes/posts/contracts.ts
import { Type } from '@sinclair/typebox';

export const createPostContract = {
  method: 'POST' as const,
  path: '/',
  body: Type.Object({
    title: Type.String(),
    content: Type.String(),
  }),
  response: Type.Object({
    id: Type.String(),
    title: Type.String(),
    slug: Type.String(),
  }),
};

export const listPostsContract = {
  method: 'GET' as const,
  path: '/',
  response: Type.Array(Type.Object({
    id: Type.String(),
    title: Type.String(),
    slug: Type.String(),
  })),
};
```

```typescript
// src/server/routes/posts/index.ts
import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { findPostBySlug, createPost, findPublishedPosts } from '../../repositories/posts.repository';
import { createPostContract, listPostsContract } from './contracts';

const app = createApp();

// POST /posts - Create new post (with transaction)
app.bind(createPostContract, [Transactional()], async (c) => {
  const body = await c.data();

  // Generate slug from title
  const slug = body.title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  // Check if slug exists
  const existing = await findPostBySlug(slug);
  if (existing) {
    return c.json({ error: 'Post with this title already exists' }, 409);
  }

  // Create post
  const post = await createPost({
    ...body,
    slug,
    status: 'draft'
  });

  // ✅ Auto-commit on success, auto-rollback on error
  return c.json(post, 201);
});

// GET /posts - List published posts (no transaction needed)
app.bind(listPostsContract, async (c) => {
  const posts = await findPublishedPosts();
  return c.json(posts);
});

export default app;
```

### Why This Architecture?

**✅ Separation of Concerns**
- Each layer has a single responsibility
- Easy to locate and modify code

**✅ Testability**
- Test each layer independently
- Mock dependencies easily

**✅ Reusability**
- Services can be used by multiple routes
- Repositories can be shared across services

**✅ Type Safety**
- Types flow from Entity → Repository → Service → Route
- Full IDE autocomplete and error checking

**✅ Maintainability**
- Add features without breaking existing code
- Clear boundaries prevent coupling

### Layer Responsibilities

| Layer | Responsibility | Examples |
|-------|---------------|----------|
| **Entity** | Define data structure | Schema, types, constraints |
| **Data Access** | Database operations | Helper functions, custom queries, joins |
| **Service** | Business logic | Validation, orchestration, rules |
| **Routes** | HTTP interface | Contracts, request handling |

### Best Practices

**Entity Layer:**
- ✅ Use schema helpers: `id()`, `timestamps()`
- ✅ Export inferred types: `Post`, `NewPost`
- ✅ Use TEXT with enum for status fields

**Data Access Layer:**
- ✅ Use helper functions for simple CRUD: `findOne()`, `create()`, etc.
- ✅ Create domain-specific wrappers in `src/server/repositories/*.repository.ts`
- ✅ Export functions (not classes): `export async function findPostBySlug()`
- ✅ Use object-based where for simple queries: `{ id: 1 }`
- ✅ Use SQL-based where for complex queries: `and(eq(...), gt(...))`
- ✅ Full TypeScript type inference from table schemas

**Routes Layer:**
- ✅ Keep handlers thin (delegate to services/data access)
- ✅ Define contracts with TypeBox
- ✅ Use `Transactional()` middleware for write operations
- ✅ Use `c.data()` for validated input
- ✅ Return `c.json()` responses

## Core Modules

### 📁 Routing
File-based routing with contract validation and type safety.

**[→ Read Routing Documentation](./src/route/README.md)**

**Key Features:**
- Automatic route discovery (`index.ts`, `[id].ts`, `[...slug].ts`)
- Contract-based validation with TypeBox
- Type-safe request/response handling
- Method-level middleware control (skip auth per HTTP method)

### 🗄️ Database
Drizzle ORM integration with type-safe helper functions and automatic transaction handling.

**[→ Read Database Documentation](./src/db/README.md)**

**Key Features:**
- Helper functions for type-safe CRUD operations
- Automatic transaction handling and read/write separation
- Schema helpers: `id()`, `timestamps()`, `foreignKey()`
- Hybrid where clause support (objects or SQL)

### 🔄 Transactions
Automatic transaction management with async context propagation.

**[→ Read Transaction Documentation](./src/db/docs/transactions.md)**

**Key Features:**
- Auto-commit on success, auto-rollback on error
- AsyncLocalStorage-based context
- Transaction logging

### 💾 Cache
Redis integration with master-replica support.

**[→ Read Cache Documentation](./src/cache/README.md)**

### ⚠️ Error Handling
Custom error classes with unified HTTP responses.

**[→ Read Error Documentation](./src/errors/README.md)**

### 🔐 Middleware
Request logging, CORS, and error handling middleware.

**[→ Read Middleware Documentation](./src/middleware/README.md)**

### 🖥️ Server
Server configuration and lifecycle management.

**[→ Read Server Documentation](./src/server/README.md)**

### 📝 Logger
High-performance logging with multiple transports, sensitive data masking, and automatic validation.

**[→ Read Logger Documentation](./src/logger/README.md)**

**Key Features:**
- Adapter pattern (Pino for production, custom for full control)
- Sensitive data masking (passwords, tokens, API keys)
- File rotation (date and size-based) with automatic cleanup
- Configuration validation with clear error messages
- Multiple transports (Console, File, Slack, Email)

### ⚙️ Code Generation
Automatic code generation with pluggable generators and centralized file watching.

**[→ Read Codegen Documentation](./src/codegen/README.md)**

**Key Features:**
- Orchestrator pattern for managing multiple generators
- Built-in contract generator for type-safe API clients
- Configuration-based setup (`.spfnrc.json` or `package.json`)
- Watch mode integrated into `spfn dev`
- Extensible with custom generators

## Module Exports

### Main Export
```typescript
import { startServer, createServer } from '@spfn/core';
```

### Routing
```typescript
import { createApp, bind, loadRoutes } from '@spfn/core/route';
import type { RouteContext, RouteContract } from '@spfn/core/route';
```

### Database
```typescript
import {
  getDatabase,
  findOne,
  findMany,
  create,
  createMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  count
} from '@spfn/core/db';
```

### Transactions
```typescript
import {
  Transactional,
  getTransaction,
  runWithTransaction
} from '@spfn/core/db';
```

### Cache
```typescript
import { initRedis, getRedis, getRedisRead } from '@spfn/core';
```

### Logger
```typescript
import { logger } from '@spfn/core';
```

### Client (for frontend)
```typescript
import { ContractClient, createClient } from '@spfn/core/client';
```

## Environment Variables

```bash
# Database (required)
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Database Read Replica (optional)
DATABASE_READ_URL=postgresql://user:pass@replica:5432/db

# Redis (optional)
REDIS_URL=redis://localhost:6379
REDIS_WRITE_URL=redis://master:6379  # Master-replica setup
REDIS_READ_URL=redis://replica:6379

# Server
PORT=8790
HOST=localhost
NODE_ENV=development

# Server Timeouts (optional, in milliseconds)
SERVER_TIMEOUT=120000              # Request timeout (default: 120000)
SERVER_KEEPALIVE_TIMEOUT=65000     # Keep-alive timeout (default: 65000)
SERVER_HEADERS_TIMEOUT=60000       # Headers timeout (default: 60000)
SHUTDOWN_TIMEOUT=30000             # Graceful shutdown timeout (default: 30000)

# Logger (optional)
LOGGER_ADAPTER=pino               # pino | custom (default: pino)
LOGGER_FILE_ENABLED=true          # Enable file logging (production only)
LOG_DIR=/var/log/myapp           # Log directory (required when file logging enabled)
```

## Requirements

- Node.js >= 18
- Next.js 15+ with App Router (when using with CLI)
- PostgreSQL
- Redis (optional)

## Testing

```bash
npm test                    # Run all tests
npm test -- route           # Run route tests only
npm test -- --coverage      # With coverage
```

**Test Coverage:** 120+ tests across all modules

## Documentation

### Guides
- [File-based Routing](./src/route/README.md)
- [Database & Repository](./src/db/README.md)
- [Transaction Management](./src/db/docs/transactions.md)
- [Redis Cache](./src/cache/README.md)
- [Error Handling](./src/errors/README.md)
- [Middleware](./src/middleware/README.md)
- [Server Configuration](./src/server/README.md)
- [Logger](./src/logger/README.md)
- [Code Generation](./src/codegen/README.md)

### API Reference
- See module-specific README files linked above

## License

MIT

---

Part of the [SPFN Framework](https://github.com/spfn/spfn)