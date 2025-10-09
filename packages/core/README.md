# @spfn/core

> Core framework for building type-safe backend APIs with Next.js and Hono

[![npm version](https://badge.fury.io/js/@spfn%2Fcore.svg)](https://www.npmjs.com/package/@spfn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

## Installation

**Recommended: Use CLI**
```bash
npm install -g @spfn/cli
spfn init
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
import { getRepository } from '@spfn/core/db';
import { users } from '../../entities/users.js';

const app = createApp();

app.bind(getUsersContract, async (c) => {
  const { page = 1, limit = 10 } = c.query;

  // Get repository singleton - automatically cached
  const repo = getRepository(users);

  const result = await repo.findPage({
    pagination: { page, limit }
  });

  return c.json(result);
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
│  - Use repositories                     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Repository Layer                 │  Data access
│  - CRUD operations                      │
│  - Custom queries                       │
│  - Extend base Repository               │
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

**2. Repository Layer** - Data access with custom methods

```typescript
// src/server/repositories/posts.repository.ts
import { eq } from 'drizzle-orm';
import { Repository } from '@spfn/core/db';
import { posts } from '../entities';
import type { Post } from '../entities';

export class PostRepository extends Repository<typeof posts>
{
  async findBySlug(slug: string): Promise<Post | null>
  {
    return this.findOne(eq(this.table.slug, slug));
  }

  async findPublished(): Promise<Post[]>
  {
    const results = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.status, 'published'))
      .orderBy(this.table.createdAt);

    return results;
  }
}
```

**3. Service Layer** - Business logic (Function-based pattern)

```typescript
// src/server/services/posts.ts
import { getRepository } from '@spfn/core/db';
import { posts } from '../entities';
import { PostRepository } from '../repositories/posts.repository';
import type { NewPost, Post } from '../entities';

/**
 * Create a new post
 */
export async function createPost(data: {
  title: string;
  content: string;
}): Promise<Post> {
  // Get repository singleton
  const repo = getRepository(posts, PostRepository);

  // Business logic: Generate slug from title
  const slug = generateSlug(data.title);

  // Validation: Check if slug already exists
  const existing = await repo.findBySlug(slug);
  if (existing) {
    throw new Error('Post with this title already exists');
  }

  // Create post
  return repo.save({
    ...data,
    slug,
    status: 'draft',
  });
}

/**
 * Publish a post
 */
export async function publishPost(id: string): Promise<Post | null> {
  const repo = getRepository(posts, PostRepository);
  return repo.update(id, { status: 'published' });
}

/**
 * Get all published posts
 */
export async function getPublishedPosts(): Promise<Post[]> {
  const repo = getRepository(posts, PostRepository);
  return repo.findPublished();
}

/**
 * Helper: Generate URL-friendly slug from title
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
```

**4. Routes Layer** - HTTP API

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
import { createPost, getPublishedPosts } from '../../services/posts';
import { createPostContract, listPostsContract } from './contracts';

const app = createApp();

// POST /posts - Create new post (with transaction)
app.bind(createPostContract, Transactional(), async (c) => {
  const body = await c.data();
  const post = await createPost(body);
  // ✅ Auto-commit on success, auto-rollback on error
  return c.json(post, 201);
});

// GET /posts - List published posts (no transaction needed)
app.bind(listPostsContract, async (c) => {
  const posts = await getPublishedPosts();
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
| **Repository** | Data access | CRUD, custom queries, joins |
| **Service** | Business logic | Validation, orchestration, rules |
| **Routes** | HTTP interface | Contracts, request handling |

### Best Practices

**Entity Layer:**
- ✅ Use schema helpers: `id()`, `timestamps()`
- ✅ Export inferred types: `Post`, `NewPost`
- ✅ Use TEXT with enum for status fields

**Repository Layer:**
- ✅ Extend `Repository<typeof table>` for custom methods
- ✅ Use `getRepository(table)` or `getRepository(table, CustomRepo)`
- ✅ Add domain-specific query methods
- ✅ Return typed results

**Service Layer:**
- ✅ Use function-based pattern (export async functions)
- ✅ Get repositories via `getRepository()` (singleton)
- ✅ Implement business logic and validation
- ✅ Throw descriptive errors
- ✅ Keep functions focused and small

**Routes Layer:**
- ✅ Keep handlers thin (delegate to services)
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

### 🗄️ Database & Repository
Drizzle ORM integration with repository pattern and pagination.

**[→ Read Database Documentation](./src/db/README.md)**

**Guides:**
- [Repository Pattern](./src/db/docs/repository.md)
- [Schema Helpers](./src/db/docs/schema-helpers.md)
- [Database Manager](./src/db/docs/database-manager.md)

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
  getDb,
  Repository,
  getRepository
} from '@spfn/core/db';
import type { Pageable, Page } from '@spfn/core/db';
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

### API Reference
- See module-specific README files linked above

## License

MIT

---

Part of the [SPFN Framework](https://github.com/spfn/spfn)