# @spfn/core

Type-safe Node.js backend framework built on Hono + Drizzle ORM.

[![npm version](https://badge.fury.io/js/@spfn%2Fcore.svg)](https://www.npmjs.com/package/@spfn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

> **Beta Release**: Core APIs are stable but may have minor changes before 1.0.

## Installation

```bash
pnpm add @spfn/core
```

## Quick Start

### 1. Define Entity

```typescript
// src/server/entities/users.ts
import { pgTable, text, boolean } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

### 2. Create Repository

```typescript
// src/server/repositories/user.repository.ts
import { BaseRepository } from '@spfn/core/db';
import { users, type User, type NewUser } from '../entities/users';

export class UserRepository extends BaseRepository
{
    async findById(id: string): Promise<User | null>
    {
        return this._findOne(users, { id });
    }

    async findByEmail(email: string): Promise<User | null>
    {
        return this._findOne(users, { email });
    }

    async findAll(): Promise<User[]>
    {
        return this._findMany(users);
    }

    async create(data: NewUser): Promise<User>
    {
        return this._create(users, data);
    }

    async update(id: string, data: Partial<NewUser>): Promise<User | null>
    {
        return this._updateOne(users, { id }, data);
    }

    async delete(id: string): Promise<User | null>
    {
        return this._deleteOne(users, { id });
    }
}
```

### 3. Define Routes

```typescript
// src/server/routes/users.ts
import { route } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { Type } from '@sinclair/typebox';
import { UserRepository } from '../repositories/user.repository';

const userRepo = new UserRepository();

export const getUsers = route.get('/users')
    .handler(async () => {
        return userRepo.findAll();
    });

export const getUser = route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .handler(async (c) => {
        const { params } = await c.data();
        const user = await userRepo.findById(params.id);

        if (!user)
        {
            throw new Error('User not found');
        }

        return user;
    });

export const createUser = route.post('/users')
    .input({
        body: Type.Object({
            email: Type.String({ format: 'email' }),
            name: Type.String({ minLength: 1 })
        })
    })
    .use([Transactional()])
    .handler(async (c) => {
        const { body } = await c.data();
        return userRepo.create(body);
    });

export const updateUser = route.patch('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        body: Type.Object({
            email: Type.Optional(Type.String({ format: 'email' })),
            name: Type.Optional(Type.String({ minLength: 1 }))
        })
    })
    .use([Transactional()])
    .handler(async (c) => {
        const { params, body } = await c.data();
        const user = await userRepo.update(params.id, body);

        if (!user)
        {
            throw new Error('User not found');
        }

        return user;
    });

export const deleteUser = route.delete('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() })
    })
    .use([Transactional()])
    .handler(async (c) => {
        const { params } = await c.data();
        const user = await userRepo.delete(params.id);

        if (!user)
        {
            throw new Error('User not found');
        }

        return { success: true };
    });
```

### 4. Configure Server

```typescript
// src/server/server.config.ts
import { defineServerConfig, defineRouter } from '@spfn/core/server';
import * as userRoutes from './routes/users';

const appRouter = defineRouter({
    ...userRoutes
});

export default defineServerConfig()
    .port(8790)
    .routes(appRouter)
    .build();

export type AppRouter = typeof appRouter;
```

### 5. Start Server

```typescript
// src/server/index.ts
import { startServer } from '@spfn/core/server';

await startServer();
```

### 6. Environment Variables

```bash
# .env
DATABASE_URL=postgresql://localhost:5432/mydb
PORT=8790
```

---

## Architecture Overview

```
┌─────────────────────────────────────────┐
│            Routes Layer                  │  API endpoints + validation
│  route.get('/users/:id').handler(...)   │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│         Repository Layer                 │  Business logic + data access
│  class UserRepository extends Base...   │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│           Entity Layer                   │  Database schema (Drizzle)
│  pgTable('users', { id, email, ... })   │
└─────────────────────────────────────────┘
```

**Key Principles:**
- **Route**: Thin layer, input validation only
- **Repository**: All business logic and DB access
- **Entity**: Schema definition only, no logic

---

## Directory Structure

```
src/server/
├── entities/              # Database schema
│   ├── users.ts
│   └── index.ts
├── repositories/          # Data access + business logic
│   ├── user.repository.ts
│   └── index.ts
├── routes/                # API routes
│   ├── users.ts
│   └── index.ts
├── server.config.ts       # Server configuration
└── index.ts               # Entry point
```

---

## Core Concepts

### Route Definition

```typescript
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

// GET with params and query
route.get('/users/:id')
    .input({
        params: Type.Object({ id: Type.String() }),
        query: Type.Object({ include: Type.Optional(Type.String()) })
    })
    .handler(async (c) => {
        const { params, query } = await c.data();
        // params.id, query.include are fully typed
    });

// POST with body
route.post('/users')
    .input({
        body: Type.Object({
            email: Type.String(),
            name: Type.String()
        })
    })
    .handler(async (c) => {
        const { body } = await c.data();
        // body.email, body.name are fully typed
    });
```

### Repository Pattern

```typescript
import { BaseRepository } from '@spfn/core/db';

export class UserRepository extends BaseRepository
{
    // Protected helpers available:
    // _findOne, _findMany, _create, _createMany
    // _updateOne, _updateMany, _deleteOne, _deleteMany
    // _count, _upsert

    async findActive()
    {
        return this._findMany(users, {
            where: { isActive: true },
            orderBy: desc(users.createdAt),
            limit: 10
        });
    }
}
```

### Transaction

```typescript
import { Transactional } from '@spfn/core/db';

// Middleware-based (recommended)
route.post('/users')
    .use([Transactional()])
    .handler(async (c) => {
        // Auto commit on success
        // Auto rollback on error
    });

// Manual control
import { runWithTransaction } from '@spfn/core/db';

await runWithTransaction(async () => {
    await userRepo.create(userData);
    await profileRepo.create(profileData);
});
```

### Schema Helpers

```typescript
import {
    id,              // bigserial primary key
    uuid,            // uuid primary key
    timestamps,      // createdAt, updatedAt
    foreignKey,      // required FK with cascade
    optionalForeignKey,  // nullable FK
    softDelete,      // deletedAt, deletedBy
    enumText,        // type-safe enum
    typedJsonb       // type-safe JSONB
} from '@spfn/core/db';

export const posts = pgTable('posts', {
    id: id(),
    title: text('title').notNull(),
    authorId: foreignKey('author', () => users.id),
    status: enumText('status', ['draft', 'published']).default('draft'),
    metadata: typedJsonb<{ views: number }>('metadata'),
    ...timestamps(),
    ...softDelete()
});
```

---

## Module Documentation

| Module | Description |
|--------|-------------|
| [Route](./docs/route.md) | Route definition, validation, response patterns |
| [Database](./docs/database.md) | Connection, helpers, transactions |
| [Entity](./docs/entity.md) | Schema definition, column helpers |
| [Repository](./docs/repository.md) | BaseRepository, CRUD patterns |
| [Middleware](./docs/middleware.md) | Named middleware, skip control |
| [Server](./docs/server.md) | Configuration, lifecycle hooks |
| [Errors](./docs/errors.md) | Error types, handling patterns |
| [Environment](./docs/env.md) | Type-safe environment variables |
| [Codegen](./docs/codegen.md) | API client generation |
| [Cache](./docs/cache.md) | Redis caching |
| [Event](./docs/event.md) | Event system |
| [Job](./docs/job.md) | Background jobs |
| [Logger](./docs/logger.md) | Logging |
| [Next.js](./docs/nextjs.md) | Next.js integration, RPC proxy |

---

## CLI Commands

```bash
# Migration
npx spfn db generate    # Generate migration
npx spfn db migrate     # Apply migration

# Development
pnpm spfn:dev           # Start dev server (auto codegen)

# API Client Generation
pnpm spfn codegen run

# Database Studio
pnpm drizzle-kit studio
```

---

## License

MIT
