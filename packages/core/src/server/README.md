# @spfn/core/server — HTTP server entry point (config builder + lifecycle)

The unified entry point for an SPFN backend process: build a config with
`defineServerConfig()`, then boot with `startServer()`. Handles middleware auto-wiring,
infrastructure init (DB/Redis), routes/jobs/events/websockets/workflows integration, and
AWS-drain-style graceful shutdown.

## Import paths

There is **one** entry point:

```typescript
import {
    startServer,
    createServer,
    defineServerConfig,
    getShutdownManager,
    loadEnv,
} from '@spfn/core/server';

import type {
    ServerConfig,
    ServerInstance,
    AppFactory,
    ShutdownHookOptions,
} from '@spfn/core/server';
```

Routes/middleware come from a **different** module — don't look for them here:

```typescript
import { defineRouter, route, defineMiddleware } from '@spfn/core/route';
```

---

## Public API (complete)

Everything exported from `@spfn/core/server`:

- **Boot**: `startServer(config?)` → `Promise<ServerInstance>` — loads env + config file,
  inits infrastructure, starts the HTTP server, registers shutdown handlers.
- **App only**: `createServer(config?)` → `Promise<Hono>` — builds the configured Hono app
  without listening (for tests / custom `serve()`).
- **Config builder**: `defineServerConfig()` → `ServerConfigBuilder` (fluent, `.build()`
  returns `ServerConfig`).
- **Shutdown**: `getShutdownManager()` → `ShutdownManager` singleton.
- **Env**: `loadEnv` (re-export of `@spfn/core/env/loader`). `startServer()` already calls
  it internally.
- **Deprecated**: `loadEnvFiles()` — alias for `loadEnv()`; use `loadEnv` instead.
- **Types**: `ServerConfig`, `ServerInstance`, `AppFactory`, `ShutdownHookOptions`.

> **Not exported from `@spfn/core/server`:** `validateServerConfig`, `printBanner`,
> `ShutdownManager` (the class), `WorkflowRouterLike`. They exist internally but are not in
> the public barrel — do not import them from `@spfn/core/server`. Use
> `getShutdownManager()` to obtain a `ShutdownManager` instance.

> The config-builder fluent methods (`.events()`, `.jobs()`, `.websockets()`,
> `.workflows()`, `.cors()`, `.middleware()`, `.use()`, `.infrastructure()`, …) are methods
> on the object returned by `defineServerConfig()` — they are **not** standalone exports.

---

## Quick Start

```typescript
// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { defineRouter, route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

const appRouter = defineRouter({
    getUser: route.get('/users/:id')
        .input({ params: Type.Object({ id: Type.String() }) })
        .handler(async (c) =>
        {
            const { params } = await c.data();
            return { id: params.id, name: 'John' };
        }),
});

export default defineServerConfig()
    .port(4000)
    .routes(appRouter)
    .build();

// Re-export the router type for the typed client
export type AppRouter = typeof appRouter;
```

```typescript
// src/server/index.ts (process entry point)
import { startServer } from '@spfn/core/server';

await startServer();
```

`startServer()` with no argument auto-discovers `server.config.ts` (see file-loading order
below), so the entry point usually stays this small. Pass a config object to
`startServer(config)` only to override at runtime (highest priority).

---

## Config builder (`defineServerConfig`)

Fluent builder; every method returns `this`; `.build()` returns a plain `ServerConfig`.
There is **no validation in the builder** — validation runs inside `startServer()`.

| Method | Sets | Notes |
|--------|------|-------|
| `.port(number)` | `port` | Default `4000` (env `PORT`) |
| `.host(string)` | `host` | Default `localhost` (env `HOST`) |
| `.routes(router)` | `routes` | Also auto-merges the router's `.use()` + `.packages()` global middlewares into `middlewares` |
| `.middlewares([named])` | `middlewares` | `NamedMiddleware[]` from `defineMiddleware()` (route-level `.skip()` targets these) |
| `.use([handlers])` | `use` | Raw `MiddlewareHandler[]`, applied `app.use('*', …)` |
| `.middleware({...})` | `middleware` | Toggle built-ins: `{ logger?, cors?, errorHandler?, onError? }` |
| `.cors(opts \| false)` | `cors` | hono/cors options, or `false` to disable |
| `.jobs(router, cfg?)` | `jobs` / `jobsConfig` | pg-boss job router (`@spfn/core/job`); `cfg` is `Omit<BossOptions, 'connectionString'>` |
| `.events(router, cfg?)` | `events` / `eventsConfig` | SSE router (`@spfn/core/event`); `cfg.path` default `/events/stream`, `cfg.auth` for token-gated streams |
| `.websockets(router, cfg?)` | `websockets` / `websocketsConfig` | WS router; `cfg.path` default `/ws`, `cfg.auth` for token auth |
| `.workflows(router, cfg?)` | `workflows` / `workflowsConfig` | `@spfn/workflow` router; inits engine after DB |
| `.database({...})` | `database` | Pool / healthCheck / monitoring overrides |
| `.timeout({...})` | `timeout` | `{ request?, keepAlive?, headers? }` (ms) |
| `.shutdown({...})` | `shutdown` | `{ timeout? }` (ms) |
| `.healthCheck({...})` | `healthCheck` | `{ enabled?, path?, detailed? }` |
| `.infrastructure({...})` | `infrastructure` | `{ database?, redis? }` — `false` disables auto-init |
| `.debug(boolean)` | `debug` | Default `NODE_ENV === 'development'` |
| `.lifecycle({...})` | merged | **Mergeable** — see below |
| `.build()` | — | Returns the final `ServerConfig` |

> There is **no** `.fetchTimeout()` builder method and **no** `.beforeStart()` /
> `.afterStart()` / `.beforeShutdown()` standalone builder methods. Fetch timeouts are set
> via the `fetchTimeout` field on a `ServerConfig` object (or env vars); lifecycle hooks go
> through `.lifecycle({ ... })`.

### `.routes()` auto-merges global middlewares

Calling `.routes(appRouter)` pulls in middlewares the router registered via its own
`.use()` and `.packages()` — you usually do **not** also call `.middlewares()`:

```typescript
const appRouter = defineRouter({ getUser, createUser })
    .packages([authRouter])           // package routers' globals included too
    .use([authMiddleware]);           // → auto-merged into server config.middlewares

export default defineServerConfig()
    .routes(appRouter)                // authMiddleware now active server-wide
    .build();
```

### `.lifecycle()` is mergeable (not last-wins)

Multiple `.lifecycle()` calls accumulate; for each hook name, the collected hooks run
**sequentially in registration order**. This is the one builder method that does not
overwrite on repeat.

```typescript
defineServerConfig()
    .lifecycle({ afterInfrastructure: async () => { await runMigrations(); } })
    .lifecycle({ afterInfrastructure: async () => { await seed(); } }) // runs AFTER migrations
    .build();
```

Hook signatures (`ServerConfig['lifecycle']`):

| Hook | Signature | When |
|------|-----------|------|
| `beforeInfrastructure` | `(config) => Promise<void>` | before DB/Redis init |
| `afterInfrastructure` | `() => Promise<void>` | after DB/Redis (and before jobs/workflows) |
| `beforeRoutes` | `(app: Hono) => void \| Promise<void>` | inside `createServer`, before routes |
| `afterRoutes` | `(app: Hono) => void \| Promise<void>` | inside `createServer`, after routes/SSE |
| `afterStart` | `(instance: ServerInstance) => Promise<void>` | server listening; throwing is logged, not fatal |
| `beforeShutdown` | `() => Promise<void>` | shutdown Phase 4 (DB/Redis still open) |

---

## `startServer` vs `createServer`

`startServer(config?)` is the full boot path and returns a `ServerInstance`:

```typescript
const instance = await startServer({ port: 3000 });
instance.server;  // Node http.Server (ReturnType<typeof serve>)
instance.app;     // Hono app
instance.config;  // resolved ServerConfig
await instance.close(); // graceful shutdown (same path as SIGTERM)
```

Its startup sequence:

1. `loadEnv()` (env files → `process.env`)
2. Load + merge config file (see order below) with the runtime `config` argument
3. `validateServerConfig()` — throws on bad port/timeout/shutdown/healthCheck.path
4. `lifecycle.beforeInfrastructure` → init DB (unless disabled) → init Redis (unless
   disabled) → `lifecycle.afterInfrastructure` → init pg-boss + register jobs (if `.jobs()`)
   → init workflow engine (if `.workflows()`)
5. `createServer(config)` builds the Hono app (middleware pipeline below)
6. `serve()` starts listening; WebSocket handler attached if `.websockets()`
7. Apply HTTP server timeouts + global `fetch()` (undici) timeouts
8. Print banner, register process handlers (`SIGTERM`, `SIGINT`, `uncaughtException`,
   `unhandledRejection`)
9. `lifecycle.afterStart(instance)`

`createServer(config?)` only does step 5 — it returns a configured `Hono` app **without
listening** and without infrastructure/shutdown. Use it for integration tests
(`app.request('/health')`) or when you call `@hono/node-server`'s `serve()` yourself.

### File-config loading order

`startServer()` scans these paths (first found wins), each merged **under** the runtime
`config` argument:

```
.spfn/server/server.config.mjs   (built, highest priority)
.spfn/server/server.config       (built .js)
src/server/server.config         (source .js)
src/server/server.config.ts      (source .ts, lowest)
```

`port`/`host` resolve as `runtime ?? file ?? env (PORT/HOST) ?? defaults (4000/localhost)`.

### Level 3: full control with `app.ts`

If `src/server/app.ts` (or `app.js`) exists, `createServer` imports its default export (an
`AppFactory = () => Promise<Hono> | Hono`) and uses **that** app instead of the
auto-configured pipeline. Config `routes` are still registered onto your app, but the
automatic middleware/health-check/SSE wiring is **skipped** — you own it.

```typescript
// src/server/app.ts
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import type { AppFactory } from '@spfn/core/server';

export default (async () =>
{
    const app = new Hono();
    app.use('*', compress());
    return app;
}) satisfies AppFactory;
```

---

## Auto-configured middleware pipeline

When there is no `app.ts`, `createServer` builds the app in this **fixed order**:

```
1. errorHandlerEnabled flag        (if middleware.errorHandler !== false)
2. RequestLogger()                 (if middleware.logger !== false)
3. cors(config.cors)               (if middleware.cors !== false && cors !== false)
4. config.use[*]                   (raw custom middleware, in array order)
5. health-check route              (GET config.healthCheck.path, default /health)
6. lifecycle.beforeRoutes(app)
7. registerRoutes(app, routes, middlewares)
8. SSE endpoint                    (if .events(): GET /events/stream [+ POST token])
9. lifecycle.afterRoutes(app)
10. app.onError(ErrorHandler(...)) (if middleware.errorHandler !== false)
```

- Each built-in is opt-out via `.middleware({ logger: false, cors: false, errorHandler: false })`.
- `.middleware({ onError })` forwards an error callback into `ErrorHandler` (e.g. Slack
  notifier) — it runs async and does not block the response.
- Named `middlewares` (from `.middlewares()` / `.routes()`) are applied **per route** inside
  `registerRoutes`, respecting each route's `.skip([...])` / `.skip('*')`. Validation
  middleware is never skipped.

---

## Infrastructure, jobs, events, websockets, workflows

**DB/Redis** auto-init during step 4 when their env vars exist. Disable selectively:

```typescript
defineServerConfig()
    .infrastructure({ database: false, redis: true })
    .build();
```

**Jobs** (`.jobs(jobRouter)`) require a database — `startServer` throws
`'Jobs require database connection.'` if `DATABASE_URL` is unset. pg-boss is started and
jobs registered after `afterInfrastructure`.

**Events** (`.events(eventRouter)`) register an SSE stream at `/events/stream` (override via
`{ path }`). With `{ auth: { enabled: true } }`, a `POST /events/token` endpoint is also
registered, guarded by `config.middlewares`; if a cache (Redis/Valkey) is available it's
used as the token store automatically (multi-instance safe), else in-memory.

**WebSockets** (`.websockets(wsRouter)`) attach a WS handler at `/ws` (override via
`{ path }`); `{ auth: { enabled: true } }` adds `POST /ws/token` the same way as SSE.

**Workflows** (`.workflows(workflowRouter)`) require database enabled — throws otherwise —
and call the router's `_init(getDatabase(), workflowsConfig)` after infrastructure.

---

## Graceful shutdown & `ShutdownManager`

`SIGTERM`/`SIGINT` (and `instance.close()`) trigger an outer timeout
(`shutdown.timeout`, env `SHUTDOWN_TIMEOUT`, default 280000ms) wrapping 5 phases:

```
beginShutdown()                    health → 503, trackOperation() now rejects
Phase 1  HTTP server.close()       stop new connections (5s cap), drain in-flight requests
Phase 1.5 WS cleanup               (if websockets)
Phase 2  stopBoss()                (if jobs)
Phase 3  ShutdownManager.execute() drain tracked ops then run hooks (drainTimeout = 80% of shutdown.timeout)
Phase 4  lifecycle.beforeShutdown()
Phase 5  closeDatabase + closeCache (5s each)
         process.exit(0)
```

`uncaughtException` / `unhandledRejection` are **logged, not fatal** — the server keeps
running.

Obtain the singleton with `getShutdownManager()`:

```typescript
import { getShutdownManager } from '@spfn/core/server';

const shutdown = getShutdownManager();

// Register an independent cleanup hook (runs in Phase 3, ordered)
shutdown.onShutdown('ai-client', async () => { await aiClient.close(); },
    { timeout: 5000, order: 10 });

// Track a long op so drain waits for it (rejects if already shutting down)
const result = await shutdown.trackOperation('ai-generate', aiService.generate(prompt));

// Reject new work early in a handler
if (shutdown.isShuttingDown())
{
    return c.json({ error: 'shutting down' }, 503);
}
```

| Method | Description |
|--------|-------------|
| `onShutdown(name, handler, opts?)` | Register cleanup hook. `opts.timeout` default 10000ms, `opts.order` default 100 (lower runs first). Hook failure/timeout does not block later hooks. |
| `trackOperation(name, promise)` | Await + track an op; drain waits for it. **Throws** if shutdown already started. |
| `isShuttingDown()` | `true` once `beginShutdown()` ran (state ≠ `running`). |
| `getActiveOperationCount()` | Number of in-flight tracked operations. |

State machine: `running → draining → closed`. `beginShutdown()` / `execute()` are driven by
the server's shutdown sequence — application code uses the four methods above.

---

## Health check

`GET /health` (path/enabled/detailed configurable). During shutdown it returns 503
`{ status: 'shutting_down' }` immediately (k8s readiness signal).

- **Basic** (`detailed: false`, the production default): `{ status, timestamp }`, 200.
- **Detailed** (`detailed: true`, the dev default): adds
  `services.{database,redis}.status` — `connected` / `error` / `not_initialized` /
  `unknown`. Any DB `error`/`not_initialized` or Redis `error` ⇒ `status: 'degraded'` and
  HTTP **503**.

```typescript
defineServerConfig()
    .healthCheck({ path: '/api/health', detailed: true })
    .build();
```

---

## Timeouts (HTTP + outbound fetch)

HTTP server timeouts (`.timeout({...})` or env), applied to the Node server after listen:

| Field | Env | Default | Purpose |
|-------|-----|---------|---------|
| `request` | `SERVER_TIMEOUT` | 120000 | whole request/response cycle |
| `keepAlive` | `SERVER_KEEPALIVE_TIMEOUT` | 65000 | idle connection reuse (keep > LB timeout) |
| `headers` | `SERVER_HEADERS_TIMEOUT` | 60000 | header receipt (Slowloris guard; must be ≤ `request`) |

Outbound `fetch()` (undici global dispatcher) — set via the `fetchTimeout` field on a
`ServerConfig` object or env (no builder method):

| Field | Env | Default |
|-------|-----|---------|
| `connect` | `FETCH_CONNECT_TIMEOUT` | 10000 |
| `headers` | `FETCH_HEADERS_TIMEOUT` | 300000 |
| `body` | `FETCH_BODY_TIMEOUT` | 300000 |

---

## Pitfalls & anti-patterns

- **Builder methods are not exports.** `events`, `jobs`, `websockets`, `cors`, etc. are
  methods on `defineServerConfig()`, not importable functions. Routes/middleware come from
  `@spfn/core/route`, not `@spfn/core/server`.
- **Middleware pipeline order is fixed and opt-out only.** You cannot reorder built-ins;
  you can only disable them via `.middleware({ logger:false, cors:false, errorHandler:false })`.
  CORS / logger run **before** custom `.use()` middleware; `ErrorHandler` is registered via
  `app.onError` **last**.
- **`.routes()` already merges router middlewares.** Calling `.middlewares()` *and*
  registering the same middleware via the router's `.use()` double-applies it. Prefer one.
- **`.lifecycle()` merges, every other method overwrites.** A second `.port()` wins; a
  second `.lifecycle()` *adds* hooks (run in order). Don't expect last-wins for lifecycle.
- **`afterStart` errors are swallowed.** They are logged but never thrown — the server is
  already listening. Don't rely on `afterStart` to abort startup; use
  `beforeInfrastructure` for fail-fast preconditions.
- **`createServer()` does not init infrastructure or shutdown.** `getDatabase()` /
  `getCache()` are not ready unless you initialized them yourself. For a real process use
  `startServer()`; reserve `createServer()` for tests / custom `serve()`.
- **Jobs/workflows require the database.** `.jobs()` throws without `DATABASE_URL`;
  `.workflows()` throws if `.infrastructure({ database: false })`.
- **Default port is 4000, not 8790.** The 8790 default is the CLI dev wrapper's concern;
  `PORT` env / `.port()` always win. Older docs showing 8790 as the programmatic default are
  stale.
- **No `app.ts` ⇒ auto pipeline; `app.ts` present ⇒ you own everything.** With `app.ts`,
  built-in middleware, health check, and SSE wiring are **not** added — only config `routes`
  are registered onto your app.
- **`headers` timeout must be ≤ `request`.** `validateServerConfig` throws
  `headers timeout (...) cannot exceed request timeout (...)`. Negative/non-finite
  port/timeout/shutdown values also throw at `startServer()` time.
- **Don't import `validateServerConfig` / `printBanner` / `ShutdownManager` from
  `@spfn/core/server`** — not in the public barrel. Use `getShutdownManager()`.
- **`loadEnvFiles` is deprecated** (warns once). `startServer()` calls `loadEnv()` for you;
  only call `loadEnv` manually outside `startServer` (e.g. a script).

---

## Complete example

```typescript
// src/server/server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { defineRouter, route, defineMiddleware } from '@spfn/core/route';
import { getDatabase } from '@spfn/core/db';
import { getShutdownManager } from '@spfn/core/server';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { Type } from '@sinclair/typebox';

const auth = defineMiddleware('auth', async (c, next) =>
{
    if (!c.req.header('authorization')) return c.json({ error: 'Unauthorized' }, 401);
    await next();
});

const appRouter = defineRouter({
    getUser: route.get('/users/:id')
        .input({ params: Type.Object({ id: Type.String() }) })
        .handler(async (c) =>
        {
            const { params } = await c.data();
            return { id: params.id };
        }),
    health: route.get('/ping').skip(['auth']).handler(async () => ({ ok: true })),
})
.use([auth]);

// Independent module cleanup — registered once, runs in shutdown Phase 3
getShutdownManager().onShutdown('message-queue', async () =>
{
    await closeMessageQueue();
}, { order: 10 });

export default defineServerConfig()
    .port(4000)
    .host('0.0.0.0')
    .routes(appRouter)                         // merges `auth` from .use()
    .middleware({ logger: true, cors: true })
    .cors({ origin: ['https://app.example.com'], credentials: true })
    .timeout({ request: 60000 })
    .healthCheck({ path: '/api/health', detailed: true })
    .shutdown({ timeout: 280000 })
    .lifecycle({
        afterInfrastructure: async () =>
        {
            await migrate(getDatabase(), { migrationsFolder: './drizzle' });
        },
    })
    .build();

export type AppRouter = typeof appRouter;
```

```typescript
// src/server/index.ts
import { startServer } from '@spfn/core/server';

const instance = await startServer();
// instance.server / instance.app / instance.config / instance.close()
```

```typescript
// integration test — no listen, no infra
import { createServer } from '@spfn/core/server';
import config from './server.config';

const app = await createServer(config);
const res = await app.request('/api/health');
```

---

## Types reference

```typescript
function startServer(config?: ServerConfig): Promise<ServerInstance>;
function createServer(config?: ServerConfig): Promise<Hono>;
function defineServerConfig(): ServerConfigBuilder;
function getShutdownManager(): ShutdownManager;

type AppFactory = () => Promise<Hono> | Hono;

interface ServerInstance
{
    server: ReturnType<typeof import('@hono/node-server').serve>;
    app: Hono;
    config: ServerConfig;
    close: () => Promise<void>;
}

interface ShutdownHookOptions
{
    timeout?: number;  // default 10000
    order?: number;    // default 100 (lower runs first)
}
// ServerConfig: see config-builder table above — port, host, cors, middleware, use,
// middlewares, routes, jobs/jobsConfig, events/eventsConfig, websockets/websocketsConfig,
// workflows/workflowsConfig, debug, database, timeout, fetchTimeout, shutdown, healthCheck,
// infrastructure, lifecycle.
```

## Related

- [@spfn/core/route](../route/README.md) — `defineRouter`, `route`, `defineMiddleware`, `.skip()`
- [@spfn/core/env](../env/README.md) — `loadEnv`, schema/registry (`PORT`, `HOST`, timeout vars)
- [@spfn/core/job](../job/README.md) — `job`, `defineJobRouter` (pg-boss)
- [@spfn/core/event](../event/README.md) — `defineEvent`, `defineEventRouter` (SSE), WS router
- [@spfn/core/middleware](../middleware/README.md) — `RequestLogger`, `ErrorHandler`, CORS
