# {{projectName}}

A full-stack app built with [SPFN](https://github.com/spfn/spfn) — a typed SPFN
backend running alongside Next.js.

## Getting started

```bash
# 1. Start PostgreSQL + Redis
docker compose up -d

# 2. The env files are generated for you:
#    .env.local  — Next.js-facing values (gitignored)
#    .env.server — server secrets: DB, cache (gitignored, never loaded by Next.js)
#    Review them and adjust as needed.

# 3. Start the dev server (Next.js :3790 + SPFN API :8790)
{{pmRun}} spfn:dev
```

Then open:

- Next.js — http://localhost:3790
- API health — http://localhost:8790/health

## Project structure

```
src/
  app/                 Next.js App Router
  server/              SPFN backend (entities, repositories, routes, router)
  generated/           codegen output (route map) — do not edit by hand
.env.local             Next.js-facing env (gitignored)
.env.server            server secrets (gitignored)
.env.example           committed reference — keys only, placeholder values
.spfnrc.ts             codegen configuration
spfn.config.js         deployment config
```

A feature is a vertical slice: `Entity` (Drizzle table) → `Repository` →
`Route` (TypeBox validation) → `Router` → `{{pmRun}} codegen` → typed client.

## Common commands

```bash
{{pmRun}} spfn:dev          # dev: Next.js + SPFN API (add --watch to restart on changes)
{{pmRun}} spfn:build        # production build
{{pmRun}} spfn:start        # run the production build
{{pm}} spfn db generate     # create a migration from schema changes
{{pm}} spfn db migrate      # apply pending migrations
{{pm}} spfn env check       # check .env files against the schema
{{pm}} spfn secret set DB_URL   # store a secret (keychain locally, SOPS for deploys)
```

## Environment & secrets

`.env.server` holds server-only secrets and is gitignored — Next.js never loads it.
For a managed workflow use `spfn secret`: local values go to the OS keychain (only a
`secret:keychain:` reference lands in `.env.server`), and deployed secrets are stored
in encrypted SOPS files. See the [SPFN CLI docs](https://github.com/spfn/spfn).

<!-- {{#auth}} -->
## Authentication

This project includes `@spfn/auth`. Configure providers and session settings in your
server setup, and read `@spfn/auth`'s README for the full Entity → Repository →
Service → Route flow and the typed `authApi` client.
<!-- {{/auth}} -->

## Deployment

```bash
# Build + run locally
{{pmRun}} spfn:build && {{pmRun}} spfn:start

# Or with Docker
docker compose -f docker-compose.production.yml up --build -d
```

Never commit real secrets. `.env.server` is gitignored; inject secrets in your
CI/CD pipeline or via `spfn secret` + your GitOps decryption step.
