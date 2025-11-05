---
title: "App (Server)"
description: "Complete API reference for server configuration and lifecycle management"
order: 2
available: true
---

# App (Server)

Superfunction provides flexible server configuration with three levels of customization: zero-config, partial config, and full control.

## createServer

Creates a Hono app instance with Superfunction routing and middleware.

```typescript
function createServer(config?: ServerConfig): Promise<Hono>
```

### Example

```typescript
import { createServer } from '@spfn/core';

const app = await createServer({
  port: 8790,
  cors: { origin: '*' },
});

// Use app with @hono/node-server
import { serve } from '@hono/node-server';
serve(app);
```

## startServer

Creates and starts the server in one step with automatic lifecycle management.

```typescript
function startServer(config?: ServerConfig): Promise<ServerInstance>
```

### Example

```typescript
import { startServer } from '@spfn/core';

// Zero config - uses defaults
await startServer();

// With config
const instance = await startServer({
  port: 8790,
  host: '0.0.0.0',
});

// Manual shutdown
await instance.close();
```

## ServerConfig

Configuration options for server customization.

### Basic Options

| Property | Type | Default |
|----------|------|---------|
| `port` | `number` | 8790 (CLI) / 4000 (programmatic) |
| `host` | `string` | localhost |
| `routesPath` | `string` | src/server/routes |
| `debug` | `boolean` | NODE_ENV === 'development' |

### CORS Configuration

```typescript
export default {
  cors: {
    origin: ['https://example.com', 'https://app.example.com'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['X-Total-Count'],
    credentials: true,
    maxAge: 86400,
  },
} satisfies ServerConfig;

// Disable CORS
export default {
  cors: false,
} satisfies ServerConfig;
```

### Middleware Configuration

```typescript
export default {
  // Disable built-in middleware
  middleware: {
    logger: false,
    cors: true,
    errorHandler: true,
  },

  // Add custom middleware
  use: [
    async (c, next) => {
      c.header('X-Custom-Header', 'value');
      await next();
    },
  ],

  // Named middleware (can be skipped per route)
  middlewares: [
    {
      name: 'auth',
      handler: authMiddleware(),
    },
    {
      name: 'rateLimit',
      handler: rateLimitMiddleware(),
    },
  ],
} satisfies ServerConfig;
```

### Database Configuration

```typescript
export default {
  database: {
    // Connection pool
    pool: {
      max: 20,              // Max connections
      idleTimeout: 30,      // Seconds
    },

    // Health checks
    healthCheck: {
      enabled: true,
      interval: 60000,      // 60 seconds
      reconnect: true,
      maxRetries: 3,
      retryInterval: 5000,  // 5 seconds
    },

    // Query monitoring
    monitoring: {
      enabled: true,
      slowThreshold: 1000,  // 1 second
      logQueries: false,    // Don't log SQL
    },
  },
} satisfies ServerConfig;
```

### Timeout Configuration

```typescript
export default {
  timeout: {
    request: 120000,      // 2 minutes
    keepAlive: 65000,     // 65 seconds
    headers: 60000,       // 60 seconds
  },
} satisfies ServerConfig;
```

### Graceful Shutdown

```typescript
export default {
  shutdown: {
    timeout: 30000,  // 30 seconds
  },
} satisfies ServerConfig;
```

### Health Check Endpoint

```typescript
export default {
  healthCheck: {
    enabled: true,
    path: '/health',
    detailed: true,  // Include DB, Redis status
  },
} satisfies ServerConfig;
```

### Infrastructure Control

Control automatic initialization of database and Redis:

```typescript
export default {
  infrastructure: {
    database: false,  // Disable auto database initialization
    redis: false,     // Disable auto Redis initialization
  },
} satisfies ServerConfig;
```

By default, both database and Redis are automatically initialized if credentials exist in environment variables.

### Lifecycle Hooks

SPFN provides hooks at different stages of server lifecycle:

```typescript
import { getDatabase } from '@spfn/core/db';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

export default {
  lifecycle: {
    // Before infrastructure (DB/Redis) initialization
    beforeInfrastructure: async (config) => {
      console.log('Setting up monitoring...');
      await initMonitoring();
    },

    // After infrastructure is ready
    // Database and Redis are available via getDatabase() and getRedis()
    afterInfrastructure: async () => {
      // Run migrations
      const db = getDatabase();
      await migrate(db, { migrationsFolder: './drizzle' });

      // Seed initial data
      await seedInitialData(db);

      // Initialize services that depend on DB/Redis
      await initSearchService(db);
    },

    // Before routes are loaded
    beforeRoutes: async (app) => {
      app.use('/*', async (c, next) => {
        console.log('Global middleware');
        await next();
      });
    },

    // After routes are loaded
    afterRoutes: async (app) => {
      app.notFound((c) => {
        return c.json({ error: 'Not Found' }, 404);
      });
    },

    // After server starts and is ready to accept requests
    afterStart: async (instance) => {
      console.log(`Server ready at http://${instance.config.host}:${instance.config.port}`);
      await notifyHealthCheckService();
    },

    // Before graceful shutdown (infrastructure still available)
    beforeShutdown: async () => {
      console.log('Cleaning up custom resources...');
      await closeSearchService();
      await closeMessageQueue();
    },
  },
} satisfies ServerConfig;
```

**Execution Order:**
1. `beforeInfrastructure` - Pre-initialization setup
2. Database & Redis initialization (if enabled)
3. `afterInfrastructure` - Post-infrastructure setup
4. `beforeRoutes` - Before route loading
5. Load routes
6. `afterRoutes` - After route loading
7. Start HTTP server
8. `afterStart` - Server is ready
9. ... server running ...
10. SIGTERM/SIGINT received
11. `beforeShutdown` - Pre-shutdown cleanup
12. Close database & Redis connections
13. Exit process

## ServerInstance

Object returned by `startServer()` for server lifecycle management.

```typescript
interface ServerInstance {
  server: HTTPServer;      // Node.js HTTP server
  app: Hono;              // Hono app instance
  config: ServerConfig;   // Resolved configuration
  close(): Promise<void>; // Graceful shutdown
}
```

### Example

```typescript
import { startServer } from '@spfn/core';

const instance = await startServer({ port: 8790 });

// Access server internals
console.log('Port:', instance.config.port);
console.log('Routes:', instance.app.routes.length);

// Programmatic shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await instance.close();
});
```

## AppFactory

Full control mode: provide your own Hono app with complete customization.

```typescript
type AppFactory = () => Promise<Hono> | Hono;
```

### Example: src/server/app.ts

```typescript
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';

export default function createApp() {
  const app = new Hono();

  // Custom middleware
  app.use('*', logger());
  app.use('*', cors({ origin: '*' }));

  // Custom routes
  app.get('/custom', (c) => {
    return c.json({ message: 'Custom route' });
  });

  return app;
}
```

## Configuration Levels

### Level 1: Zero Config (CLI Auto)

The easiest way - no server code needed! Just use the CLI.

```bash
# Development mode
spfn dev
# ✅ Server running on http://localhost:8790

# Production build
spfn build

# Production start
spfn start
```

> **Note:** What CLI does automatically:
> - Creates temporary entry file (`node_modules/.spfn/server.mjs`)
> - Loads environment variables
> - Calls `startServer()` with sensible defaults
> - Hot reload with `tsx --watch` in dev mode
> - Runs codegen watcher for contract changes

You can also start programmatically:

```typescript
import { startServer } from '@spfn/core';

await startServer();
// ✅ Server running on http://localhost:8790
```

### Level 2: Partial Config

Create `src/server/server.config.ts` to customize specific options.

```typescript
// src/server/server.config.ts
import type { ServerConfig } from '@spfn/core';

export default {
  port: 8790,
  cors: { origin: '*' },
  database: {
    pool: { max: 20 },
  },
} satisfies ServerConfig;
```

### Level 3: Full Control

Create `src/server/app.ts` to provide your own Hono app.

```typescript
// src/server/app.ts
import { Hono } from 'hono';
import { loadRoutes } from '@spfn/core';

export default async function createApp() {
  const app = new Hono();

  // Full customization
  app.use('*', customMiddleware());

  // Load Superfunction routes
  await loadRoutes(app, { routesPath: 'src/server/routes' });

  return app;
}
```

## Best Practices

### 1. Use Environment Variables

```typescript
// src/server/server.config.ts
export default {
  port: Number(process.env.API_PORT) || 8790,
  host: process.env.HOST || '0.0.0.0',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
  },
} satisfies ServerConfig;
```

### 2. Production Settings

```typescript
const isProduction = process.env.NODE_ENV === 'production';

export default {
  debug: !isProduction,
  database: {
    pool: {
      max: isProduction ? 20 : 10,
      idleTimeout: isProduction ? 30 : 20,
    },
    monitoring: {
      enabled: !isProduction,
      logQueries: false, // Never log in production
    },
  },
  healthCheck: {
    detailed: !isProduction,
  },
} satisfies ServerConfig;
```

### 3. Handle Shutdown Gracefully

```typescript
const instance = await startServer();

// Handle shutdown signals
const signals = ['SIGTERM', 'SIGINT'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    await instance.close();
    process.exit(0);
  });
});
```

> **Note:** Configuration Priority
>
> Configuration is resolved in this order (highest to lowest):
> 1. Runtime config passed to `startServer()`
> 2. File config from `server.config.ts`
> 3. Environment variables
> 4. Default values

> **✅ Success:** Next: Context
>
> Learn about RouteContext and how to access request data in handlers.
>
> [Context →](/docs/api-reference/context)