# @spfn/core/server - Technical Documentation

HTTP server infrastructure with 3-level configuration system and automatic initialization.

## Architecture Overview

The server module provides a production-ready HTTP server with progressive configuration options, automatic infrastructure management, and comprehensive lifecycle control.

### Core Components

```
server/
├── index.ts                 # Module entry point and exports
├── server.ts                # Re-exports for internal use
├── start-server.ts          # Server lifecycle and initialization
├── create-server.ts         # Hono app creation and configuration
├── config-builder.ts        # Configuration builder with lifecycle merging
├── helpers.ts               # Utility functions (timeouts, health checks)
├── validation.ts            # Configuration validation logic
├── banner.ts                # Startup banner rendering
├── logger.ts                # Server logger instance
├── dotenv-loader.ts         # Environment variable loading
└── types.ts                 # TypeScript type definitions
```

### Design Principles

1. **Progressive Configuration**: Three levels from zero-config to full control
2. **Infrastructure Abstraction**: Automatic initialization of database and Redis
3. **Lifecycle Hooks**: Extensibility via config-based lifecycle hooks
4. **Graceful Degradation**: Health monitoring with fallback behaviors
5. **Type Safety**: Full TypeScript types with runtime validation

---

## Three-Level Configuration System

### Configuration Hierarchy

The server provides three progressively more control over application setup:

```
Level 1: Zero Config
    ↓ (add server.config.ts)
Level 2: Partial Customization
    ↓ (add app.ts)
Level 3: Full Control
```

### Level 1: Zero Config

**No configuration files required.** Server uses sensible defaults:

```typescript
// No files needed! Just:
import { startServer } from '@spfn/core/server';

await startServer();
```

**Automatic Setup:**
- Port: 4000 (or `process.env.PORT`)
- Host: localhost (or `process.env.HOST`)
- Middleware: Logger + CORS + ErrorHandler
- Routes: None (warns if no routes configured)
- Infrastructure: Auto-init DB/Redis from env vars

### Level 2: Partial Customization

**Create `src/server/server.config.ts` to customize specific aspects:**

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { defineRouter, route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

const appRouter = defineRouter({
    getUser: route.get('/users/:id')
        .input({
            params: Type.Object({ id: Type.String() })
        })
        .handler(async (c) => {
            const { params } = await c.data();
            return { id: params.id, name: 'John' };
        }),
});

export default defineServerConfig()
    .port(3000)
    .routes(appRouter)
    .middlewares([authMiddleware, rateLimitMiddleware])
    .build();
```

**What You Control:**
- Port, host, CORS settings
- Named middlewares (for route-level skip control)
- Routes via `defineRouter()`
- Lifecycle hooks (beforeRoutes, afterRoutes, etc.)
- Infrastructure toggles

**What's Still Automatic:**
- Hono app creation
- Middleware order
- Infrastructure initialization
- Graceful shutdown

### Level 3: Full Control

**Create `src/server/app.ts` to manage everything:**

```typescript
import { Hono } from 'hono';
import { timing } from 'hono/timing';
import { compress } from 'hono/compress';
import type { AppFactory } from '@spfn/core/server';

export default (async () => {
    const app = new Hono();

    // Your custom setup
    app.use('*', timing());
    app.use('*', compress());

    // Custom routes
    app.get('/custom', (c) => c.json({ custom: true }));

    return app;
}) satisfies AppFactory;
```

**Then in `server.config.ts`:**

```typescript
export default defineServerConfig()
    .routes(appRouter)  // Routes will be registered to your custom app
    .build();
```

**You Control Everything:**
- Hono app instance
- All middleware
- Custom setup logic
- Routes can still be registered via config

---

## Configuration Loading Mechanism

### Priority Order

Configuration is merged in this order (highest to lowest priority):

```
1. Runtime config (startServer({ port: 5000 }))
    ↓ overrides
2. File config (server.config.ts)
    ↓ overrides
3. Environment variables (PORT, HOST, SERVER_TIMEOUT, etc.)
    ↓ overrides
4. Framework defaults
```

### File Loading Priority

The server looks for config files in this order:

```typescript
const CONFIG_FILE_PATHS = [
    '.spfn/server/server.config.mjs',  // Built .mjs (highest priority)
    '.spfn/server/server.config',      // Built .js
    'src/server/server.config',        // Source .js
    'src/server/server.config.ts',     // Source .ts (lowest priority)
];
```

**Why this order?**
- Prefer built files (`.spfn/`) to ensure consistent behavior
- Fall back to source files for development
- First found file wins

### Configuration Validation

All configuration is validated at startup with descriptive errors:

```typescript
// validation.ts implementation
export function validateServerConfig(config: ServerConfig): void {
    // Port validation
    if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) {
        throw new Error(`Invalid port: ${config.port}. Port must be between 0 and 65535.`);
    }

    // Timeout validation
    if (config.timeout?.headers > config.timeout?.request) {
        throw new Error(
            `Invalid timeout: headers (${headers}ms) cannot exceed request (${request}ms).`
        );
    }

    // Health check path validation
    if (config.healthCheck?.path && !config.healthCheck.path.startsWith('/')) {
        throw new Error(`Invalid healthCheck.path: must start with "/".`);
    }
}
```

**Validation Errors:**

```
❌ Invalid port: 70000. Port must be an integer between 0 and 65535.
❌ Invalid timeout.request: -1000. Must be a positive number.
❌ Invalid timeout configuration: headers timeout (70000ms) cannot exceed request timeout (60000ms).
❌ Invalid healthCheck.path: "health". Must start with "/".
```

---

## Middleware Pipeline

### Execution Order

Middleware is applied in strict order:

```
HTTP Request
    ↓
[1] Error Handler Flag (context setup)
    ↓
[2] RequestLogger (if enabled)
    ↓
[3] CORS (if enabled)
    ↓
[4] Custom middleware (config.use)
    ↓
[5] Health Check Endpoint (if enabled)
    ↓
[6] beforeRoutes hook (config.lifecycle.beforeRoutes)
    ↓
[7] Routes (define-route based)
    ↓
[8] afterRoutes hook (config.lifecycle.afterRoutes)
    ↓
[9] ErrorHandler (if enabled)
```

### Implementation

```typescript
// create-server.ts
async function createAutoConfiguredApp(config?: ServerConfig): Promise<Hono> {
    const app = new Hono();

    // 1. Set error handler flag
    if (enableErrorHandler) {
        app.use('*', async (c, next) => {
            c.set('errorHandlerEnabled', true);
            await next();
        });
    }

    // 2-3. Default middleware
    applyDefaultMiddleware(app, config, enableLogger, enableCors);

    // 4. Custom middleware
    if (Array.isArray(config?.use)) {
        config.use.forEach(mw => app.use('*', mw));
    }

    // 5. Health check
    registerHealthCheckEndpoint(app, config);

    // 6. beforeRoutes hook from config
    await executeBeforeRoutesHook(app, config);

    // 7. Load routes
    await loadAppRoutes(app, config);

    // 8. afterRoutes hook from config
    await executeAfterRoutesHook(app, config);

    // 9. Error handler
    if (enableErrorHandler) {
        app.onError(ErrorHandler());
    }

    return app;
}
```

### Middleware Order Debugging

In debug mode, server logs the full middleware execution order:

```json
{
  "level": "debug",
  "module": "server",
  "msg": "Middleware execution order",
  "order": [
    "RequestLogger",
    "CORS",
    "Custom[0]",
    "Custom[1]",
    "beforeRoutes hook",
    "Routes",
    "afterRoutes hook",
    "ErrorHandler"
  ]
}
```

---

## Named Middleware System

### Design Rationale

Named middlewares enable **route-level skip control** with full type safety:

```typescript
import { defineMiddleware, defineRouter, route } from '@spfn/core/route';

// 1. Define middlewares with names
export const authMiddleware = defineMiddleware('auth', async (c, next) => {
    const token = c.req.header('authorization');
    if (!token) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('user', await verifyToken(token));
    await next();
});

// 2. Register via router's .use() - auto-applied to server config
const appRouter = defineRouter({
    getUser,
    createUser,
})
.use([authMiddleware, rateLimitMiddleware]);  // Global middlewares

export default defineServerConfig()
    .routes(appRouter)  // middlewares auto-applied from router
    .build();

// 3. Skip per route
export const publicRoute = route.get('/health')
    .skip(['auth', 'rateLimit'])  // ✅ Type-safe autocomplete!
    .handler(async (c) => ({ status: 'ok' }));
```

### Router Global Middlewares Auto-Application

When calling `.routes(appRouter)`, middlewares registered via `router.use()` are automatically merged into server config:

```typescript
// These two are equivalent:

// Option 1: Explicit middlewares
defineServerConfig()
    .routes(appRouter)
    .middlewares([authMiddleware, rateLimitMiddleware])
    .build();

// Option 2: Via router's .use() (recommended)
const appRouter = defineRouter({ ... })
    .use([authMiddleware, rateLimitMiddleware]);

defineServerConfig()
    .routes(appRouter)  // middlewares auto-merged
    .build();
```

**Benefits:**
- Keep middleware registration close to route definitions
- Single source of truth for global middlewares
- Works with package routers (`.packages([authRouter])`) too

### Type System

```typescript
// define-middleware.ts
export type NamedMiddleware<TName extends string = string> = {
    name: TName;
    handler: MiddlewareHandler;
    _name: TName;  // Type inference helper
};

export function defineMiddleware<TName extends string>(
    name: TName,
    handler: MiddlewareHandler
): NamedMiddleware<TName> {
    return {
        name,
        handler,
        _name: name as TName,
    };
}

// Extract middleware names for type safety
export type ExtractMiddlewareNames<T extends readonly NamedMiddleware<any>[]> =
    T[number]['_name'];
```

**Key Design Decisions:**
1. `_name` field enables TypeScript literal type inference
2. Type parameter `TName` captured at definition time
3. Name used for runtime filtering in route registration

### Skip Control Implementation

```typescript
// register-routes.ts (in route module)
function registerRoute(
    app: Hono,
    name: string,
    routeDef: RouteDef<any>,
    namedMiddlewares?: ReadonlyArray<NamedMiddleware<any>>
): void {
    const { skipMiddlewares } = routeDef;
    const skipAll = skipMiddlewares === '*';

    const allMiddlewares: MiddlewareHandler[] = [];

    // Add server-level middlewares (filtered by skip)
    if (namedMiddlewares && !skipAll) {
        const skipSet = new Set(Array.isArray(skipMiddlewares) ? skipMiddlewares : []);
        for (const middleware of namedMiddlewares) {
            if (!skipSet.has(middleware.name)) {
                allMiddlewares.push(middleware.handler);
            }
        }
    }

    // Add route-level middlewares (never skipped)
    allMiddlewares.push(...(routeDef.middlewares ?? []));

    // Register to Hono
    app[method](path, ...allMiddlewares, wrappedHandler);
}
```

**Skip Semantics:**
- `skip(['auth'])` - Skip specific named middlewares
- `skip('*')` - Skip **all** server-level middlewares
- Route-level middlewares (`.use()`) are **never** skipped
- Validation middleware is **never** skipped

---

## Route Registration System

### define-route Based Routing

The server uses **define-route based routing** for full type safety:

```typescript
import { defineRouter, route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

const appRouter = defineRouter({
    getUser: route.get('/users/:id')
        .input({
            params: Type.Object({ id: Type.String() }),
            query: Type.Object({ page: Type.Number({ default: 1 }) })
        })
        .handler(async (c) => {
            const { params, query } = await c.data();
            return { id: params.id, page: query.page };
        }),

    createUser: route.post('/users')
        .input({
            body: Type.Object({
                name: Type.String(),
                email: Type.String({ format: 'email' })
            })
        })
        .handler(async (c) => {
            const { body } = await c.data();
            return c.created(body);
        }),
});

export default defineServerConfig()
    .routes(appRouter)
    .build();
```

### Registration Flow

```typescript
// create-server.ts
async function loadAppRoutes(app: Hono, config?: ServerConfig): Promise<void> {
    const debug = isDebugMode(config);

    // Register define-route based routes (if provided)
    if (config?.routes) {
        registerRoutes(app, config.routes, config.middlewares);
        if (debug) {
            serverLogger.info('✓ Routes registered');
        }
    }
    else if (debug) {
        serverLogger.warn('⚠️  No routes configured. Use defineServerConfig().routes() to register routes.');
    }
}
```

---

## Infrastructure Management

### Automatic Initialization

The server automatically initializes database and Redis when credentials are present:

```typescript
// start-server.ts implementation
async function initializeInfrastructure(config: ServerConfig): Promise<void> {
    // 1. Execute beforeInfrastructure hook
    if (config.lifecycle?.beforeInfrastructure) {
        await config.lifecycle.beforeInfrastructure(config);
    }

    const infraConfig = getInfrastructureConfig(config);

    // 2. Initialize database (if enabled)
    if (infraConfig.database) {
        await initDatabase(config.database);
    }

    // 3. Initialize Redis (if enabled)
    if (infraConfig.redis) {
        await initCache();
    }

    // 4. Execute afterInfrastructure hook from config
    if (config.lifecycle?.afterInfrastructure) {
        await config.lifecycle.afterInfrastructure();
    }
}
```

### Infrastructure Control

**Default Behavior:** Both database and Redis are initialized if env vars exist.

**Disable Selectively:**

```typescript
export default defineServerConfig()
    .infrastructure({
        database: false,  // Disable auto database init
        redis: true,      // Keep Redis auto init
    })
    .build();
```

**Environment Variables:**

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db

# Redis (single instance)
REDIS_URL=redis://localhost:6379

# Redis (separate read/write)
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379
```

### Health Monitoring

The server provides a health check endpoint for monitoring:

```typescript
// helpers.ts:6-79
export function createHealthCheckHandler(detailed: boolean): Handler {
    return async (c) => {
        const response: any = {
            status: 'ok',
            timestamp: new Date().toISOString(),
        };

        if (detailed) {
            // Check database connection
            try {
                const db = getDatabase();
                await db.execute('SELECT 1');
                response.services.database = { status: 'connected' };
            } catch (error) {
                response.services.database = {
                    status: 'error',
                    error: error.message
                };
                response.status = 'degraded';
            }

            // Check Redis connection
            try {
                const redis = getCache();
                await redis.ping();
                response.services.redis = { status: 'connected' };
            } catch (error) {
                response.services.redis = {
                    status: 'error',
                    error: error.message
                };
                response.status = 'degraded';
            }
        }

        const statusCode = response.status === 'ok' ? 200 : 503;
        return c.json(response, statusCode);
    };
}
```

**Service Status Values:**
- `connected` - Service is healthy and responding
- `error` - Service connection failed
- `not_initialized` - Service instance not yet created
- `unknown` - Status could not be determined

**Response Examples:**

```bash
# Basic (production default)
$ curl http://localhost:4000/health
{
  "status": "ok",
  "timestamp": "2025-01-21T10:00:00.000Z"
}

# Detailed (development default)
$ curl http://localhost:4000/health
{
  "status": "ok",
  "timestamp": "2025-01-21T10:00:00.000Z",
  "services": {
    "database": { "status": "connected" },
    "redis": { "status": "connected" }
  }
}

# Degraded (503 Service Unavailable)
{
  "status": "degraded",
  "timestamp": "2025-01-21T10:00:00.000Z",
  "services": {
    "database": {
      "status": "error",
      "error": "Connection refused"
    },
    "redis": { "status": "connected" }
  }
}

# Not initialized (503 Service Unavailable)
{
  "status": "degraded",
  "timestamp": "2025-01-21T10:00:00.000Z",
  "services": {
    "database": { "status": "not_initialized" },
    "redis": { "status": "not_initialized" }
  }
}
```

**Configuration:**

```typescript
export default defineServerConfig()
    .healthCheck({
        enabled: true,
        path: '/api/health',  // Custom path
        detailed: true,       // Include service status
    })
    .build();
```

---

## Server Lifecycle

### Startup Sequence

```
[1] Load configuration files
    ↓
[2] Merge configuration (runtime > file > env > defaults)
    ↓
[3] Validate configuration
    ↓
[4] Execute lifecycle.beforeInfrastructure()
    ↓
[5] Initialize database (if enabled)
    ↓
[6] Initialize Redis (if enabled)
    ↓
[7] Execute lifecycle.afterInfrastructure()
    ↓
[8] Create Hono app (via createServer)
     ├─ Apply middleware pipeline
     ├─ Execute lifecycle.beforeRoutes()
     ├─ Register routes
     └─ Execute lifecycle.afterRoutes()
    ↓
[9] Start HTTP server
    ↓
[10] Apply server timeouts
    ↓
[11] Print startup banner
    ↓
[12] Register shutdown handlers (SIGTERM, SIGINT, uncaughtException, unhandledRejection)
    ↓
[13] Execute lifecycle.afterStart()
    ↓
[14] Server ready ✓
```

### Lifecycle Hooks

```typescript
export default defineServerConfig()
    .lifecycle({
        // Before infrastructure init
        beforeInfrastructure: async (config) => {
            await initMonitoring();
        },

        // After DB/Redis initialized
        afterInfrastructure: async () => {
            const db = getDatabase();
            await migrate(db, { migrationsFolder: './drizzle' });
        },

        // Before routes loaded
        beforeRoutes: async (app) => {
            app.use('/*', customMiddleware());
        },

        // After routes loaded
        afterRoutes: async (app) => {
            app.notFound((c) => c.json({ error: 'Not Found' }, 404));
        },

        // After server started
        afterStart: async (instance) => {
            console.log(`Server ready at http://${instance.config.host}:${instance.config.port}`);
        },

        // Before shutdown
        beforeShutdown: async () => {
            await closeMessageQueue();
        },
    })
    .build();
```

### Graceful Shutdown

The server handles termination signals gracefully:

```typescript
// start-server.ts implementation
function createShutdownHandler(
    server: Server,
    config: ServerConfig,
    shutdownState: ShutdownState
): () => Promise<void> {
    return async () => {
        // Prevent re-entry
        if (shutdownState.isShuttingDown) return;
        shutdownState.isShuttingDown = true;

        // 1. Close HTTP server (with timeout)
        await Promise.race([
            new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            }),
            timeout(SERVER_CLOSE_TIMEOUT)
        ]);

        // 2. Execute beforeShutdown hook
        if (config.lifecycle?.beforeShutdown) {
            await config.lifecycle.beforeShutdown();
        }

        // 3. Close infrastructure (only what was initialized)
        const infraConfig = getInfrastructureConfig(config);

        if (infraConfig.database) {
            await closeInfrastructure(closeDatabase, 'Database', DATABASE_CLOSE_TIMEOUT);
        }

        if (infraConfig.redis) {
            await closeInfrastructure(closeCache, 'Redis', REDIS_CLOSE_TIMEOUT);
        }
    };
}
```

**Shutdown Sequence:**

```
Signal Received (SIGTERM/SIGINT)
    ↓
[1] Stop accepting new connections
    ↓
[2] Close HTTP server (5s timeout)
    ↓
[3] Execute lifecycle.beforeShutdown()
    ↓
[4] Close database connections (5s timeout)
    ↓
[5] Close Redis connections (5s timeout)
    ↓
[6] Exit process
```

**Supported Signals:**
- `SIGTERM` - Graceful shutdown (Docker, Kubernetes)
- `SIGINT` - Graceful shutdown (Ctrl+C)
- `uncaughtException` - Log error → graceful shutdown (production) or immediate exit (development)
- `unhandledRejection` - Log error → graceful shutdown (production) or immediate exit (development)

**Timeout Configuration:**

```typescript
export default defineServerConfig()
    .shutdown({
        timeout: 30000,  // 30 seconds max for shutdown
    })
    .build();
```

**Environment Variables:**

```bash
SHUTDOWN_TIMEOUT=30000  # Milliseconds
```

---

## Timeout Management

### Purpose

HTTP server timeouts protect against:
- **Resource exhaustion** - Slow clients holding connections
- **Slowloris attacks** - Partial request attacks
- **Connection reuse issues** - Load balancer timeout mismatches

### Timeout Types

```typescript
export default defineServerConfig()
    .timeout({
        request: 120000,   // 2 minutes - Total request duration
        keepAlive: 65000,  // 65 seconds - Idle connection reuse
        headers: 60000,    // 60 seconds - Header reception time
    })
    .build();
```

### Implementation

```typescript
// helpers.ts:81-96
export function applyServerTimeouts(
    server: Server,
    timeouts: { request: number; keepAlive: number; headers: number }
): void {
    if ('timeout' in server) {
        server.timeout = timeouts.request;
        server.keepAliveTimeout = timeouts.keepAlive;
        server.headersTimeout = timeouts.headers;
    }
}

// helpers.ts:98-113
export function getTimeoutConfig(config?: {
    request?: number;
    keepAlive?: number;
    headers?: number;
}): { request: number; keepAlive: number; headers: number } {
    return {
        request: config?.request ?? (parseInt(process.env.SERVER_TIMEOUT || '', 10) || 120000),
        keepAlive: config?.keepAlive ?? (parseInt(process.env.SERVER_KEEPALIVE_TIMEOUT || '', 10) || 65000),
        headers: config?.headers ?? (parseInt(process.env.SERVER_HEADERS_TIMEOUT || '', 10) || 60000),
    };
}
```

### Timeout Explanations

**`request` timeout (default: 120000ms = 2 minutes)**
- Maximum time for entire request/response cycle
- Prevents slow clients from holding connections indefinitely
- Should accommodate longest expected operation

**`keepAlive` timeout (default: 65000ms = 65 seconds)**
- How long to keep idle connections open for reuse
- **Must be longer than load balancer timeout** (typically 60s)
- Prevents premature connection closure by LB

**`headers` timeout (default: 60000ms = 60 seconds)**
- Maximum time to receive complete HTTP headers
- **Protects against Slowloris attacks**
- Must be ≤ request timeout

### Slowloris Protection

Slowloris attacks send partial HTTP requests slowly to exhaust server connections:

```
Attacker                    Server
   |                          |
   |-- GET / HTTP/1.1 ------->|
   |                          | (waiting for headers...)
   |-- X-a: a -----(10s)----->|
   |                          | (still waiting...)
   |-- X-b: b -----(10s)----->|
   |                          | (still waiting...)
   ...                        ... (connection held open)
```

**Defense:**

```typescript
server.headersTimeout = 60000;  // Force close if headers not received in 60s
```

**Best Practices:**
- Use shorter timeouts (15-30s) for public APIs
- Use longer timeouts for file upload endpoints
- Configure `keepAlive` > load balancer timeout
- Monitor timeout-related disconnections

### Environment Variables

```bash
# All values in milliseconds
SERVER_TIMEOUT=120000              # Request timeout
SERVER_KEEPALIVE_TIMEOUT=65000     # Keep-alive timeout
SERVER_HEADERS_TIMEOUT=60000       # Headers timeout
```

---

## Configuration Builder Pattern

### Design

The configuration builder provides a fluent API for type-safe configuration:

```typescript
// config-builder.ts
export class ServerConfigBuilder {
    private config: ServerConfig = {};
    private lifecycles: Array<ServerConfig['lifecycle']> = [];

    port(port: number): this {
        this.config.port = port;
        return this;
    }

    host(host: string): this {
        this.config.host = host;
        return this;
    }

    routes(router: Router<any>): this {
        this.config.routes = router;
        return this;
    }

    middlewares(middlewares: ServerConfig['middlewares']): this {
        this.config.middlewares = middlewares;
        return this;
    }

    // Multiple lifecycle() calls are merged, not overwritten
    lifecycle(lifecycle: ServerConfig['lifecycle']): this {
        if (lifecycle) {
            this.lifecycles.push(lifecycle);
        }
        return this;
    }

    build(): ServerConfig {
        // Merge all lifecycle hooks in registration order
        if (this.lifecycles.length > 0) {
            this.config.lifecycle = this.mergeLifecycles();
        }
        return this.config;
    }
}

export function defineServerConfig(): ServerConfigBuilder {
    return new ServerConfigBuilder();
}
```

**Key Design Decisions:**
1. **Immutability**: Returns `this` for chaining, but mutates internal state (acceptable for builder)
2. **Type Safety**: TypeScript infers types from method parameters
3. **Terminal Method**: `.build()` returns final config
4. **No Validation**: Validation happens at `startServer()` time
5. **Lifecycle Merging**: Multiple `lifecycle()` calls are merged, hooks execute in registration order

### Lifecycle Merging

Multiple `lifecycle()` calls are supported - hooks are executed sequentially in registration order:

```typescript
// Example: Composing lifecycles from different modules
export default defineServerConfig()
    .lifecycle({
        afterInfrastructure: async () => {
            await runMigrations();
        },
    })
    .lifecycle({
        afterInfrastructure: async () => {
            await seedDatabase();  // Runs AFTER migrations
        },
    })
    .build();
```

This enables modular composition of server setup logic.

### Usage Example

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { defineRouter, route } from '@spfn/core/route';

export default defineServerConfig()
    .port(3000)
    .host('0.0.0.0')
    .routes(appRouter)
    .middlewares([authMiddleware, rateLimitMiddleware])
    .timeout({ request: 60000 })
    .healthCheck({ detailed: true })
    .lifecycle({
        afterInfrastructure: async () => {
            await runMigrations();
        },
    })
    .build();
```

---

## Performance Considerations

### Startup Time

**Optimization Strategies:**

1. **Config File Priority**: Built files (`.spfn/`) loaded before source files
2. **Parallel Infrastructure Init**: Database and Redis can init concurrently
3. **Direct Route Registration**: No filesystem scanning required

**Typical Startup Time:**
- Base startup: ~50-100ms
- Route registration: ~1-5ms for 50 routes

### Memory Usage

**Per-Server Instance:**
- Base server: ~10-15MB
- Hono app: ~5-10MB
- Each route: ~1-2KB
- Each middleware: ~500B-1KB

**Connection Pools:**
- Database: Configured via `config.database.pool.max`
- Redis: 1 connection per instance (write/read)

### Connection Pooling

```typescript
export default defineServerConfig()
    .database({
        pool: {
            max: 20,              // Production: 20, Development: 10
            idleTimeout: 30,      // Seconds
        },
        healthCheck: {
            enabled: true,
            interval: 60000,      // Check every 60 seconds
            reconnect: true,
            maxRetries: 3,
        },
    })
    .build();
```

**Pool Sizing:**
- **Formula**: `connections = (core_count * 2) + effective_spindle_count`
- **Typical**: 10-20 for most applications
- **High traffic**: 50-100 with proper monitoring

---

## Testing Strategy

### Unit Tests

Test individual components in isolation:

```typescript
// validation.test.ts
describe('validateServerConfig', () => {
    it('should throw on invalid port', () => {
        expect(() => validateServerConfig({ port: -1 }))
            .toThrow('Invalid port: -1');
    });

    it('should throw when headers > request timeout', () => {
        expect(() => validateServerConfig({
            timeout: { request: 60000, headers: 70000 }
        })).toThrow('headers timeout (70000ms) cannot exceed request timeout');
    });
});

// helpers.test.ts
describe('getTimeoutConfig', () => {
    it('should return defaults when no config provided', () => {
        const timeouts = getTimeoutConfig();
        expect(timeouts).toEqual({
            request: 120000,
            keepAlive: 65000,
            headers: 60000,
        });
    });

    it('should prioritize config over env vars', () => {
        process.env.SERVER_TIMEOUT = '30000';
        const timeouts = getTimeoutConfig({ request: 60000 });
        expect(timeouts.request).toBe(60000);
    });
});
```

### Integration Tests

Test full server lifecycle:

```typescript
// server.integration.test.ts
describe('startServer', () => {
    it('should start server with default config', async () => {
        const instance = await startServer();

        expect(instance.server).toBeDefined();
        expect(instance.app).toBeDefined();
        expect(instance.config.port).toBe(4000);

        await instance.close();
    });

    it('should execute lifecycle hooks in order', async () => {
        const calls: string[] = [];

        const instance = await startServer({
            lifecycle: {
                beforeInfrastructure: async () => { calls.push('before'); },
                afterInfrastructure: async () => { calls.push('after'); },
                beforeRoutes: async () => { calls.push('beforeRoutes'); },
                afterRoutes: async () => { calls.push('afterRoutes'); },
            },
        });

        expect(calls).toEqual(['before', 'after', 'beforeRoutes', 'afterRoutes']);

        await instance.close();
    });

    it('should return 503 when database is down', async () => {
        // Mock database failure
        const instance = await startServer({
            healthCheck: { detailed: true },
        });

        const res = await instance.app.request('/health');
        const data = await res.json();

        expect(res.status).toBe(503);
        expect(data.status).toBe('degraded');

        await instance.close();
    });
});
```

### Test Coverage

**Current Coverage:**
- `helpers.ts`: 100%
- `validation.ts`: 100%
- `banner.ts`: 100%
- `start-server.ts`: ~85% (some error paths hard to test)
- `create-server.ts`: ~80%

**Run Tests:**

```bash
# All server tests
pnpm test src/server/__tests__/

# Specific test file
pnpm test src/server/__tests__/server.integration.test.ts
```

---

## Extension Points

### Custom Lifecycle Hooks

Add custom initialization logic via lifecycle hooks:

```typescript
export default defineServerConfig()
    .lifecycle({
        beforeInfrastructure: async (config) => {
            // Initialize monitoring before anything else
            await initSentry({ dsn: process.env.SENTRY_DSN });
        },

        afterInfrastructure: async () => {
            // Run migrations after DB is ready
            const db = getDatabase();
            await migrate(db, { migrationsFolder: './drizzle' });

            // Seed initial data
            await seedAdminUser(db);
        },

        beforeRoutes: async (app) => {
            // Add request tracing
            app.use('*', tracingMiddleware());
        },

        afterRoutes: async (app) => {
            // Add catch-all 404
            app.notFound((c) => c.json({ error: 'Not Found' }, 404));
        },

        afterStart: async (instance) => {
            // Notify external service
            await notifyHealthCheck({
                url: `http://${instance.config.host}:${instance.config.port}`,
            });
        },

        beforeShutdown: async () => {
            // Cleanup custom resources
            await closeMessageQueue();
            await closeSearchIndex();
        },
    })
    .build();
```

### Custom Health Checks

Extend health check with custom service checks:

```typescript
export default defineServerConfig()
    .lifecycle({
        afterRoutes: async (app) => {
            // Replace default health check with custom one
            app.get('/health', async (c) => {
                const checks = {
                    database: await checkDatabase(),
                    redis: await checkRedis(),
                    elasticsearch: await checkElasticsearch(),
                    messageQueue: await checkMessageQueue(),
                };

                const allHealthy = Object.values(checks).every(c => c.status === 'ok');
                const status = allHealthy ? 'ok' : 'degraded';
                const statusCode = allHealthy ? 200 : 503;

                return c.json({
                    status,
                    timestamp: new Date().toISOString(),
                    services: checks,
                }, statusCode);
            });
        },
    })
    .build();
```

---

## Future Enhancements

### Planned Features

1. **HTTP/2 Support**: Add HTTP/2 server option
2. **WebSocket Support**: Built-in WebSocket server
3. **Metrics Endpoint**: Prometheus-compatible metrics
4. **Distributed Tracing**: OpenTelemetry integration
5. **Rate Limiting**: Built-in rate limiting with Redis backend
6. **Request Validation Middleware**: Schema-based request validation

### Breaking Changes Planned

1. **Require Explicit Infrastructure Init** (v3.0.0)
   - Make `infrastructure.database` and `infrastructure.redis` required
   - Remove automatic env var detection
   - Force explicit opt-in/out

2. **Change Default Port** (v3.0.0)
   - Change default from 4000 to 8790 (align with CLI)

---

## Related Systems

### Comparison with Other Modules

| Feature | @spfn/core/server | Hono | Express |
|---------|-------------------|------|---------|
| Configuration | 3-level progressive | Manual | Manual |
| Infrastructure | Auto-init DB/Redis | Manual | Manual |
| Type Safety | Full TypeScript | Partial | None |
| Graceful Shutdown | Built-in | Manual | Manual |
| Health Checks | Built-in | Manual | Manual |

### Integration with Other Modules

**@spfn/core/route**
- Server registers routes via `registerRoutes()`
- Named middlewares passed to route registration
- Route-level skip control

**@spfn/core/middleware**
- RequestLogger, CORS, ErrorHandler
- Applied in middleware pipeline

**@spfn/core/db**
- Auto-initialized during infrastructure phase
- Health check integration
- Graceful shutdown integration

**@spfn/core/cache**
- Auto-initialized during infrastructure phase
- Health check integration
- Graceful shutdown integration

**@spfn/core/logger**
- Used throughout server lifecycle
- Child loggers for different components
- Structured logging with context

---

## References

- [Hono](https://hono.dev) - Web framework
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema validation (used by route module)
- [Node.js HTTP Server](https://nodejs.org/api/http.html) - Underlying server API
- [Slowloris Attack](https://en.wikipedia.org/wiki/Slowloris_(computer_security)) - Timeout protection rationale