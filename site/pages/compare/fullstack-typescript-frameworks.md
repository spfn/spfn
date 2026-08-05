---
title: "Full-stack TypeScript frameworks in 2026: typed APIs and built-in auth compared"
description: Next.js, Wasp, TanStack Start, NestJS and SPFN compared for someone who wants end-to-end typed APIs and real user accounts without learning a new language.
order: 1
---

## Who this is for

You have a Next.js app. It works. Now it needs the things a prototype does not have —
real user accounts, a typed boundary between client and server, and a way to operate
the thing once people are using it.

The question at that point is not "which framework should I have started with". It is
"what do I add, and how much of what I already know stays useful".

This page compares five answers. **SPFN is ours** — we built it, and we say so here
rather than letting you find out later. The rest of the page is written so that you
can tell when one of the other four is the better call, because most of the time one
of them is.

## Short answer

| If this describes you | Choose |
|---|---|
| Server Actions already cover your backend | Next.js on its own |
| Starting from nothing and want auth scaffolded for you | Wasp |
| Starting from nothing and want the newest type-safe React stack | TanStack Start |
| Backend logic is the product, and a team maintains it | NestJS |
| You already have a Next.js app and don't want a new language | SPFN |

## Next.js on its own

Next.js is a full-stack framework, and for a large class of apps it is the whole answer.
Route handlers and Server Actions give you a server, and if your data access is simple
enough, adding anything else is overhead you will regret.

What it does not give you: end-to-end types across a client/server boundary (Server
Actions type the call, not a general API surface), and authentication. Both are
assembled from other pieces — commonly tRPC for the first and Auth.js, Better Auth or
Clerk for the second.

**Choose it alone** when your backend fits inside Server Actions and you would rather
own the auth choice yourself.

## Wasp

Wasp is the batteries-included option, and it is honest about being that. You declare
your app — routes, entities, authentication — in a `main.wasp` file, and Wasp generates
the client, the server and the auth flows around it. Auth is genuinely built in:
configure a provider in the config file and the UI and session handling come with it.
It builds on Prisma for data.

The cost is the thing you declare it in. `main.wasp` is a specification language
particular to Wasp, and everything the framework does well flows through it.

**Choose it** when you are starting from nothing and want the shortest distance to a
working signup screen.

**One caveat worth weighing if you build with an AI coding agent.** Wasp names
AI-assisted development as a reason to pick it. But an agent writes TypeScript from an
enormous body of training material and writes `main.wasp` from very little. Whatever
your agent's fluency in the language your app is described in, that is the ceiling on
how much of the work it can carry. This is easy to test before committing: ask your
agent to write the same feature both ways and compare what comes back.

## TanStack Start

TanStack Start is built around type safety end to end — typed routing, typed server
functions, SSR and streaming. If you like the TanStack Router and Query model, this is
the most coherent expression of it.

Authentication is not built in. The documentation points at Better Auth, Clerk, Auth.js
and WorkOS as integrations.

**Choose it** when you are starting fresh, want the strongest typed-routing story
available, and are content to pick your own auth.

## NestJS

NestJS is a backend framework, not a full-stack one. Modules, dependency injection,
guards, interceptors, first-class GraphQL and microservice support — it is the option
that assumes your backend has real domain logic and a team maintaining it. Auth is a
mature ecosystem (Passport, JWT, RBAC guards) rather than a single switch.

You pair it with a separate frontend, which means two applications, two deployments and
a boundary you type by hand or with code generation.

**Choose it** when the backend is the product.

## SPFN

SPFN adds a typed backend to a Next.js app you already have, in plain TypeScript, and
tries to leave everything else alone.

There is no new language. A route is a TypeScript file:

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

There is no separate repository and no monorepo layout. The backend lives beside the
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

Three things follow from that, and each is checkable in
[examples/01-minimal-api](https://github.com/fxylabs/spfn/tree/main/examples/01-minimal-api):

- `next` and `@spfn/core` are ordinary siblings in one `package.json`.
- `next.config.ts` is empty. There is no plugin and no wrapper around your app.
- `next dev`, `next build` and `next start` still mean what they meant before.

Authentication ships as a first-party package,
[@spfn/auth](../docs/packages/auth.md) — accounts, sessions, OAuth providers and
role-based access — so it is maintained with the framework rather than adapted to it.
Operations are answered by [@spfn/mcp](../docs/packages/mcp.md), which exposes your
app to an AI agent over the Model Context Protocol instead of asking you to build an
admin dashboard.

**Choose it** when you already have a Next.js app, want a real typed backend inside it,
and do not want to learn a language to get one.

### What SPFN costs you

Three honest ones.

- **A code generation step.** Changing routes means running `pnpm codegen` to
  regenerate the route map. tRPC has no build step; SPFN does.
- **Two processes at runtime.** Next.js and the SPFN API server run separately, with
  the `/api/rpc` handler forwarding between them. One codebase, two processes.
- **Beta.** The `@spfn/*` packages are `0.x` pre-releases. If you need a stable major
  version number before you adopt something, this is not that yet.

## Where each one wins

| | Next.js alone | Wasp | TanStack Start | NestJS | SPFN |
|---|---|---|---|---|---|
| New language to learn | no | `main.wasp` | no | no | no |
| Attaches to an existing Next.js app | — | no | no | as a separate service | yes |
| Auth from the framework's own authors | no | yes | no | ecosystem | yes |
| End-to-end typed API | with tRPC | yes | yes | hand-typed | yes |
| Build step for types | no | compile | no | optional codegen | codegen |
| Best when | backend is small | starting fresh | starting fresh | backend is the product | app already exists |

## The honest summary

If you are starting from nothing, Wasp and TanStack Start both deserve a serious look,
and Wasp will get you to a login screen faster than anything here. If your backend is
substantial enough to have its own team, NestJS is the mature answer. If Server Actions
cover you, add nothing.

SPFN exists for a narrower case: the app already exists, it is a Next.js app, and the
thing you want is a real backend inside it rather than a second project beside it. If
you can write Next.js, there is nothing further to learn before you can write the
backend too.

- [The SPFN pattern](../docs/pattern.md) — how a feature is built, layer by layer
- [Prototype to production](../docs/prototype-to-production.md) — what changes between
  the two, and what SPFN takes over
