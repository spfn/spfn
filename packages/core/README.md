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
// src/server/contracts/users.ts
import { Type } from '@sinclair/typebox';

export const getUsersContract = {
  method: 'GET' as const,
  path: '/users',
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
import { getUsersContract } from '../../contracts/users';
import { Repository } from '@spfn/core/db';
import { users } from '../../entities/users';

const app = createApp();

app.bind(getUsersContract, async (c) => {
  const { page = 1, limit = 10 } = c.query;
  const repo = new Repository(db, users);

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
import { db, getDb, Repository } from '@spfn/core/db';
import type { Pageable, Page } from '@spfn/core/db';
```

### Transactions
```typescript
import { Transactional, getTransaction } from '@spfn/core';
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