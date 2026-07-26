# {{projectName}}

A full-stack app built with [SPFN](https://github.com/spfn/spfn) — a consistent
architecture for taking an AI-built prototype to production. Scaffold mode: `{{mode}}`.

## Getting started

```bash
# 1. Start PostgreSQL + Redis
docker compose up -d

# 2. The env files are generated for you:
#    .env.local  — values loaded by Next.js, including auth session crypto (gitignored)
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
.env.local             Next.js runtime env (gitignored)
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
{{pmExec}} spfn db generate     # create a migration from schema changes
{{pmExec}} spfn db migrate      # apply pending migrations
{{pmExec}} spfn env check       # check .env files against the schema
{{pmExec}} spfn secret set DB_URL   # store a secret (keychain locally, SOPS for deploys)
```

## Environment & secrets

`.env.server` holds backend-only secrets and is gitignored — Next.js never loads it.
For a managed workflow use `spfn secret`: local values go to the OS keychain (only a
`secret:keychain:` reference lands in `.env.server`), and deployed secrets are stored
in encrypted SOPS files. See the [SPFN CLI docs](https://github.com/spfn/spfn).

<!-- {{#auth}} -->
## Authentication

This project includes `@spfn/auth`. Configure providers and session settings in your
generated env files, then run `{{pmExec}} spfn db migrate`. The lifecycle, router,
Next.js interceptor, `/login` starter UI, OAuth callback, and route map are already wired.

## Internationalization

Edit `src/i18n/catalogs.ts` to add application-owned messages. Server components
and handlers can import `getT` or `getClientMessages` from `@/i18n/server`.

## Agent operations with MCP

The SPFN API serves MCP at `http://localhost:8790/mcp`. Connect with the Bearer
token stored as `SPFN_MCP_API_KEY` in `.env.server`, then replace the starter
`app_status` tool in `src/server/mcp.ts` with operations from your domain layer.
Before third-party access, replace the generated operator-key validator with your
OAuth access-token validator and scope each tool to the resolved operator.
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
