# {{projectName}}

A full-stack app built with [SPFN](https://github.com/spfn/spfn) — a
[Next.js](https://nextjs.org) frontend with a typed SPFN backend.

## Prerequisites

- Node.js ≥ 18.18
- [Docker](https://www.docker.com/) — runs PostgreSQL & Redis locally
- `{{pm}}` (package manager)

## Getting Started

1. Start PostgreSQL & Redis:

   ```bash
   docker compose up -d
   ```

2. Configure environment variables:

   ```bash
   cp .env.local.example .env.local
   ```

3. Start the dev server (Next.js + SPFN backend together):

   ```bash
   {{pmRun}} spfn:dev
   ```

Your app will be available at:

- **Next.js** — http://localhost:3790
- **SPFN API** — http://localhost:8790

## Project structure

```
src/
├── app/              # Next.js App Router (frontend)
├── server/           # SPFN backend
│   ├── entities/     # Drizzle tables
│   ├── repositories/ # Data access (extends BaseRepository)
│   ├── routes/       # route.get/post/... with TypeBox validation
│   ├── router.ts     # defineRouter — registers routes
│   └── config/       # env.config.ts, server.config.ts
├── generated/        # Generated route map — do not edit by hand
└── lib/              # Shared contracts and the typed API client
```

A feature is built as a vertical slice:
**Entity → Repository → Route → Router → codegen → typed client**.

## Common commands

| Command | Description |
| --- | --- |
| `{{pmRun}} spfn:dev` | Start Next.js + the SPFN backend |
| `{{pmRun}} spfn:build` | Build for production |
| `{{pmRun}} spfn:start` | Run the production build |
| `spfn codegen run` | Regenerate the route map after changing routes |
| `spfn db:generate` | Create a migration from entity changes |
| `spfn env:validate` | Validate environment variables |
| `spfn env:docs` | Generate environment documentation |

> After editing routes or routers, run `spfn codegen run` and commit the
> regenerated `src/generated/`. After changing an entity, run `spfn db:generate`
> to create a migration — don't write SQL by hand.

<!-- {{#auth}} -->
## Authentication

This project includes [`@spfn/auth`](https://github.com/spfn/spfn/tree/main/packages/auth).
Auth routes are mounted under the main router and exposed through the typed
`authApi` client. See the package README for the full flow — signup, login,
OAuth, and RBAC.
<!-- {{/auth}} -->

## Deployment

Build and run the whole stack with Docker:

```bash
docker compose -f docker-compose.production.yml up --build -d
```

The SPFN backend (`src/server`) runs as its own service and is excluded from the
Next.js/Vercel build. If you deploy the frontend to a managed host, deploy the
backend separately.

## Learn more

- [SPFN documentation](https://github.com/spfn/spfn)
- [Next.js documentation](https://nextjs.org/docs)
