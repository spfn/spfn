---
title: Get Started
description: Install SPFN, create a project, and ship your first typed route.
---

## Create a project

```bash
npx spfn@beta create my-app
cd my-app
docker compose up -d            # Postgres + Redis
pnpm spfn:dev                   # Next.js :3790 + SPFN API :8790
```

`spfn create` runs `create-next-app` with SPFN-recommended flags and sets up the
backend structure. Env files are generated for you — server secrets go in
`.env.server`. Already have a Next.js app? `npx spfn@beta init` adds SPFN to it.

Requirements: Node.js 18.18+, Next.js 15+ (App Router, `src/` dir), PostgreSQL.

## The pattern

A feature is one vertical slice, each layer in its own file:

```text
Entity (Drizzle table)
  → Repository (extends BaseRepository)
  → Route (route.get/post/… with TypeBox validation)
  → Router (defineRouter)
  → pnpm codegen (generated route map)
  → createApi<AppRouter>() (typed client)
```

The route map and client types are generated — edit the source route, run
`pnpm spfn codegen`, and every consumer is type-checked against the change.

## Go deeper

- [The SPFN pattern](./docs/pattern.md) — slice anatomy, codegen, the typed
  client loop
- [Packages](./docs/packages.md) — the `@spfn/*` family, documented on this site
- [Runnable examples](https://github.com/spfn/spfn/tree/main/examples) — from a
  minimal API to auth, end to end
