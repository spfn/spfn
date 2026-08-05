---
title: "Adding a capability to a backend: NestJS modules, tRPC routers, SPFN packages"
description: Every backend framework has a unit of composition. This compares what each one actually brings with it — routes, client types, tables, migrations, jobs — and what stays your job.
order: 3
---

## A different question from "which framework"

[The framework comparison](./fullstack-typescript-frameworks.md) answers what to start
with. This page assumes you have started and asks the question that follows:

**when you add a capability to the backend, what arrives with it, and what stays your
job?**

Every framework has a unit of composition — a module, a router, a plugin. They are not
the same size, and the difference only shows up months later, when the fifth one goes in.

**SPFN is ours.** `@spfn/core` defines the unit compared last here. NestJS and tRPC are
described from their own documentation.

## What a capability actually needs

Take authentication as the example, because everybody adds it. To be finished, it needs:

1. **Routes** on the server.
2. **Types on the client** that match those routes.
3. **Tables** in the database.
4. **Migrations** that create and evolve those tables.
5. **Background work** — expiring sessions, purging deleted accounts.
6. **Startup work** — validating configuration, seeding an admin, initialising roles.

A unit of composition that covers one and two, and hands you three through six, is doing
less than it looks like it is doing.

## NestJS modules

The mature answer, and the one worth measuring against.

A module is a class annotated with `@Module()`, and the decorator takes four properties:
`providers`, `controllers`, `imports` and `exports`. Providers are encapsulated by
default — you can only inject what the module declares or what an imported module
explicitly exports, which makes `exports` the module's public interface. Reuse is one
line: `imports: [AuthModule]`.

As a boundary this is excellent, and it is stricter than what SPFN offers. What it does
not carry is everything below the server.

**The database is outside it.** Nest is database agnostic by design, integrating with
TypeORM, Sequelize, Mongoose, Prisma and others. That is a real strength — you pick.

**Migrations are outside it too, explicitly.** The documentation states that "Migration
classes are separate from the Nest application source code", with their lifecycle owned by
the ORM's CLI, and notes that dependency injection and other Nest features are therefore
unavailable inside them. So a module cannot bring its own schema. Whoever installs it
writes the migration.

**Background work is a package plus infrastructure.** `@nestjs/bullmq` and `@nestjs/bull`
wrap BullMQ and Bull, and both persist job data in Redis — the documentation says you will
need Redis installed. So a capability that needs a scheduled sweep also needs a broker you
now operate.

## tRPC routers

tRPC composes routers and produces an end-to-end typed client from the server's types,
with no code generation step. On items one and two it is excellent and it is why so many
stacks include it.

It is an API layer, and it does not claim otherwise. Tables, migrations, jobs and startup
work are not in scope.

## Next.js on its own

Route handlers and Server Actions, with no unit of composition at all. Each capability
integrates its own way, and the convention is whatever your team last agreed. For a small
app this is the right amount of structure. The cost arrives with the fifth capability,
when there are five conventions.

## SPFN packages

`@spfn/core` defines a package as a slice that carries all six items, and mounting it is
three calls at most:

```ts
export default defineServerConfig()
    .routes(appRouter)                          // your own routes
    .lifecycle(createAuthLifecycle())           // 6 — startup work
    .jobs(authJobRouter)                        // 5 — background work
    .build();

export const appRouter = defineRouter({ /* ... */ })
    .packages([authRouter])                     // 1 and 2 — routes and client types
    .use([authenticate]);
```

Items three and four ride along: six of the published packages carry their own migration
files, so adopting a capability does not mean writing schema for it. The typed client
comes from the router's type, so item two is not a separate artifact to maintain.

Background work runs on pg-boss over the PostgreSQL the app already has — cron schedules,
run-once jobs, event-driven triggers and batches — so a capability that needs a nightly
sweep does not also need a broker. pg-boss is a peer dependency you install.

## Side by side

| | Next.js alone | tRPC router | NestJS module | SPFN package |
|---|---|---|---|---|
| Server routes | you | yes | yes | yes |
| Client types | you | yes | you | yes |
| Database tables | you | you | you | yes |
| Migrations | you | you | outside the module, by design | ships with the package |
| Background work | you | you | `@nestjs/bullmq` + Redis | `.jobs()` on PostgreSQL |
| Startup work | you | you | lifecycle hooks | `.lifecycle()` |
| Encapsulation boundary | none | router namespace | providers, strict | router surface |
| Database choice | yours | yours | any | PostgreSQL + Drizzle |
| Composes outside its framework | — | anywhere | Nest apps | SPFN apps |

## Where NestJS wins

Plainly, because these are not small.

- **Encapsulation is stricter.** A dependency injection container with explicit exports is
  a stronger boundary than a mounted router, and it scales to a team better.
- **Database agnostic.** SPFN is PostgreSQL and Drizzle, and that is not a preference you
  can override.
- **Guards, interceptors, pipes, microservices, GraphQL.** SPFN has no equivalent to most
  of that.
- **The module ecosystem is vastly larger**, which is usually the whole argument.
- If the backend is the product and a team maintains it, NestJS is the right answer and
  this page does not dispute it.

## The summary

The interesting column is migrations. Every option here except SPFN leaves the schema to
whoever installs the capability — NestJS says so in its own documentation, as a
consequence of being database agnostic, which is a reasonable trade rather than an
oversight.

SPFN made the opposite trade: it fixed the database, and in exchange a capability can
carry its own tables. That is the whole argument, and it is only worth anything if
PostgreSQL was always going to be the answer for you.

- [Full-stack TypeScript frameworks compared](./fullstack-typescript-frameworks.md)
- [Next.js authentication after sign-in](./nextjs-auth-after-sign-in.md)
- [@spfn/core documentation](../docs/packages/core.md)
