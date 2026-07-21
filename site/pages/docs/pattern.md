---
title: The SPFN Pattern
description: One vertical slice per feature — entity, repository, route, router, generated client.
---

## One slice per feature

Every feature is a vertical slice through the same five layers, each in its
own file. There is exactly one place for everything — which is what makes the
codebase navigable for humans and AI agents alike.

```text
src/server/
  entities/todo.ts        # Drizzle table
  repositories/todo.ts    # extends BaseRepository
  routes/todos.ts         # route.get/post/… with TypeBox validation
  router.ts               # defineRouter — registers route modules
  generated/route-map.ts  # pnpm codegen output — never hand-edited
```

## Entity

The Drizzle table is the single source of truth for the shape of your data.
Migrations are generated from it (`pnpm db:generate`) — never written by hand.

```ts
export const todos = pgTable('todos', {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    title: text('title').notNull(),
    done: boolean('done').notNull().default(false)
});
```

## Repository

A repository extends `BaseRepository` and owns all data access for its
entity. Services and routes never touch the ORM directly.

```ts
export class TodoRepository extends BaseRepository<typeof todos>
{
    constructor()
    {
        super(todos);
    }
}
```

## Route

Routes declare their contract with TypeBox. The schema validates at runtime
and types the generated client at compile time — one declaration, both jobs.

```ts
route.post('/todos', {
    body: Type.Object({
        title: Type.String({ minLength: 1 })
    })
}, async c =>
{
    return repo.save(c.body);
});
```

## Codegen closes the loop

`pnpm spfn codegen` walks the router and emits the route map that powers the
typed client. After any route change:

```bash
pnpm spfn codegen
```

```ts
const api = createApi<AppRouter>();

await api.todos.post({ title: 'ship it' });   // body and response typed
```

Change the route's schema and every consumer fails to compile until it
catches up — the compiler catches what integration tests used to.

## Where to go next

- [Get started](../docs.md) — create a project and run it.
- [Packages](../packages.md) — what ships beyond the core.
- [Runnable examples](https://github.com/spfn/spfn/tree/main/examples) — the
  pattern end to end, from minimal API to auth.
