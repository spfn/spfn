# @spfn/core

> SPFN Framework Core - Enterprise-grade backend features for Next.js + Hono

[![npm version](https://badge.fury.io/js/@spfn%2Fcore.svg)](https://www.npmjs.com/package/@spfn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

A comprehensive TypeScript framework that brings file-based routing, automatic transaction management, and repository patterns to your Hono backend.

## 📦 Installation

```bash
npm install @spfn/core hono drizzle-orm postgres @sinclair/typebox

# Optional: Redis support
npm install ioredis
```

## 🎯 Core Features

- **📁 File-based Routing** - Next.js-style API routing with TypeBox contracts
- **✅ Contract-Based Validation** - Automatic TypeBox validation with bind()
- **🔄 Transaction Management** - Automatic commit/rollback
- **📦 Repository Pattern** - Spring Data-inspired data access
- **🗄️ Redis Cache** - Master-replica support with auto-detection
- **⚠️ Error Handling** - Custom error classes with unified responses
- **🔐 Middleware** - Request logging, CORS, error handling
- **🎨 Type Generation** - Entity → API types, Routes → Client

## 🚀 Quick Start

### 1. Create Server

```typescript
// src/server/index.ts
import { startServer } from '@spfn/core/server';

// Zero config - auto-loads routes and initializes infrastructure
await startServer();
```

### 2. Define Routes

```typescript
// src/server/routes/users/index.ts
import { Hono } from 'hono';
import { bind } from '@spfn/core';
import { Transactional } from '@spfn/core/utils';
import { db, Repository } from '@spfn/core/db';
import { users } from '@/server/entities/users';
import { Type } from '@sinclair/typebox';

const app = new Hono();

// Define contracts
const getUsersContract = {
  query: Type.Object({
    page: Type.Optional(Type.Number({ minimum: 1 })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
  }),
  response: Type.Object({
    data: Type.Array(Type.Object({
      id: Type.Number(),
      name: Type.String(),
      email: Type.String(),
    })),
    total: Type.Number(),
  }),
};

const createUserContract = {
  body: Type.Object({
    name: Type.String(),
    email: Type.String({ format: 'email' }),
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String(),
  }),
};

// GET /users - with validation
app.get('/', bind(getUsersContract, async (c) => {
  const { page = 1, limit = 10 } = c.query;
  const repo = new Repository(db, users);
  const result = await repo.findPage({
    pagination: { page, limit }
  });
  return c.json(result);
}));

// POST /users - with validation and transaction
app.post('/', Transactional(), bind(createUserContract, async (c) => {
  const data = await c.data(); // ✅ Auto-validated
  const repo = new Repository(db, users);
  const user = await repo.save(data);
  return c.json(user);
}));

export default app;
```

## 📚 Module Exports

### Main Export

```typescript
import { startServer, createServer } from '@spfn/core';
// High-level server utilities
```

### Client Module (`@spfn/core/client`)

```typescript
import {
  ContractClient,        // Contract-based HTTP client
  createClient,          // Factory function
  client,                // Default instance
  ApiClientError         // Error class
} from '@spfn/core/client';

import type {
  InferContract,         // Type inference from contracts
  CallOptions,           // Client call options
  ClientConfig           // Client configuration
} from '@spfn/core/client';
```

**Features:**
- **Type-safe API calls**: Infer request/response types from RouteContract
- **Auto-validation**: TypeBox validation for requests and responses
- **Path parameters**: Automatic URL parameter substitution
- **Query strings**: Type-safe query parameter handling
- **Error handling**: Custom ApiClientError with detailed info
- **Configurable**: Custom fetch, baseUrl, headers, timeout

**Documentation:** [Client Module README](./src/client/README.md)

### Route Module (`@spfn/core/route`)

```typescript
import {
  bind,                  // Contract-based route binding
  loadRoutes,            // Auto-load routes from directory
  AutoRouteLoader        // Advanced route loading control
} from '@spfn/core/route';

import type {
  RouteContext,          // Type-safe route context
  RouteContract,         // Contract definition
  RouteHandler,          // Route handler function type
  RouteInfo,             // Route metadata
  RouteStats,            // Loading statistics
  HttpMethod,            // HTTP method type
  InferContract          // Type inference from contracts
} from '@spfn/core/route';
```

**Features:**
- **Auto-discovery**: Scans `src/server/routes` directory automatically
- **File-based routing**: `index.ts` → `/`, `[id].ts` → `/:id`, `[...slug].ts` → `/*`
- **Contract validation**: TypeBox-based type-safe validation with `bind()`
- **Route grouping**: Natural grouping by directory structure
- **Statistics**: Track total, by priority (static/dynamic/catch-all), by tags
- **Type safety**: End-to-end type inference for params, query, body, response

**Documentation:** [Route Module README](./src/route/README.md)

### Database Module (`@spfn/core/db`)

```typescript
import {
  db,                    // Global database instance
  getDb,                 // Transaction-aware db getter
  Repository,            // Spring Data-inspired repository
  initDatabase,          // Manual initialization
  closeDatabase,         // Cleanup
  getDatabaseInfo        // Connection info
} from '@spfn/core/db';

import type {
  Pageable,              // Pagination parameters
  Page                   // Paginated result
} from '@spfn/core/db';
```

**Features:**
- Lazy initialization with environment detection
- Read/write separation (primary + replica)
- Transaction-aware operations
- Repository pattern with pagination, filtering, sorting

**Documentation:** [Database Module README](./src/db/README.md)

### Server Module (`@spfn/core/server`)

```typescript
import {
  startServer,           // Start server with auto-config
  createServer           // Create app without starting
} from '@spfn/core/server';

import type {
  ServerConfig,          // Server configuration
  AppFactory             // App factory type
} from '@spfn/core/server';
```

**Features:**
- 3 levels of control (zero config, partial, full)
- Auto-loads routes from `src/server/routes`
- Built-in middleware (logger, CORS, error handler)
- Lifecycle hooks (beforeRoutes, afterRoutes)

**Documentation:** [Server Module README](./src/server/README.md)

### Utils Module (`@spfn/core/utils`)

```typescript
import {
  Transactional,         // Transaction middleware
  getTransaction,        // Get current transaction
  runWithTransaction     // Run in transaction context
} from '@spfn/core/utils';

import type {
  TransactionContext,
  TransactionalOptions
} from '@spfn/core/utils';
```

**Features:**
- Automatic transaction management
- AsyncLocalStorage-based propagation
- Transaction logging and slow query warnings
- Auto-commit on success, auto-rollback on error

**Documentation:** [Utils Module README](./src/utils/README.md)

### Cache Module (`@spfn/core`)

```typescript
import {
  initRedis,             // Initialize Redis from env
  getRedis,              // Get write instance
  getRedisRead,          // Get read instance (replica)
  closeRedis             // Cleanup
} from '@spfn/core';
```

**Features:**
- Auto-detects master/replica from environment
- Singleton pattern with lazy initialization
- Connection pooling and health checks
- TLS/SSL support

**Documentation:** [Cache Module README](./src/cache/README.md)

### Scripts Module (`@spfn/core/scripts`)

```typescript
import {
  generateEntityApiType,  // Entity → API type conversion
  generateApiTagFile      // Routes → API tag file
} from '@spfn/core/scripts';
```

**Features:**
- Entity type generation (Date → string conversion)
- API client type generation from routes
- Automatic code generation

## 📖 Usage Examples

### File-based Routing

**Directory Structure → URL Mapping**

```
src/server/routes/
├── users/
│   ├── index.ts              → /users
│   ├── [id].ts              → /users/:id
│   └── [id]/
│       └── posts/
│           └── index.ts     → /users/:id/posts
├── posts/
│   ├── index.ts              → /posts
│   └── [...slug].ts         → /posts/* (catch-all)
```

**Route File Pattern**

Each route file exports a Hono app instance:

```typescript
// routes/users/index.ts
import { Hono } from 'hono';
import { bind, type RouteContract } from '@spfn/core';
import { Type } from '@sinclair/typebox';

const app = new Hono();

// Define contract with TypeBox
const getUsersContract = {
  query: Type.Object({
    page: Type.Optional(Type.String()),
    limit: Type.Optional(Type.String()),
  }),
  response: Type.Object({
    users: Type.Array(Type.Object({
      id: Type.Number(),
      name: Type.String(),
      email: Type.String(),
    })),
    total: Type.Number(),
  }),
} as const satisfies RouteContract;

// GET /users
app.get('/', bind(getUsersContract, async (c) => {
  const { page = '1', limit = '10' } = c.query;
  const users = await repo.findPage({
    pagination: { page: Number(page), limit: Number(limit) }
  });
  return c.json(users);
}));

// POST /users
const createUserContract = {
  body: Type.Object({
    name: Type.String(),
    email: Type.String({ format: 'email' }),
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String(),
  }),
} as const satisfies RouteContract;

app.post('/', bind(createUserContract, async (c) => {
  const data = await c.data();
  const user = await repo.save(data);
  return c.json(user, 201);
}));

export default app;
```

**Dynamic Routes**

```typescript
// routes/users/[id].ts
import { Hono } from 'hono';
import { bind, type RouteContract } from '@spfn/core';
import { Type } from '@sinclair/typebox';

const app = new Hono();

const getUserContract = {
  params: Type.Object({
    id: Type.String(),
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String(),
  }),
} as const satisfies RouteContract;

// GET /users/:id
app.get('/', bind(getUserContract, async (c) => {
  // ✅ c.params.id is type-safe and validated
  const user = await repo.findById(Number(c.params.id));
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  return c.json(user);
}));

// PUT /users/:id
const updateUserContract = {
  params: Type.Object({ id: Type.String() }),
  body: Type.Object({
    name: Type.Optional(Type.String()),
    email: Type.Optional(Type.String({ format: 'email' })),
  }),
  response: Type.Object({
    id: Type.Number(),
    name: Type.String(),
    email: Type.String(),
  }),
} as const satisfies RouteContract;

app.put('/', bind(updateUserContract, async (c) => {
  const data = await c.data();
  const user = await repo.update(Number(c.params.id), data);
  return c.json(user);
}));

// DELETE /users/:id
app.delete('/', async (c) => {
  await repo.delete(Number(c.params.id));
  return c.json({ success: true }, 204);
});

export default app;
```

**Catch-all Routes**

```typescript
// routes/posts/[...slug].ts
import { Hono } from 'hono';

const app = new Hono();

// Matches /posts/2024/01/hello-world, /posts/a/b/c, etc.
app.get('/*', async (c) => {
  const slug = c.req.param('slug'); // "2024/01/hello-world"
  const post = await findPostBySlug(slug);
  return c.json(post);
});

export default app;
```

**Auto-loading**

Routes are automatically loaded by `startServer()`:

```typescript
import { startServer } from '@spfn/core/server';

// Auto-loads all routes from src/server/routes
await startServer();
```

Manual loading:

```typescript
import { Hono } from 'hono';
import { loadRoutes } from '@spfn/core/route';

const app = new Hono();

const stats = await loadRoutes(app, {
  routesDir: 'src/server/routes',  // Optional, default
  debug: true                       // Show loading stats
});

console.log(stats);
// {
//   total: 4,
//   byPriority: { static: 2, dynamic: 1, catchAll: 1 },
//   byTag: { users: 2, posts: 2, admin: 1, content: 1 },
//   routes: [...]
// }
```

### Transaction Management

```typescript
import { Hono } from 'hono';
import { bind } from '@spfn/core';
import { Transactional } from '@spfn/core/utils';

const app = new Hono();

// Option 1: Apply transaction middleware to all routes
app.use('*', Transactional());

app.post('/', bind(createUserContract, async (c) => {
  const data = await c.data();
  // All DB operations run in a transaction
  const user = await db.insert(users).values(data).returning();
  await db.insert(profiles).values({ userId: user.id });
  await db.insert(settings).values({ userId: user.id });
  // Success → Auto-commit, Error → Auto-rollback
  return c.json(user, 201);
}));

// Option 2: Per-route middleware
app.put('/:id', Transactional(), bind(updateUserContract, async (c) => {
  const data = await c.data();
  // Transaction auto-managed
  return c.json(data);
}));

export default app;
```

### Repository Pattern

```typescript
import { Repository } from '@spfn/core/db';

const userRepo = new Repository(db, users);

// Pagination
const page = await userRepo.findPage({
  pagination: { page: 1, limit: 10 },
  where: { status: 'active' },
  sort: { field: 'createdAt', order: 'desc' }
});

// CRUD operations
const user = await userRepo.findById(1);
const created = await userRepo.save({ email: 'test@example.com' });
const updated = await userRepo.update(1, { name: 'New Name' });
await userRepo.delete(1);

// Bulk operations
const users = await userRepo.findAll({ where: { status: 'active' } });
await userRepo.deleteMany([1, 2, 3]);
```

### Redis Cache

```typescript
import { initRedis, getRedis, getRedisRead } from '@spfn/core';

// Initialize (auto-called by startServer)
await initRedis();

// Write operations (to master)
const redis = getRedis();
await redis?.set('user:123', JSON.stringify(user));
await redis?.setex('session:abc', 3600, token);

// Read operations (from replica if available)
const redisRead = getRedisRead();
const cached = await redisRead?.get('user:123');
```

### Server Configuration

```typescript
// Level 1: Zero config
import { startServer } from '@spfn/core/server';
await startServer(); // Uses all defaults

// Level 2: Partial config (server.config.ts)
export default {
  port: 4000,
  cors: { origin: '*' },
  middleware: { logger: true },
  beforeRoutes: async (app) => {
    // Custom setup
  }
};

// Level 3: Full control (app.ts)
export default async () => {
  const app = new Hono();
  // Full customization
  return app;
};
```

## 🔧 Configuration

### Environment Variables

```bash
# Database (required)
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Database Read Replica (optional)
DATABASE_READ_URL=postgresql://user:pass@replica:5432/db

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Redis Master-Replica (optional)
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379

# Server
PORT=4000
HOST=localhost
NODE_ENV=development
```

### Server Config

```typescript
// src/server/server.config.ts
import type { ServerConfig } from '@spfn/core/server';

export default {
  port: 4000,
  host: 'localhost',

  cors: {
    origin: ['http://localhost:3000'],
    credentials: true,
  },

  middleware: {
    logger: true,
    cors: true,
    errorHandler: true,
  },

  routesPath: 'src/server/routes',
  debug: process.env.NODE_ENV === 'development',

  beforeRoutes: async (app) => {
    // Run before route loading
  },

  afterRoutes: async (app) => {
    // Run after route loading
  },
} satisfies ServerConfig;
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- route
npm test -- db
npm test -- cache

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

**Test Coverage:**
- Route system: 24 tests (auto-loader + bind validation)
- Database & Repository: 45+ tests
- Transaction management: 15+ tests
- Redis cache: 25+ tests
- Middleware: 10+ tests
- Total: **120+ tests**

## 📦 Package Exports

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client/index.js",
    "./route": "./dist/route/index.js",
    "./db": "./dist/db/index.js",
    "./server": "./dist/server/index.js",
    "./utils": "./dist/utils/index.js",
    "./scripts": "./dist/scripts/index.js"
  }
}
```

## 🏗️ Build

```bash
# Build for production
npm run build

# Build and watch for changes
npm run dev

# Type check only
npm run type-check
```

## 📚 Full Documentation

- [File-based Routing](./src/route/README.md) - Route discovery and registration
- [Database & Repository](./src/db/README.md) - Data access patterns
- [Transaction Management](./src/utils/README.md) - Automatic transactions
- [Server Configuration](./src/server/README.md) - Server setup and middleware
- [Redis Cache](./src/cache/README.md) - Caching strategies
- [Error Handling](./docs/guides/error-handling.md) - Custom errors
- [Type Generation](./docs/guides/type-generation.md) - Code generation

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](../../CONTRIBUTING.md) for details.

## 📄 License

MIT - see [LICENSE](../../LICENSE) for details.

## 🙏 Credits

Built with:
- [Hono](https://hono.dev/) - Ultra-fast web framework
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM
- [TypeBox](https://github.com/sinclairzx81/typebox) - JSON Schema validation
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Cache
- [Vitest](https://vitest.dev/) - Test framework

---

Part of the [SPFN Framework](https://github.com/spfn/spfn)