# Server

HTTP server configuration with three-level progressive customization.

## Quick Start

```typescript
// src/server/index.ts
import { startServer } from '@spfn/core/server';

await startServer();
```

---

## Configuration Levels

### Level 1: Zero Config

No configuration needed. Uses sensible defaults:

```typescript
import { startServer } from '@spfn/core/server';

await startServer();
// Port: 4000 (or process.env.PORT)
// Host: localhost (or process.env.HOST)
// Middleware: Logger + CORS + ErrorHandler
// Infrastructure: Auto-init from env vars
```

### Level 2: Partial Customization

Create `src/server/server.config.ts`:

```typescript
import { defineServerConfig, defineRouter } from '@spfn/core/server';
import * as userRoutes from './routes/users';
import * as postRoutes from './routes/posts';
import { authMiddleware, rateLimiter } from './middlewares';

const appRouter = defineRouter({
    ...userRoutes,
    ...postRoutes
});

export default defineServerConfig()
    .port(8790)
    .host('0.0.0.0')
    .routes(appRouter)
    .middlewares([authMiddleware, rateLimiter])
    .build();

export type AppRouter = typeof appRouter;
```

### Level 3: Full Control

Create `src/server/app.ts` for custom Hono setup:

```typescript
import { Hono } from 'hono';
import { timing } from 'hono/timing';
import { compress } from 'hono/compress';
import type { AppFactory } from '@spfn/core/server';

export default (async () => {
    const app = new Hono();

    // Custom middleware
    app.use('*', timing());
    app.use('*', compress());

    // Custom routes
    app.get('/custom', (c) => c.json({ custom: true }));

    return app;
}) satisfies AppFactory;
```

Then in `server.config.ts`:

```typescript
export default defineServerConfig()
    .routes(appRouter)  // Routes registered to your custom app
    .build();
```

---

## Configuration Builder

### Basic Options

```typescript
defineServerConfig()
    .port(8790)                    // Server port
    .host('0.0.0.0')               // Server host
    .routes(appRouter)             // Router
    .middlewares([...])            // Global middlewares
    .build();
```

### Infrastructure Options

```typescript
defineServerConfig()
    .database(true)                // Enable database (default: auto from env)
    .redis(true)                   // Enable Redis (default: auto from env)
    .build();
```

### CORS Options

```typescript
defineServerConfig()
    .cors({
        origin: ['https://example.com'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    })
    .build();
```

### Lifecycle Hooks

```typescript
defineServerConfig()
    .beforeStart(async () => {
        // Before server starts
        console.log('Initializing...');
    })
    .afterStart(async (server) => {
        // After server is running
        console.log(`Server running on port ${server.port}`);
    })
    .beforeShutdown(async () => {
        // Before graceful shutdown
        console.log('Shutting down...');
    })
    .build();
```

---

## Router

### Define Router

```typescript
import { defineRouter } from '@spfn/core/route';

export const appRouter = defineRouter({
    getUser,
    createUser,
    updateUser,
    deleteUser
});
```

### Nested Routers

```typescript
export const appRouter = defineRouter({
    users: defineRouter({
        get: getUser,
        create: createUser,
        list: getUsers
    }),
    posts: defineRouter({
        get: getPost,
        create: createPost
    })
});
```

### Type Export

```typescript
// server.config.ts
export type AppRouter = typeof appRouter;

// Use in Next.js client
import type { AppRouter } from '@/server/server.config';
import { createApi } from '@spfn/core/nextjs';

const api = createApi<AppRouter>();
```

---

## Graceful Shutdown

Automatic graceful shutdown handling:

1. Stop accepting new connections
2. Wait for in-flight requests
3. Close database connections
4. Close Redis connections
5. Exit process

**Signals handled:** `SIGTERM`, `SIGINT`

---

## Health Check

Built-in health endpoint at `/health`:

```bash
curl http://localhost:8790/health
# { "status": "ok", "timestamp": "2024-..." }
```

---

## Environment Variables

```bash
# Server
PORT=8790
HOST=localhost
NODE_ENV=development

# Database
DATABASE_URL=postgresql://localhost:5432/mydb
DATABASE_WRITE_URL=postgresql://primary:5432/mydb
DATABASE_READ_URL=postgresql://replica:5432/mydb

# Redis
REDIS_URL=redis://localhost:6379
```

---

## File Structure

```
src/server/
├── server.config.ts    # Configuration (Level 2)
├── app.ts              # Custom Hono app (Level 3, optional)
├── index.ts            # Entry point
├── entities/           # Database schema
├── repositories/       # Data access
├── routes/             # API routes
└── middlewares/        # Custom middleware
```

---

## Startup Banner

On startup, server displays:

```
╭──────────────────────────────────────╮
│                                      │
│     SPFN Server v1.0.0               │
│                                      │
│     http://localhost:8790            │
│                                      │
│     Press Ctrl+C to stop             │
│                                      │
╰──────────────────────────────────────╯

  ✓ Database connected
  ✓ Redis connected
  ✓ 12 routes registered
```

---

## Best Practices

### Do

```typescript
// 1. Export router type for client usage
export type AppRouter = typeof appRouter;

// 2. Use lifecycle hooks for initialization
.beforeStart(async () => {
    await warmupCache();
})

// 3. Register global middlewares
.middlewares([authMiddleware, rateLimiter])

// 4. Use Level 2 for most projects
defineServerConfig()
    .port(8790)
    .routes(appRouter)
    .build();
```

### Don't

```typescript
// 1. Don't hardcode port in production
.port(8790)  // Use process.env.PORT instead

// 2. Don't skip database auto-init unless needed
.database(false)  // Usually let it auto-detect

// 3. Don't use Level 3 unless necessary
// Level 2 covers most use cases
```
