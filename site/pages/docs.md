---
title: Get Started
description: Scaffold a full-stack SPFN product and take it from first prompt to production.
---

## Create a project

```bash
pnpm dlx spfn@beta create my-app --mode full
cd my-app
docker compose up -d            # Postgres + Redis
pnpm spfn:dev                   # Next.js :3790 + SPFN API :8790
```

Full mode starts with `@spfn/core`, auth, i18n, and MCP wired into one application.
Connect the provider and infrastructure keys your product needs, then give your agent
the product brief. Env files are generated for you — server secrets go in
`.env.server`.

Want only the framework kernel? Use `--mode bare`. The interactive prompt recommends
full mode; scripts and agents should always pass `--mode full` or `--mode bare`
explicitly. Already have a Next.js app? `pnpm dlx spfn@beta init --mode full` adds the
same foundation to it.

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

This predictable shape gives an agent a reliable path through the codebase. Runtime
validation, generated route maps, migrations, and end-to-end types then act as
production guardrails around fast iteration.

## Go deeper

- [Prototype to Production](./docs/prototype-to-production.md) — scaffold the full
  foundation, build in vertical slices, deploy, and connect an agent through MCP
- [Tutorial: Full-Stack Auth](./docs/tutorial.md) — understand the auth wiring in depth:
  seeded admin, login form, social login, and layout guards, running locally
- [The SPFN pattern](./docs/pattern.md) — slice anatomy, codegen, the typed
  client loop
- [Packages](./docs/packages.md) — the `@spfn/*` family, documented on this site
- [Runnable examples](https://github.com/fxylabs/spfn/tree/main/examples) — from a
  minimal API to auth, end to end
