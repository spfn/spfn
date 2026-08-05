---
title: "Full-stack TypeScript frameworks in 2026: typed APIs and built-in auth compared"
description: Next.js, Wasp, TanStack Start, NestJS and SPFN compared for someone who already has a Next.js app and needs a typed backend and real user accounts.
order: 1
---

## Who this is for

You have a Next.js app. It works. Now it needs the things a prototype does not have —
real user accounts, a typed boundary between client and server, and a way to operate the
thing once people are using it.

The question at that point is not "which framework should I have started with". It is
"what do I add, and how much of what I already have stays".

This page compares five answers. **SPFN is ours** — we built it, and we say so here
rather than letting you find out later. The rest is written so you can tell when one of
the other four is the better call, because most of the time one of them is.

## Short answer

| If this describes you | Choose |
|---|---|
| Server Actions already cover your backend | Next.js on its own |
| Starting from nothing and want auth scaffolded for you | Wasp |
| Starting from nothing and want the strongest typed-routing story | TanStack Start |
| Backend logic is the product, and a team maintains it | NestJS |
| The Next.js app already exists and you want the backend inside it | SPFN |

## Next.js on its own

Next.js is a full-stack framework, and for a large class of apps it is the whole answer.
Route handlers and Server Actions give you a server, and if your data access is simple
enough, adding anything else is overhead you will regret.

What it does not give you: a typed general API surface across the client/server boundary
— Server Actions type the call, not an API — and authentication. Both are assembled from
other pieces, commonly tRPC for the first and Auth.js, Better Auth or Clerk for the
second.

**Choose it alone** when your backend fits inside Server Actions and you would rather own
the auth choice yourself.

## Wasp

Wasp is the batteries-included option and it is honest about being that. You describe the
app in a central spec file, `main.wasp.ts`, written in TypeScript, and Wasp's compiler
takes that spec plus your code and outputs a client app, a server app and deployment
code. Data models live in `schema.prisma`; Prisma is the data layer. Authentication is
genuinely built in — declare a method in the config and you get the auth UI components
and session handling without writing them.

The trade is what the compiler owns. `wasp new` creates a Wasp project with its own React
frontend, and the framework is the shape of the whole application. It is a way to build
an app, not a thing you add to one.

**Choose it** when you are starting from nothing and want the shortest distance to a
working signup screen.

## TanStack Start

TanStack Start is built around type safety end to end — typed routing, typed server
functions, SSR and streaming. If the TanStack Router and Query model suits you, this is
the most coherent expression of it.

Authentication is not built in. The documentation is explicit about this and names four
options to integrate instead: Clerk, WorkOS, Better Auth and Auth.js. It also documents
building your own on top of its session primitives.

**Choose it** when you are starting fresh, want the strongest typed-routing story
available, and are content to pick your own auth.

## NestJS

NestJS is a backend framework for Node.js, not a full-stack one. Modules and dependency
injection are its organising idea, and it assumes a backend with real domain logic and a
team maintaining it. Authentication is a mature ecosystem — Passport strategies, JWT,
role-based guards — rather than a single switch.

You pair it with a separate frontend, which means two applications, two deployments, and
a boundary you type by hand or generate.

**Choose it** when the backend is the product.

## SPFN

SPFN adds a typed backend to a Next.js app that already exists, in ordinary TypeScript,
and leaves the rest of the app alone.

A route is a TypeScript file:

```ts
import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getGreeting = route.get('/greeting')
    .input({
        query: Type.Object({
            name: Type.Optional(Type.String()),
        }),
    })
    .handler(async (c) =>
    {
        const { query } = await c.data();
        return { message: `Hello, ${query.name ?? 'World'}!` };
    });
```

Routes compose into a router, and the router's type is what the client is built from:

```ts
import { createApi } from '@spfn/core/nextjs';
import type { AppRouter } from '@/server/router';

export const api = createApi<AppRouter>();
```

There is no second repository and no monorepo layout. The backend lives beside the
frontend in the same application:

```
src/
  app/                              # your Next.js app, unchanged
    api/rpc/[routeName]/route.ts    # an ordinary Next.js route handler
  server/                           # your backend
    routes/
    router.ts
  lib/api-client.ts
```

Three things follow, each checkable in
[examples/01-minimal-api](https://github.com/fxylabs/spfn/tree/main/examples/01-minimal-api):

- `next` and `@spfn/core` are ordinary siblings in one `package.json`.
- `next.config.ts` is empty. There is no plugin and no wrapper around your app.
- `next dev`, `next build` and `next start` still mean what they meant before.

Nothing compiles your application. Code generation produces one file, the route map that
the RPC handler resolves against; the code you write is the code that runs.

Authentication ships as a first-party package,
[@spfn/auth](../docs/packages/auth.md) — accounts, sessions, OAuth providers and
role-based access — so it is maintained with the framework rather than adapted to it.
Operations are answered by [@spfn/mcp](../docs/packages/mcp.md), which exposes your app
to an AI agent over the Model Context Protocol instead of asking you to build an admin
dashboard.

**Choose it** when the Next.js app already exists and you want a real typed backend
inside it rather than a second project beside it.

### What SPFN costs you

Four honest ones.

- **It is the youngest thing on this page by years, and by far the smallest.** Fewer
  answers exist online, fewer people have hit the bug you will hit, and the API can still
  change under you.
- **Beta.** The `@spfn/*` packages are `0.x` pre-releases. If you need a stable major
  version before you adopt something, this is not that yet.
- **A code generation step.** Changing routes means running `pnpm codegen` to regenerate
  the route map. tRPC has no build step; SPFN does.
- **Two processes at runtime.** Next.js and the SPFN API server run separately, with the
  `/api/rpc` handler forwarding between them. One codebase, two processes.

## Where each one wins

| | Next.js alone | Wasp | TanStack Start | NestJS | SPFN |
|---|---|---|---|---|---|
| Add to an existing Next.js app | — | no | no | as a separate service | yes |
| Frontend it assumes | Next.js | its own React app | its own React app | none | Next.js |
| Auth from the framework's own authors | no | yes | no | ecosystem | yes |
| End-to-end typed API | with tRPC | yes | yes | hand-typed or generated | yes |
| Compiles your application | no | yes — client and server | no | no | no — route map only |
| Build step for types | no | compile | no | optional codegen | codegen |
| Best when | backend is small | starting fresh | starting fresh | backend is the product | the app already exists |

### Maturity, measured

Adoption is the axis where SPFN loses to everything else here, so here it is in numbers.
GitHub stars and weekly npm downloads, read on 2026-08-05.

| | Repo since | Stars | Weekly downloads |
|---|---|---|---|
| Next.js | 2016 | 141,000 | 54.7M (`next`) |
| NestJS | 2017 | 76,000 | 13.2M (`@nestjs/core`) |
| Wasp | 2020 | 18,700 | — |
| TanStack Router | 2019 | 14,900 | 16.6M (`@tanstack/react-start`) |
| SPFN | 2025 | — | 254 (`@spfn/core`) |

Read that row honestly. If your criterion is "how many people have already hit my problem
and written about it", every other option on this page beats SPFN and it is not close.

## The honest summary

If you are starting from nothing, Wasp and TanStack Start both deserve a serious look,
and Wasp will get you to a login screen faster than anything here. If your backend is
substantial enough to have its own team, NestJS is the mature answer. If Server Actions
cover you, add nothing.

SPFN exists for a narrower case, and only that one: the app already exists, it is a
Next.js app, and what you want is a real backend inside it rather than a second project
beside it. Every other framework on this page asks you to start over to get what it
offers. That is the whole difference, and whether it matters depends entirely on whether
you already have something worth keeping.

- [The SPFN pattern](../docs/pattern.md) — how a feature is built, layer by layer
- [Prototype to production](../docs/prototype-to-production.md) — what changes between the
  two, and what SPFN takes over
