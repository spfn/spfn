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

Automatic graceful shutdown with drain behavior (AWS drain style):

```
SIGTERM
  │
  ├─ Phase 1: server.close()              ← 새 연결 거부, 진행 중 요청 대기
  ├─ Phase 2: stopBoss()                   ← pg-boss 작업 정리
  ├─ Phase 3: ShutdownManager.execute()
  │     ├─ drain: tracked operations 완료 대기
  │     └─ hooks: 등록된 훅 순서대로 실행
  ├─ Phase 4: beforeShutdown lifecycle     ← 기존 lifecycle 호환
  ├─ Phase 5: closeDatabase / closeCache
  └─ process.exit(0)
```

**Signals handled:** `SIGTERM`, `SIGINT`

### ShutdownManager

모듈별 독립적인 shutdown 훅 등록과 장기 작업 추적:

```typescript
import { getShutdownManager } from '@spfn/core/server';

const shutdown = getShutdownManager();

// 1. Shutdown 훅 등록 — 모듈별 독립 cleanup
shutdown.onShutdown('ai-client', async () =>
{
    await openaiClient.close();
}, { timeout: 5000, order: 10 });

shutdown.onShutdown('search-index', async () =>
{
    await elasticClient.close();
}, { order: 20 });

// 2. 장기 작업 추적 — shutdown 시 완료까지 대기
const result = await shutdown.trackOperation(
    'ai-generate',
    aiService.generate(prompt)
);
// shutdown 중이면 자동으로 throw → 503

// 3. Shutdown 상태 확인
if (shutdown.isShuttingDown())
{
    return c.json({ error: 'Server is shutting down' }, 503);
}
```

### Timeout Configuration

```typescript
defineServerConfig()
    .shutdown({
        timeout: 280000,  // 280s (default: k8s 300s - 5s preStop - 15s margin)
    })
    .build();
```

AI 파이프라인 등 장기 작업이 있는 앱은 Helm chart과 함께 조정:

```yaml
# apps/values.yaml
gracefulShutdown:
  terminationGracePeriodSeconds: 660  # 11분
```

```bash
SHUTDOWN_TIMEOUT=640000  # 660 - 5 - 15 = 640s
```

---

## Health Check

Built-in health endpoint at `/health`:

```bash
# Normal
curl http://localhost:8790/health
# { "status": "ok", "timestamp": "2024-..." }

# During shutdown → 503
# { "status": "shutting_down", "timestamp": "2024-..." }
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

# Shutdown
SHUTDOWN_TIMEOUT=280000  # Milliseconds (default: 280s)
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
