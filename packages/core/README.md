# @spfn/core — Type-safe Next.js + Hono backend framework (route DSL → RPC proxy → typed client)

`@spfn/core` is the backend runtime for SPFN: a tRPC-style **route DSL** (TypeBox-validated,
end-to-end typed), a Drizzle/postgres.js **data layer**, an HTTP **server** entry point, and a
Next.js **RPC proxy + typed client** that wires a browser/RSC app to that backend with
compile-time-only type inference.

There is **no root barrel** — `@spfn/core` itself imports nothing. Everything is reached
through subpath exports (`@spfn/core/route`, `@spfn/core/db`, `@spfn/core/nextjs`, …). Each
module is canonically documented in its own `src/<mod>/README.md`; this file is the index +
end-to-end flow. Follow the links for API detail.

## Install

```bash
pnpm add @spfn/core
# peer (optional): next ^15 || ^16
# optional deps: ioredis (cache), ws (websocket events); pg-boss ships as a direct dep for jobs
```

Node `>=18.18.0`. ESM-only.

> **Apps that define entities must declare the Postgres driver directly:** add
> `postgres` (and `pg`) to your app's `dependencies`. `@spfn/core` uses postgres.js
> internally, and Drizzle branches its type resolution on the `postgres`/`pg` peer. If
> the app doesn't pin the same driver, pnpm resolves `drizzle-orm` to a second instance,
> `BaseRepository` generics collapse to `unknown`, and RPC responses lose their types.
> `spfn create` adds these automatically; declare them by hand only when wiring SPFN into
> an existing app.
>
> ```bash
> pnpm add postgres pg
> ```

## Modules

Each entry below is exactly one subpath from `package.json` `exports`. Import path → one-line
purpose → canonical README.

| Import path | Purpose | Doc |
|-------------|---------|-----|
| `@spfn/core/route` | tRPC-style route DSL (`route.get(...).input(...).handler(...)`) + `defineRouter` / `registerRoutes` / `defineMiddleware`. The core. | [src/route/README.md](./src/route/README.md) |
| `@spfn/core/route/types` | Shared route types (`HttpMethod`, route/router type primitives). | [src/route/README.md](./src/route/README.md) |
| `@spfn/core/server` | HTTP server entry: `defineServerConfig()` → `startServer()`; middleware auto-wiring, infra init, graceful shutdown. | [src/server/README.md](./src/server/README.md) |
| `@spfn/core/nextjs` | Client-safe: `createApi<AppRouter>()`, `ApiError`, client types. No `next/headers`. | [src/nextjs/README.md](./src/nextjs/README.md) |
| `@spfn/core/nextjs/server` | Server-only: `createRpcProxy({ routeMap })`, `registerInterceptors`. Uses `next/headers`. | [src/nextjs/README.md](./src/nextjs/README.md) |
| `@spfn/core/db` | Type-safe PostgreSQL (Drizzle): CRUD helpers, `BaseRepository`, schema helpers, transactions, PG error mapping. Single entry point. | [src/db/README.md](./src/db/README.md) |
| `@spfn/core/db` → manager | Connection lifecycle, pool, primary/replica, health-check, reconnect (`initDatabase`, `getDatabase`). Re-exported from `@spfn/core/db`. | [src/db/manager/README.md](./src/db/manager/README.md) |
| `@spfn/core/db` → schema | Drizzle column helpers (`id`, `uuid`, `timestamps`, `foreignKey`, `enumText`, `typedJsonb`, `softDelete`, …). Re-exported from `@spfn/core/db`. | [src/db/schema/README.md](./src/db/schema/README.md) |
| `@spfn/core/db` → transaction | `Transactional` middleware + `runInTransaction`; AsyncLocalStorage propagation to every repo. Re-exported from `@spfn/core/db`. | [src/db/transaction/README.md](./src/db/transaction/README.md) |
| `@spfn/core/middleware` | Built-in Hono middleware: `ErrorHandler`, `RequestLogger` (+ masking helper). | [src/middleware/README.md](./src/middleware/README.md) |
| `@spfn/core/errors` | Serializable HTTP/DB error classes + `ErrorRegistry` for cross-boundary deserialization. | [src/errors/README.md](./src/errors/README.md) |
| `@spfn/core/env` | Schema-based env validation/parsing (isomorphic). `@spfn/core/env/loader` is the **server-only** file loader (`node:fs`). | [src/env/README.md](./src/env/README.md) |
| `@spfn/core/config` | `@spfn/core`'s own validated env config (`env`, `envSchema`, `registry`) built on `@spfn/core/env`. | [src/config/README.md](./src/config/README.md) |
| `@spfn/core/logger` | Zero-dependency structured singleton `logger` + child loggers, level masking. | [src/logger/README.md](./src/logger/README.md) |
| `@spfn/core/cache` | Singleton Valkey/Redis (ioredis) manager, graceful-degrading (`getCache`, `getCacheRead`). | [src/cache/README.md](./src/cache/README.md) |
| `@spfn/core/job` | pg-boss background jobs: fluent `job()` builder, cron/run-once/event-driven, `defineJobRouter`. | [src/job/README.md](./src/job/README.md) |
| `@spfn/core/event` | Decoupled pub/sub (`defineEvent`, `defineEventRouter`, `eventRouteMap`); SSE/WS variants below. | [src/event/README.md](./src/event/README.md) |
| `@spfn/core/event/sse` | Server SSE handler + token manager (SERVER ONLY). | [src/event/README.md](./src/event/README.md) |
| `@spfn/core/event/sse/client` | Browser SSE (`EventSource`) client. | [src/event/README.md](./src/event/README.md) |
| `@spfn/core/event/ws` | Server WebSocket handler (SERVER ONLY; `ws` optional dep). | [src/event/README.md](./src/event/README.md) |
| `@spfn/core/event/ws/client` | Browser WebSocket client. | [src/event/README.md](./src/event/README.md) |
| `@spfn/core/codegen` | Pluggable codegen orchestrator + the built-in `@spfn/core:route-map` generator that produces the proxy's `routeMap`. | [src/codegen/README.md](./src/codegen/README.md) |

`db/manager`, `db/schema`, `db/transaction` have **no package subpath** of their own — they are
internal modules re-exported by `@spfn/core/db`. Import them from `@spfn/core/db`. (See Pitfalls
for the `./client` subpath.)

## How it works

End-to-end, a SPFN backend is **defined once** on the server and consumed type-safely from the
Next.js app. Types flow purely through TypeScript inference; the only generated artifact is the
proxy's `routeMap`.

```
 ① route DSL            ② defineRouter           ③ defineServerConfig → startServer
 route.get('/users/:id')   defineRouter({ getUser,    defineServerConfig()
   .input({ params })        createUser })               .routes(appRouter).build()
   .handler(c => …)        export type AppRouter        startServer()  →  Hono on :8790
        │                       = typeof appRouter            ▲
        │ TypeBox = runtime validation + compile-time types   │ registerRoutes mounts routes
        ▼                                                      │
 ④ codegen (@spfn/core:route-map)  ──►  routeMap = { getUser: { method:'GET', path:'/users/:id' }, … }
        │
        ▼
 ⑤ Next.js RPC proxy                         ⑥ typed client
 app/api/rpc/[routeName]/route.ts            lib/api.ts
 createRpcProxy({ routeMap })                createApi<AppRouter>()   (no codegen for the client)
   GET/POST /api/rpc/{routeName}               api.getUser.call({ params:{ id } })
   resolves real method+path from routeMap       └─ fully typed input + output
   forwards to backend, runs interceptors
```

1. **Define a route** with `route.<method>(path).input({...}).handler(c => …)` from
   `@spfn/core/route`. TypeBox schemas in `.input()` give both runtime validation and the
   compile-time types the handler (`await c.data()`) and the client see. The handler's **return
   type is inferred** — no manual response typing.
2. **Compose routes** with `defineRouter({ … })` and export `type AppRouter = typeof appRouter`.
   That type is the single source of truth for the client; no client codegen reads it.
3. **Boot the server** with `defineServerConfig().routes(appRouter).build()` then `startServer()`
   (`@spfn/core/server`). It auto-wires `ErrorHandler`/`RequestLogger`, inits DB/cache, mounts
   routes via `registerRoutes`, and runs jobs/events. A request is matched by Hono → global
   middleware → route middleware (`.use([...])`, e.g. `Transactional()`) → input validation/type
   conversion → handler → serialized response.
4. **Generate the route-map** with codegen (`@spfn/core:route-map`, e.g. `pnpm codegen`). It emits
   `routeName → { method, path }` — the only thing the proxy needs to resolve the *real* backend
   method/path.
5. **Mount the RPC proxy** in Next.js: `createRpcProxy({ routeMap })` from
   `@spfn/core/nextjs/server` as the `app/api/rpc/[routeName]/route.ts` catch-all. The client only
   ever sends `GET` (no body) or `POST` (body/formData) to `/api/rpc/{routeName}`; the proxy looks
   up `routeMap[routeName]`, substitutes `:params`, and forwards to the backend with the resolved
   method. Package route maps (`authRouteMap`, `eventRouteMap`) merge into the same `routeMap`.
6. **Call it** through `createApi<AppRouter>()` from `@spfn/core/nextjs`. The client is a `Proxy`
   over `AppRouter` — `api.getUser.call({ params })` is fully typed in and out, with zero runtime
   type cost. Errors come back as `ApiError`, or as the original typed error when its class is in
   the client's `errorRegistry` (the core registry is always merged in).

## Quick example

```typescript
// server/router.ts — ① + ②
import { defineRouter, route } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { Type } from '@sinclair/typebox';

export const appRouter = defineRouter({
    getUser: route.get('/users/:id')
        .input({ params: Type.Object({ id: Type.String() }) })
        .handler(async (c) =>
        {
            const { params } = await c.data();   // params.id: string
            return { id: params.id, name: 'John' };   // return type inferred
        }),

    createUser: route.post('/users')
        .input({ body: Type.Object({ name: Type.String() }) })
        .use([Transactional()])                  // auto commit/rollback
        .handler(async (c) =>
        {
            const { body } = await c.data();
            return { id: '2', name: body.name };
        }),
});

export type AppRouter = typeof appRouter;
```

```typescript
// server/index.ts — ③
import { defineServerConfig, startServer } from '@spfn/core/server';
import { appRouter } from './router';

export default defineServerConfig().port(8790).routes(appRouter).build();
await startServer();   // Hono on :8790
```

```typescript
// app/api/rpc/[routeName]/route.ts — ⑤  (server-only)
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { routeMap } from '@/generated/route-map';   // ④ codegen output

export const { GET, POST } = createRpcProxy({ routeMap });
```

```typescript
// lib/api.ts — ⑥  (client-safe; no codegen)
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

export const api = createApi<AppRouter>();

// anywhere (RSC / client / server action):
const user = await api.getUser.call({ params: { id: '123' } });    // typed { id, name }
const made = await api.createUser.call({ body: { name: 'A' } });
```

## Pitfalls

- **No root barrel.** `import … from '@spfn/core'` does not resolve. Import from a subpath
  (`@spfn/core/route`, `@spfn/core/db`, …). The list above *is* the complete public surface.
- **Use `@spfn/core/nextjs` for the client, not `@spfn/core/client`.** `package.json` still lists a
  `./client` export, but the build does not emit it (no `src/client`; the tsup `client` entry is
  disabled). `createApi` / `ApiError` and all client types ship from **`@spfn/core/nextjs`**. Treat
  `@spfn/core/client` as non-functional.
- **Client vs. server boundary is load-bearing.** `@spfn/core/nextjs/server` pulls in
  `next/headers` + `next/server`; never import it from a Client Component. `@spfn/core/env/loader`,
  `@spfn/core/event/sse`, `@spfn/core/event/ws` are server-only (`node:fs` / Hono / `node:crypto`).
  Client code uses the `*/client` and isomorphic entry points only.
- **`db/manager`, `db/schema`, `db/transaction` are not package subpaths.** Importing
  `@spfn/core/db/transaction` fails to resolve — import those symbols from `@spfn/core/db`.
- **The client needs no codegen; the proxy does.** `createApi<AppRouter>()` is metadata-free and
  driven by the `AppRouter` *type*. The generated `routeMap` is consumed by `createRpcProxy`. A
  `routeName` missing from the merged `routeMap` is a **proxy 404**, not a backend 404 — re-run
  codegen after adding routes.
- **The proxy decides the real HTTP method.** The client only sends GET/POST to `/api/rpc/...`; a
  PUT/PATCH/DELETE route still works because the backend method comes from `routeMap[routeName]`.
- **Cache/event/job degrade or depend on optional deps.** `@spfn/core/cache` runs disabled (getters
  return `undefined`) without `CACHE_*` config or `ioredis`; WebSocket events need the optional `ws`
  dep. Don't assume they throw.

## Related packages

Other SPFN packages build on `@spfn/core`:

- [`@spfn/auth`](../auth/README.md) — auth/session; exports `authRouteMap` and auto-registers proxy
  interceptors (merge its route map into `createRpcProxy`).
- `@spfn/nextjs`, `@spfn/cms`, `@spfn/workflow`, `@spfn/notification`, `@spfn/monitor`, `@spfn/cli`
  — see each package's README under `packages/`.
