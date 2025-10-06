# @spfn/core

> SPFN Framework Core - Enterprise-grade backend features for Next.js + Hono

[![npm version](https://badge.fury.io/js/@spfn%2Fcore.svg)](https://www.npmjs.com/package/@spfn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)

A comprehensive TypeScript framework that brings file-based routing, automatic transaction management, and repository patterns to your Hono backend.

## 📦 Installation

```bash
npm install @spfn/core hono drizzle-orm postgres

# Optional: Redis support
npm install ioredis
```

## 🎯 Core Features

- **📁 File-based Routing** - Next.js-style API routing
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
import { Transactional } from '@spfn/core/utils';
import { Repository } from '@spfn/core/db';
import { users } from '@/server/entities/users';
import type { RouteContext } from '@spfn/core/route';

export const middlewares = [Transactional()];

export async function GET(c: RouteContext) {
  const repo = new Repository(db, users);
  const result = await repo.findPage({
    pagination: { page: 1, limit: 10 }
  });
  return c.json(result);
}

export async function POST(c: RouteContext) {
  const data = await c.req.json();
  const repo = new Repository(db, users);
  const user = await repo.save(data);
  return c.json(user, 201);
}
```

## 📚 Module Exports

### Main Export

```typescript
import { startServer, createServer } from '@spfn/core';
// High-level server utilities
```

### Route Module (`@spfn/core/route`)

```typescript
import {
  RouteLoader,
  loadRoutesFromDirectory,
  RouteMapper,
  RouteRegistry,
  RouteScanner
} from '@spfn/core/route';

import type {
  RouteContext,
  RouteHandler,
  RouteDefinition,
  HttpMethod
} from '@spfn/core/route';
```

**Features:**
- File-based route discovery and registration
- Dynamic routes (`[id].ts`) and catch-all (`[...slug].ts`)
- Automatic HTTP method mapping
- Route metadata and tagging

**Documentation:** [Route Module README](./src/route/README.md)

### Database Module (`@spfn/core/db`)

```typescript
import {
  db,                    // Global database instance
  getDb,                 // Transaction-aware db getter
  Repository,            // Spring Data-inspired repository
  BaseRepository,        // Base class for custom repos
  initDatabase,          // Manual initialization
  closeDatabase,         // Cleanup
  getDatabaseInfo        // Connection info
} from '@spfn/core/db';

import type {
  RepositoryOptions,
  FindPageOptions,
  PageResult
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

```
src/server/routes/
├── users/
│   ├── index.ts              → GET/POST /api/users
│   ├── [id].ts              → GET/PUT/DELETE /api/users/:id
│   └── [id]/
│       └── posts/
│           └── index.ts     → GET/POST /api/users/:id/posts
```

```typescript
// routes/users/[id].ts
export async function GET(c: RouteContext) {
  const id = c.req.param('id');
  const user = await repo.findById(Number(id));
  return c.json(user);
}

export async function PUT(c: RouteContext) {
  const id = c.req.param('id');
  const data = await c.req.json();
  const user = await repo.update(Number(id), data);
  return c.json(user);
}

export async function DELETE(c: RouteContext) {
  const id = c.req.param('id');
  await repo.delete(Number(id));
  return c.json({ success: true });
}
```

### Transaction Management

```typescript
import { Transactional } from '@spfn/core/utils';

// Add middleware to route
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  // All DB operations run in a transaction
  const user = await db.insert(users).values(data).returning();
  await db.insert(profiles).values({ userId: user.id });
  await db.insert(settings).values({ userId: user.id });

  // Success → Auto-commit
  // Error → Auto-rollback
  return c.json(user, 201);
}
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
- Route system: 35+ tests
- Database & Repository: 45+ tests
- Transaction management: 15+ tests
- Redis cache: 25+ tests
- Middleware: 10+ tests
- Total: **150+ tests**

## 📦 Package Exports

```json
{
  "exports": {
    ".": "./dist/index.js",
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
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Cache
- [Vitest](https://vitest.dev/) - Test framework

---

Part of the [SPFN Framework](https://github.com/spfn/spfn)