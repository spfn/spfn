# Server Module

High-level server utilities for SPFN framework with three levels of control.

## Import

```ts
import { startServer, createServer } from '@spfn/core/server';
import type { ServerConfig, AppFactory } from '@spfn/core/server';
```

## Three Levels of Control

### Level 1: Zero Config (Full Auto)

Just start the server - everything is configured automatically.

```ts
import { startServer } from '@spfn/core/server';

// Starts on localhost:4000 with all defaults
await startServer();
```

**Automatic Setup:**
- ✅ Request logging middleware
- ✅ CORS middleware
- ✅ Error handler
- ✅ Route loading from `src/server/routes`
- ✅ Redis initialization from env vars

### Level 2: Partial Config (`server.config.ts`)

Customize specific aspects while keeping auto-configuration.

```ts
// src/server/server.config.ts
import type { ServerConfig } from '@spfn/core/server';

export default {
  port: 4000,
  host: 'localhost',

  // CORS config
  cors: {
    origin: '*',
    credentials: true,
  },

  // Toggle built-in middleware
  middleware: {
    logger: true,
    cors: true,
    errorHandler: true,
  },

  // Add custom middleware
  use: [
    // Your middleware here
  ],

  // Lifecycle hooks
  beforeRoutes: async (app) => {
    // Run before routes load
  },

  afterRoutes: async (app) => {
    // Run after routes load
  },
} satisfies ServerConfig;
```

Then start with:
```ts
import { startServer } from '@spfn/core/server';

// Automatically loads server.config.ts
await startServer();

// Or override at runtime
await startServer({ port: 5000 });
```

### Level 3: Full Control (`app.ts`)

Complete control over app creation - you manage everything.

```ts
// src/server/app.ts
import { Hono } from 'hono';
import type { AppFactory } from '@spfn/core/server';

export default (async () => {
  const app = new Hono();

  // Your custom setup
  app.use('*', yourMiddleware());

  // Routes are still auto-loaded
  return app;
}) satisfies AppFactory;
```

Start with:
```ts
import { startServer } from '@spfn/core/server';

// Uses your app.ts, only auto-loads routes
await startServer();
```

## API Reference

### `startServer(config?: ServerConfig): Promise<void>`

Start SPFN server with automatic configuration.

**Features:**
- Loads `server.config.ts` if exists
- Initializes Redis from environment variables
- Creates and starts Hono server
- Auto-loads routes from `src/server/routes`

**Config Priority:**
1. Runtime `config` parameter (highest)
2. `server.config.ts` file
3. Framework defaults (lowest)

### `createServer(config?: ServerConfig): Promise<Hono>`

Create a Hono app without starting the server.

Useful for:
- Testing
- Custom server setup
- Programmatic app creation

```ts
import { createServer } from '@spfn/core/server';
import { serve } from '@hono/node-server';

const app = await createServer({ debug: true });

// Custom server start
serve({ fetch: app.fetch, port: 3000 });
```

## Configuration Options

### `ServerConfig`

```ts
interface ServerConfig {
  // Server settings
  port?: number;              // default: 4000
  host?: string;              // default: 'localhost'

  // HTTP Server Timeouts
  timeout?: {
    request?: number;         // default: 120000ms (2min), env: SERVER_TIMEOUT
    keepAlive?: number;       // default: 65000ms (65s), env: SERVER_KEEPALIVE_TIMEOUT
    headers?: number;         // default: 60000ms (60s), env: SERVER_HEADERS_TIMEOUT
  };

  // CORS
  cors?: CorsConfig | false;  // Hono CORS config or disable

  // Middleware toggles
  middleware?: {
    logger?: boolean;         // default: true
    cors?: boolean;           // default: true
    errorHandler?: boolean;   // default: true
  };

  // Custom middleware
  use?: MiddlewareHandler[];

  // Routes
  routesPath?: string;        // default: src/server/routes
  debug?: boolean;            // default: NODE_ENV === 'development'

  // Lifecycle hooks
  beforeRoutes?: (app: Hono) => void | Promise<void>;
  afterRoutes?: (app: Hono) => void | Promise<void>;
}
```

### `AppFactory`

```ts
type AppFactory = () => Promise<Hono> | Hono;
```

## Examples

### Runtime Configuration

```ts
import { startServer } from '@spfn/core/server';

await startServer({
  port: 4000,
  host: '0.0.0.0',
  cors: {
    origin: 'https://example.com',
    credentials: true,
  },
  middleware: {
    logger: true,
    errorHandler: true,
  },
});
```

### File Configuration

```ts
// server.config.ts
export default {
  port: 4000,

  beforeRoutes: async (app) => {
    // Initialize services
    await initDatabase();
    await initCache();
  },

  afterRoutes: async (app) => {
    // Add catch-all
    app.get('*', notFoundHandler());
  },
};
```

### Custom App Factory

```ts
// app.ts
import { Hono } from 'hono';
import { timing } from 'hono/timing';
import { compress } from 'hono/compress';

export default async () => {
  const app = new Hono();

  // Performance middleware
  app.use('*', timing());
  app.use('*', compress());

  // Custom routes
  app.get('/health', (c) => c.json({ status: 'ok' }));

  return app;
};
```

### Programmatic Server Creation

```ts
import { createServer } from '@spfn/core/server';

const app = await createServer({
  debug: true,
  routesPath: 'custom/routes',
});

// Add additional routes
app.get('/custom', (c) => c.json({ custom: true }));

// Test the app
const res = await app.request('/custom');
console.log(await res.json()); // { custom: true }
```

## Middleware Order

When using Level 1 or 2, middleware is applied in this order:

1. **Request Logger** (if enabled)
2. **CORS** (if enabled)
3. **Custom middleware** (from `use` array)
4. **beforeRoutes hook**
5. **Auto-loaded routes**
6. **afterRoutes hook**
7. **Error handler** (if enabled)

## Graceful Shutdown

The server automatically handles graceful shutdown when receiving termination signals:

**Supported Signals:**
- `SIGTERM` - Standard termination signal (Docker, Kubernetes)
- `SIGINT` - Interrupt signal (Ctrl+C)
- `uncaughtException` - Uncaught exceptions
- `unhandledRejection` - Unhandled promise rejections

**Shutdown Sequence:**
1. Stop accepting new HTTP connections
2. Close database connections (with 5s timeout)
3. Close Redis connections
4. Exit process

```typescript
// Automatic in startServer()
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
    serverLogger.error('Uncaught exception', error);
    shutdown('UNCAUGHT_EXCEPTION');
});
process.on('unhandledRejection', (reason, promise) => {
    serverLogger.error('Unhandled promise rejection', { reason, promise });
    shutdown('UNHANDLED_REJECTION');
});
```

**Logs During Shutdown:**
```
[server] SIGTERM received, starting graceful shutdown...
[server] Closing HTTP server...
[database] Closing write connection...
[database] Write connection closed
[database] All database connections closed
[server] HTTP server closed
[cache] Redis connections closed
[server] Graceful shutdown completed
```

## HTTP Server Timeouts

The server provides configurable timeout settings to protect against resource exhaustion and slow client attacks (e.g., Slowloris).

### Default Values

```ts
{
  timeout: {
    request: 120000,    // 2 minutes - Maximum time for entire request
    keepAlive: 65000,   // 65 seconds - Keep-alive timeout (longer than typical LB timeout)
    headers: 60000,     // 60 seconds - Maximum time to receive complete headers
  }
}
```

### Configuration Priority

1. **ServerConfig** (highest priority)
2. **Environment variables**
3. **Default values** (lowest priority)

### Usage Examples

#### Via Configuration File

```ts
// server.config.ts
import type { ServerConfig } from '@spfn/core/server';

export default {
  timeout: {
    request: 30000,     // 30 seconds
    keepAlive: 45000,   // 45 seconds
    headers: 20000,     // 20 seconds
  },
} satisfies ServerConfig;
```

#### Via Runtime Config

```ts
import { startServer } from '@spfn/core/server';

await startServer({
  timeout: {
    request: 60000,     // 1 minute
    keepAlive: 70000,   // 70 seconds
    headers: 30000,     // 30 seconds
  },
});
```

#### Via Environment Variables

```bash
SERVER_TIMEOUT=30000              # Request timeout in milliseconds
SERVER_KEEPALIVE_TIMEOUT=45000    # Keep-alive timeout in milliseconds
SERVER_HEADERS_TIMEOUT=20000      # Headers timeout in milliseconds
```

```ts
import { startServer } from '@spfn/core/server';

// Uses environment variables
await startServer();
```

#### Partial Configuration

You can configure only specific timeouts:

```ts
await startServer({
  timeout: {
    request: 60000,  // Override only request timeout
    // keepAlive and headers use defaults or env vars
  },
});
```

### Timeout Explanations

**`request` timeout (default: 120000ms = 2 minutes)**
- Maximum time allowed for the entire HTTP request to complete
- Protects against slow clients that keep connections open indefinitely
- Prevents resource exhaustion from incomplete requests

**`keepAlive` timeout (default: 65000ms = 65 seconds)**
- Time the server waits for additional requests on the same connection
- Set to 65 seconds (longer than typical load balancer timeout of 60s)
- Prevents connection reuse issues with load balancers

**`headers` timeout (default: 60000ms = 60 seconds)**
- Maximum time allowed to receive complete HTTP headers
- Protects against Slowloris-style attacks
- Must be less than or equal to `request` timeout

### Security Considerations

**Protection Against Slowloris Attacks:**

Slowloris attacks work by sending partial HTTP requests slowly to exhaust server resources. The timeout configuration defends against this by:

1. **Headers Timeout**: Closes connections if headers aren't received within 60s
2. **Request Timeout**: Terminates requests that exceed 2 minutes total
3. **Keep-Alive Timeout**: Releases idle connections after 65s

**Best Practices:**

- Use shorter timeouts for public-facing APIs
- Use longer timeouts for file upload endpoints
- Configure `keepAlive` slightly longer than your load balancer timeout
- Monitor timeout-related disconnections in production

### Logs

When server starts, you'll see timeout configuration in logs:

```
[server] Server timeouts configured {
  request: '120000ms',
  keepAlive: '65000ms',
  headers: '60000ms'
}
```

## Environment Variables

The server automatically initializes infrastructure from environment variables:

```bash
# Server Configuration
SERVER_TIMEOUT=120000              # Request timeout (default: 120000)
SERVER_KEEPALIVE_TIMEOUT=65000     # Keep-alive timeout (default: 65000)
SERVER_HEADERS_TIMEOUT=60000       # Headers timeout (default: 60000)

# Redis (optional)
REDIS_URL=redis://localhost:6379
# Or separate instances
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379

# Database (if using DB module)
DATABASE_URL=postgresql://user:pass@localhost:5432/db
```

## Migration Guide

### From Manual Setup

Before:
```ts
const app = new Hono();
app.use('*', logger());
app.use('*', cors());
await loadRoutes(app);
serve({ fetch: app.fetch, port: 4000 });
```

After:
```ts
import { startServer } from '@spfn/core/server';
await startServer();
```

### From Custom Setup

If you have custom middleware:

```ts
// server.config.ts
import { myMiddleware } from './middleware';

export default {
  use: [myMiddleware()],
  beforeRoutes: async (app) => {
    // Custom setup
  },
};
```

Or use `app.ts` for full control:

```ts
// app.ts
import { Hono } from 'hono';

export default async () => {
  const app = new Hono();
  app.use('*', myMiddleware());
  return app;
};
```

## See Also

- [Route Module](../route/README.md) - File-based routing
- [Middleware Module](../middleware/README.md) - Built-in middleware
- [DB Module](../db/README.md) - Database integration