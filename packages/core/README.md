# @spfn/core

SPFN Framework Core - File-based routing, transactions, repository pattern for Next.js + Hono

## 🎯 Features

### 📁 File-based Routing
- Next.js App Router style file conventions
- Dynamic routes (`[id].ts`)
- Catch-all routes (`[...slug].ts`)
- Automatic route registration
- Type-safe route handlers

### 💾 Database & Transactions
- Automatic transaction management with `Transactional()` middleware
- AsyncLocalStorage-based transaction propagation
- `getDb()` helper for automatic transaction/normal DB switching
- Read replica support
- Connection pooling

### 📦 Repository Pattern
- Spring Data JPA inspired
- CRUD operations
- Pagination & filtering
- Sorting
- Soft delete support

### 🗄️ Redis Cache
- Singleton instance management
- Master-Replica support
- Sentinel & Cluster patterns
- TLS/SSL support
- Auto-initialization
- Environment-driven configuration

### ⚠️ Error Handling
- Custom error classes
- Unified error response format
- Type-safe error handling

### 🔄 Type Generation
- Entity → API Types (Date → string conversion)
- Routes → Type-safe API client
- Automatic code generation

## 📦 Installation

```bash
npm install @spfn/core drizzle-orm hono postgres

# Optional: Redis support
npm install ioredis
```

## 🚀 Quick Start

### 1. Setup

```typescript
// src/server/app.ts
import { Hono } from 'hono';
import { loadRoutes } from '@spfn/core';

const app = new Hono();

// Auto-load routes from src/server/routes/
await loadRoutes(app, './src/server/routes');

export default app;
```

### 2. Define Entity

```typescript
// src/server/entities/users.ts
import { pgTable, bigserial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    email: text('email').unique().notNull(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
        .defaultNow()
        .notNull(),
});
```

### 3. Create Route

```typescript
// src/server/routes/users/index.ts
import type { RouteContext } from '@spfn/core';
import { Transactional, getDb, Repository } from '@spfn/core';
import { users } from '@/server/entities/users';

export const meta = {
    description: 'User management',
    tags: ['users'],
};

export const middlewares = [Transactional()];

export async function GET(c: RouteContext)
{
    const userRepo = new Repository(getDb(), users);
    const result = await userRepo.findPage({
        pagination: { page: 1, limit: 10 },
    });

    return c.json(result);
}

export async function POST(c: RouteContext)
{
    const data = await c.req.json();
    const userRepo = new Repository(getDb(), users);
    const user = await userRepo.save(data);

    return c.json(user, 201);
}
```

### 4. Using Redis Cache (Optional)

```bash
# .env
REDIS_URL=redis://localhost:6379
```

```typescript
// Auto-initialized by startServer()
import { startServer } from '@spfn/core';
await startServer();

// Use in your code
import { getRedis, getRedisRead } from '@spfn/core';

// Write operations
const redis = getRedis();
if (redis) {
  await redis.set('user:123', JSON.stringify({ name: 'John' }));
}

// Read operations (uses replica if available)
const redisRead = getRedisRead();
if (redisRead) {
  const data = await redisRead.get('user:123');
}
```

For more details, see [Redis Cache Documentation](./src/cache/README.md).

## 📚 Documentation

Full documentation available in the [docs](./docs/) directory:

- [Getting Started](./docs/guides/getting-started.md)
- [Routing](./docs/guides/routing.md)
- [Database & Transactions](./docs/guides/database.md)
- [Repository Pattern](./docs/guides/repository.md)
- [Error Handling](./docs/guides/error-handling.md)
- [API Reference](./docs/api/README.md)

## 🧪 Testing

```bash
npm test
```

## 📄 License

MIT
