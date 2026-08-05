# SPFN Examples

A step-by-step ladder. Each example adds **one concept** on top of the previous one,
so you can read them in order — or `diff` two stages to see exactly what a feature
brings. Every example is a runnable pnpm workspace member that depends on the local
`@spfn/*` packages.

| Stage | Adds | Needs a database? |
| --- | --- | --- |
| [01 · Minimal API](./01-minimal-api) | A route, a router, the typed `createApi` client, and the `/api/rpc` proxy — the core request path | No |
| [02 · Database CRUD](./02-database-crud) | A Drizzle entity, a `BaseRepository`, CRUD routes, and a migration you generate from the entity | Yes (Postgres) |
| [03 · Auth](./03-auth) | `@spfn/auth` — global authentication, public/protected routes, sessions, and RBAC | Yes (Postgres) |

More stages (errors, and feature modules like CMS / monitoring / notifications)
are on the way.

## Not a rung on the ladder

| Example | What it is | Needs a database? |
| --- | --- | --- |
| [04 · Mobile contract dev](./04-mobile-contract-dev) | A standalone Node server (no Next.js) that serves the spfn-mobile `clientProofV1` dev contract, for driving the mobile integration suites | No |

Read it when you are working on the mobile contract — it does not build on 01–03.

## Running any example

From the repo root:

```bash
pnpm install
```

Then follow the `README.md` inside the example you want — each lists its own prerequisites,
environment variables, and run command (`pnpm spfn:dev` for the Next.js examples 01–03,
plain `pnpm dev` for 04).

## How to read them

Start at `01-minimal-api` even if you need a database — it isolates the SPFN request
path (route → router → generated map → typed client) with the least possible noise.
Then move up the ladder; the new files in each stage are the lesson.
