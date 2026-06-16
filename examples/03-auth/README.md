# 03 · Auth

Adds **authentication, sessions, and RBAC** to the [02 · Database CRUD](../02-database-crud)
slice using [`@spfn/auth`](../../packages/auth/README.md). Diff this against `02` to see
exactly what auth wires in — four small edits and one protected route.

## What it shows

- **Global authentication** with public opt-outs: reads (`listExamples`, `getExample`) are
  public via `.skip(['auth'])`; writes and `getMe` require a signed-in user.
- **A protected route** (`src/server/routes/me.ts`) reading the user via `getAuth(c)`.
- **Session-aware UI** (`src/app/page.tsx`) using `getSession()` in a Server Component.
- The full `authApi` surface (register / login / session / logout / …) mounted at `/_auth/*`.

## The four wiring points

| File | Wiring |
| --- | --- |
| `src/server/server.config.ts` | `.lifecycle(createAuthLifecycle())` — validates env, seeds admins, inits RBAC |
| `src/server/router.ts` | `.packages([authRouter])` + `.use([authenticate])` — mounts auth routes, applies global auth |
| `src/app/api/rpc/[routeName]/route.ts` | `import '@spfn/auth/nextjs/api'` (interceptor) + merge `authRouteMap` |
| migrations | `pnpm spfn db migrate` — creates the auth tables (users, keys, roles, …) |

Auth uses **asymmetric, client-signed JWTs**: the client holds the private key (in an
encrypted session cookie), signs each request, and the server verifies with the stored
public key. The server never holds a private key.

## Getting started

> Prerequisites: Node ≥ 18.18, pnpm, Docker (Postgres).

From the repo root, `pnpm install`. Then in this directory:

```bash
# 1. Start Postgres
docker compose up -d

# 2. Configure environment — secrets are split across two files by audience
cp .env.local.example .env.local      # SPFN_AUTH_SESSION_SECRET lives here (Next.js)
cp .env.server.example .env.server    # SPFN_AUTH_VERIFICATION_TOKEN_SECRET lives here (server)

# 3. Generate the client route map + run migrations
pnpm codegen
pnpm spfn db migrate

# 4. Run the API server + Next.js
pnpm spfn:dev
```

Open the app: the examples list (public) renders immediately and the session banner shows
you're signed out. Register and log in through the client:

```typescript
import { authApi } from '@spfn/auth';

await authApi.register.call({ body: { email: 'me@example.com', password: 'secret123' /* + client public key */ } });
await authApi.login.call({ body: { email: 'me@example.com', password: 'secret123' } });
// now api.getMe.call({}) and POST /examples succeed
```

See [`packages/auth/README.md`](../../packages/auth/README.md) for the full register/login
key-exchange flow, OAuth, and RBAC.

### Environment variables

Auth secrets are split by audience (see `packages/auth/README.md`):

- `.env.local` — `SPFN_AUTH_SESSION_SECRET` (≥32 chars, validated), `DATABASE_URL`, `SPFN_API_URL`
- `.env.server` — `SPFN_AUTH_VERIFICATION_TOKEN_SECRET`, `DATABASE_URL`, optional admin/OAuth

## Public vs protected

```typescript
// Public read — opt out of the global authenticate middleware
route.get('/examples').input({ ... }).skip(['auth']).handler(...)

// Protected — global authenticate gates it; read the user from context
route.get('/me').handler(async (c) => { const { user } = getAuth(c); /* ... */ });
```

## Next step

This is the top of the current ladder. For OAuth, RBAC roles/permissions, invitations, and
events, read [`packages/auth/README.md`](../../packages/auth/README.md).
