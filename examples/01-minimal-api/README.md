# 01 · Minimal API

The smallest possible SPFN app — **one route, one typed client call, no database**.
Start here to understand the core request path before adding persistence (see
[02 · Database CRUD](../02-database-crud)).

## What it shows

| File | Concept |
| --- | --- |
| `src/server/routes/greeting.ts` | A route: `route.get(path).input({...}).handler(...)` with TypeBox validation |
| `src/server/router.ts` | `defineRouter({...})` — composes routes; its type is the client contract |
| `src/app/api/rpc/[routeName]/route.ts` | `createRpcProxy({ routeMap })` — forwards browser calls to the API server |
| `src/lib/api-client.ts` | `createApi<AppRouter>()` — one fully typed client |
| `src/app/page.tsx` | A Server Component that actually calls `api.getGreeting.call(...)` |

```
page.tsx ──api.getGreeting.call()──▶ /api/rpc/[routeName] ──▶ SPFN API server ──▶ greeting route
```

No entities, no repositories, no Postgres — just the typed edge from UI to handler.

## Run it

> Prerequisites: Node ≥ 18.18, pnpm. No database needed.

From the repo root, `pnpm install`. Then in this directory:

```bash
cp .env.local.example .env.local   # sets SPFN_API_URL
pnpm codegen                       # generates src/generated/route-map.ts
pnpm spfn:dev                      # runs the API server + Next.js together
```

Open the app and you'll see the live JSON returned by the `greeting` route. Try the
API directly too: `GET /greeting?name=You`.

## Next step

Add a database and the Entity → Repository pattern in
[02 · Database CRUD](../02-database-crud).
