---
title: Superfunction
description: TypeScript framework for full-stack apps — a typed SPFN backend inside your Next.js project.
layout: landing
---

# Ship full-stack TypeScript, typed end to end

SPFN puts a real backend inside your Next.js project: entities, repositories,
routes, and a generated RPC client that share one type system. No separate
server repo, no hand-written API contracts — change a route and the client
type changes with it.

```bash
npx spfn@beta create my-app
cd my-app
docker compose up -d
pnpm spfn:dev
```

## Why SPFN

- **Typed end to end** — Drizzle entities → repositories → TypeBox-validated
  routes → a generated `createApi<AppRouter>()` client. The compiler catches
  what integration tests used to.
- **One vertical slice per feature** — Entity, Repository, Route, Router, each
  in its own file. Agents and humans both know exactly where things go.
- **Batteries as packages** — auth, storage, notifications, monitoring, CMS,
  and workflow ship as composable `@spfn/*` packages, not a monolith.
- **Next.js native** — one repo, one dev command; the backend runs beside your
  app with its own port and lifecycle.

[Get started](./docs.md), or browse the source and package docs on
[GitHub](https://github.com/spfn/spfn).
