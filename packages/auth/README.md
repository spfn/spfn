# @spfn/auth — Authentication, OAuth, and RBAC for SPFN

Asymmetric client-signed JWT auth (ES256/RS256), OTP verification, OAuth 2.0 (pluggable
provider registry, Google built-in), session cookies for Next.js, and runtime RBAC.
Routes are exposed under the `/_auth/*` namespace and reached through a type-safe `authApi`
client. Requires `@spfn/core`; Next.js is an optional peer (`^15 || ^16`).

## Install

```bash
pnpm add @spfn/auth
```

## Import paths

Five entry points (from `package.json` `exports`). Picking the wrong one breaks the build —
`/server` and `/nextjs/*` pull in Node/`server-only` code and must never reach the browser bundle.

```typescript
import { authApi, authRouteMap }      from '@spfn/auth';          // isomorphic: client + route map + types/constants
import { authRouter, authenticate }   from '@spfn/auth/server';   // SERVER ONLY: router, services, repos, middleware, helpers
import { /* hooks/components */ }      from '@spfn/auth/client';   // browser only (currently empty — WIP)
import { env, envSchema }             from '@spfn/auth/config';    // validated env proxy + schema
import { InvalidCredentialsError }    from '@spfn/auth/errors';    // error classes + authErrorRegistry
import '@spfn/auth/nextjs/api';                                    // SERVER: auto-registers RPC interceptors (side-effect)
import { RequireAuth, getSession }    from '@spfn/auth/nextjs/server'; // SERVER: RSC guards, session helpers, OAuth handler
import { OAuthCallback }              from '@spfn/auth/nextjs/client';  // 'use client' OAuth callback component
```

> Database entities (`users`, `userPublicKeys`, …) and all services/repositories are exported
> from `@spfn/auth/server`, **not** from the root `@spfn/auth`.

## Setup (4 wiring points)

Auth needs four edits in the consuming app. All four are required for the flow to work end to end.

### 1. Lifecycle — `server.config.ts`

`createAuthLifecycle()` validates env before DB connect, then seeds admin accounts and
initializes RBAC after the DB is ready. Pass custom roles/permissions here (see RBAC below).

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { createAuthLifecycle } from '@spfn/auth/server';
import { appRouter } from './router';

export default defineServerConfig()
    .port(8790)
    .routes(appRouter)
    .lifecycle(createAuthLifecycle())
    .build();
```

### 2. Router + global middleware — `router.ts`

`authRouter` (the package's `mainAuthRouter`) is merged via `.packages()`; `authenticate` is
applied globally via `.use()`. Public routes opt out per-route with `.skip(['auth'])`.

```typescript
import { defineRouter } from '@spfn/core/route';
import { authRouter, authenticate } from '@spfn/auth/server';
import { getHealth } from './routes/health';

export const appRouter = defineRouter({
    getHealth,
    // ...your routes
})
    .packages([authRouter])   // mounts /_auth/* and exposes routes on authApi
    .use([authenticate]);     // global auth middleware

export type AppRouter = typeof appRouter;
```

### 3. Next.js interceptor — RPC proxy route

The interceptor handles session cookies, JWT signing, and key management automatically.
Import it for its side-effect (it self-registers); it must run before the proxy is created.

```typescript
// app/api/rpc/[routeName]/route.ts
import '@spfn/auth/nextjs/api';        // side-effect: registers auth interceptors
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { authRouteMap } from '@spfn/auth';
import { routeMap } from '@/generated/route-map';

export const { GET, POST } = createRpcProxy({ routeMap: { ...routeMap, ...authRouteMap } });
```

### 4. Run migrations

```bash
pnpm spfn db generate   # only if entities changed
pnpm spfn db migrate
```

The API client needs no auth-specific config. `authApi` is also available standalone:

```typescript
import { authApi } from '@spfn/auth';
const session = await authApi.getAuthSession.call({});   // → GET /_auth/session
```

## Environment variables

Set across **two files** by audience. Server-only secrets go in `.env.server`; values the
Next.js runtime needs (session cookie crypto) go in `.env.local`. Names only below — supply
real secret values out of band, never commit them.

| Var | File | Required | Notes |
|-----|------|----------|-------|
| `DATABASE_URL` | both | yes | Postgres connection |
| `SPFN_AUTH_VERIFICATION_TOKEN_SECRET` | `.env.server` | yes | OTP / verification token signing |
| `SPFN_AUTH_SESSION_SECRET` | `.env.local` | yes | ≥32 chars, AES-256 session cookie encryption (validated: entropy/unique-char checks) |
| `SPFN_API_URL` | `.env.local` | — | default `http://localhost:8790` |
| `SPFN_AUTH_SESSION_TTL` | both | — | default `7d` (e.g. `7d`, `12h`, `45m`) |
| `SPFN_AUTH_JWT_SECRET` / `SPFN_AUTH_JWT_EXPIRES_IN` | `.env.server` | — | legacy server-signed JWT mode only |
| `SPFN_AUTH_BCRYPT_SALT_ROUNDS` | `.env.server` | — | default `12` (native bcrypt, off the event loop) |
| `SPFN_AUTH_COOKIE_SECURE` | both | — | override Secure flag (defaults to `NODE_ENV==='production'`) |
| `SPFN_AUTH_ADMIN_*` | `.env.server` | — | admin seeding (see below) |
| `SPFN_AUTH_GOOGLE_CLIENT_ID` / `_CLIENT_SECRET` | `.env.server` | — | enables Google OAuth when both set |
| `SPFN_AUTH_GOOGLE_SCOPES` | `.env.server` | — | comma-separated; default `email,profile` |
| `SPFN_AUTH_GOOGLE_REDIRECT_URI` | `.env.server` | — | default `{NEXT_PUBLIC_SPFN_APP_URL\|\|SPFN_APP_URL}/_auth/oauth/google/callback` — see [OAuth callback origin](#oauth-callback-origin-web-app-host--rewrite) |
| `SPFN_AUTH_GOOGLE_NATIVE_CLIENT_IDS` | `.env.server` | — | comma-separated client IDs accepted as native id_token audience (iOS/Android/web); enables Google native sign-in |
| `SPFN_AUTH_APPLE_CLIENT_IDS` | `.env.server` | — | comma-separated Apple client IDs (bundle ID / Services ID); enables Apple native sign-in |
| `SPFN_AUTH_OAUTH_SUCCESS_URL` | `.env.server` | — | default `/auth/callback` |
| `SPFN_AUTH_OAUTH_ERROR_URL` | `.env.server` | — | default `/auth/error?error={error}` |
| `SPFN_AUTH_RESERVED_USERNAMES` / `_USERNAME_MIN_LENGTH` / `_USERNAME_MAX_LENGTH` | `.env.server` | — | username rules |
| `NEXT_PUBLIC_SPFN_API_URL` / `NEXT_PUBLIC_SPFN_APP_URL` | `.env.local` | — | browser-facing URLs for OAuth redirects |

Read validated values via `import { env } from '@spfn/auth/config'` (a proxy validated at
startup). `envSchema` carries descriptions/defaults.

### Admin seeding

`createAuthLifecycle()` creates admin accounts on startup from env, in priority order. Seeded
accounts are auto email-verified, `status: 'active'`, `passwordChangeRequired: true`.

- **JSON (recommended):** `SPFN_AUTH_ADMIN_ACCOUNTS` — array of `{email, password, role?, phone?, passwordChangeRequired?}`. `role` defaults to `user` (`user` | `admin` | `superadmin`).
- **CSV:** `SPFN_AUTH_ADMIN_EMAILS` + `SPFN_AUTH_ADMIN_PASSWORDS` + `SPFN_AUTH_ADMIN_ROLES`.
- **Single (legacy):** `SPFN_AUTH_ADMIN_EMAIL` + `SPFN_AUTH_ADMIN_PASSWORD` → always `superadmin`.

## Routes

All routes mount at `/_auth/*` and are reached through `authApi.<name>.call({ body })`. Public
routes use `.skip(['auth'])`; the rest require `Authorization: Bearer <client-signed-jwt>`.

| `authApi` method | HTTP | Auth | Purpose |
|------------------|------|------|---------|
| `checkAccountExists` | POST `/_auth/exists` | public | email/phone existence check |
| `sendVerificationCode` | POST `/_auth/codes` | public | send 6-digit OTP |
| `verifyCode` | POST `/_auth/codes/verify` | public | verify OTP → verification token |
| `register` | POST `/_auth/register` | public | create user + register public key |
| `login` | POST `/_auth/login` | public | password login + new session key |
| `logout` | POST `/_auth/logout` | yes | revoke current key |
| `rotateKey` | POST `/_auth/keys/rotate` | yes | rotate public key before 90-day expiry |
| `changePassword` | PUT `/_auth/password` | yes | change password |
| `getAuthSession` | GET `/_auth/session` | yes | current session/user |
| `issueOneTimeToken` | POST | yes | short-lived token (e.g. SSE handshake) |
| `checkUsername` / `updateUsername` / `updateLocale` | — | mixed | username availability/update, locale |
| `getUserProfile` / `updateUserProfile` | — | yes | profile read/update |
| `createInvitation` / `acceptInvitation` / `listInvitations` / `cancelInvitation` / `resendInvitation` / `deleteInvitation` / `getInvitation` | — | mixed | invitation flow |
| `requestAccountDeletion` | POST `/_auth/deletion/request` | yes | request account deletion (re-auth gated) — see [Account Deletion & Recovery](#account-deletion--recovery) |
| `cancelAccountDeletion` | POST `/_auth/deletion/cancel` | public | cancel a pending deletion (credential-based recovery) |
| `listRoles` / `createAdminRole` / `updateAdminRole` / `deleteAdminRole` / `updateUserRole` | — | superadmin | admin RBAC management |
| OAuth routes | — | — | see OAuth section |

Auth uses **asymmetric, client-signed JWTs**: the client generates an ES256/RS256 keypair,
sends the public key on register/login, signs request JWTs locally, and the server verifies
with the stored public key (`keyId` carried in the JWT). The server never holds a private key.
Keys expire after 90 days — rotate with `rotateKey`.

### Writing protected routes (route DSL)

This is the current SPFN route DSL — `route.<method>().input().use().skip().handler()` registered
via `defineRouter`. Access auth state through the context helpers, not by reading raw context.

```typescript
import { route } from '@spfn/core/route';
import { authenticate, requirePermissions, optionalAuth } from '@spfn/auth/server';
import { getAuth, getOptionalAuth } from '@spfn/auth/server';

// Protected (global `authenticate` already applies; helpers read the context)
export const getMe = route.get('/me')
    .handler(async (c) =>
    {
        const { user, userId, role, locale } = getAuth(c);
        return { id: userId, email: user.email, role };
    });

// Permission-gated (all required); use requireAnyPermission for OR, requireRole for roles
export const deleteUser = route.delete('/users/:id')
    .use([authenticate, requirePermissions('user:delete')])
    .handler(async (c) => { /* ... */ });

// Public + optional user context. optionalAuth auto-skips global 'auth' — no .skip needed
export const getProducts = route.get('/products')
    .use([optionalAuth])
    .handler(async (c) =>
    {
        const auth = getOptionalAuth(c);   // AuthContext | undefined
        return auth ? personalized(auth.userId) : publicList();
    });
```

Context helpers from `@spfn/auth/server`: `getAuth`, `getOptionalAuth`, `getUser`, `getUserId`,
`getRole`, `getLocale`, `getKeyId`. Middleware: `authenticate`, `optionalAuth`,
`requirePermissions`, `requireAnyPermission`, `requireRole`, `roleGuard`, `oneTimeTokenAuth`.

## OAuth

OAuth uses a **pluggable provider registry** — not hardcoded branches. The built-in `google`
provider self-registers on module load. External packages add providers at runtime with
`registerOAuthProvider()`. Google OAuth turns on automatically once both
`SPFN_AUTH_GOOGLE_CLIENT_ID` and `SPFN_AUTH_GOOGLE_CLIENT_SECRET` are set.

Client flow: call `authApi.getGoogleOAuthUrl.call({ body: { returnUrl } })`, redirect the browser
to the returned `authUrl`, and render `OAuthCallback` on your success page. The Next.js interceptor
manages the keypair → pending-session-cookie → full-session handoff transparently.

```tsx
// app/auth/callback/page.tsx
export { OAuthCallback as default } from '@spfn/auth/nextjs/client';
```

```typescript
import { authApi } from '@spfn/auth';
const { authUrl } = await authApi.getGoogleOAuthUrl.call({ body: { returnUrl: '/dashboard' } });
window.location.href = authUrl;
```

Built-in OAuth routes: `POST /_auth/oauth/google/url`, `GET /_auth/oauth/google` (redirect),
`GET /_auth/oauth/google/callback`, `POST /_auth/oauth/finalize`, `GET /_auth/oauth/providers`,
plus the provider-generic `POST /_auth/oauth/start`. `getGoogleAccessToken(userId)` returns a
valid Google access token (auto-refreshing via stored refresh token when near expiry; throws if
no Google account is linked or no refresh token is available).

### OAuth callback origin (web app host + rewrite)

The callback's CSRF check is a double-submit: the Next.js interceptor sets an `oauth_csrf`
cookie on the **web app host**, and the callback compares it against the nonce sealed in the
state. Host-only cookies never reach a different host, so **the provider callback must return
to the web app origin** — the redirect URI default is
`{NEXT_PUBLIC_SPFN_APP_URL || SPFN_APP_URL}/_auth/oauth/google/callback`.

The app forwards `/_auth/*` to the API with a standard rewrite (**required** — without it the
callback 404s on the web host, including in local dev):

```javascript
// next.config.js
const nextConfig = {
    async rewrites()
    {
        return [
            {
                source: '/_auth/:path*',
                destination: `${process.env.SPFN_API_URL}/_auth/:path*`,
            },
        ];
    },
};
```

Register the **web app host** callback URL in the provider console (e.g.
`https://app.example.com/_auth/oauth/google/callback` for Google).

The cookie name also carries a `_${PORT}` suffix from the process that set it (the Next.js
process), which differs from the API process in a split deployment — the callback therefore
matches every `spfn_oauth_csrf*` cookie candidate against the state nonce, so no PORT
coordination is needed.

One caveat: the direct `POST /_auth/oauth/start` flow (no Next.js interceptor) sets its CSRF
cookie on the **API host**. If you use that flow in a split deployment, set
`SPFN_AUTH_GOOGLE_REDIRECT_URI` explicitly to the API host callback instead.

### Native social sign-in (mobile / web id_token)

For native apps — and for Apple on Android/web, which has no native SDK — the client obtains an
`id_token` from the platform SDK and posts it to **`POST /_auth/oauth/:provider/native`**. No
authorization code, no client secret: the server verifies the id_token against the provider's
JWKS (signature, issuer, audience, expiry, nonce), links/creates the user, and **registers the
client's public key**. It returns `{ userId, keyId, isNewUser }` — *not* a token. The client mints
its own Bearer client token by signing with the on-device private key (the same client-signs /
server-verifies model as the rest of auth).

Enable per provider by declaring the accepted audiences: `SPFN_AUTH_GOOGLE_NATIVE_CLIENT_IDS` for
Google (the web `SPFN_AUTH_GOOGLE_CLIENT_ID` is also accepted) and `SPFN_AUTH_APPLE_CLIENT_IDS` for
Apple. Apple is native-only here — its web OAuth (code-exchange) methods throw.

```typescript
await authApi.oauthNative.call({
    params: { provider: 'apple' },                 // or 'google'
    body: { idToken, nonce, publicKey, keyId, fingerprint, algorithm: 'ES256', profile: { name } },
});
// → { userId, keyId, isNewUser }; client then signs its own ES256 Bearer token with keyId
```

The `nonce` is the **raw** nonce the client used; Apple hashes it (SHA-256) into the token, so send
the raw value for either provider. `profile.name` captures the name Apple returns only on first
sign-in. Trade-off: skipping code exchange means no Apple refresh token / server-side revoke —
revoke SPFN access by revoking the registered key instead.

### Custom providers

Implement `OAuthProvider` and register it. `SOCIAL_PROVIDERS` is `['google','apple','github','kakao','naver','superself']`. Implement the optional `verifyNativeIdToken(idToken, { nonce })` to support native id_token sign-in.

```typescript
import {
    registerOAuthProvider, getOAuthProvider, getRegisteredProviders,
    oauthCallbackService,
    type OAuthProvider, type NormalizedIdentity, type OAuthTokens,
} from '@spfn/auth/server';

registerOAuthProvider(myProvider);   // same id re-registers (override)
```

**Integration contract for custom providers:**

- The package only ships google's callback route. A custom provider must expose its **own**
  callback route that calls `oauthCallbackService({ provider, code, state })`.
- **Wrap that callback route in `Transactional()`** (`import { Transactional } from '@spfn/core/db'`).
  `oauthCallbackService` creates/links a user and stores the social account in sequence — without
  a transaction, a mid-flow failure leaves an orphan user. The built-in google callback uses it.
- The provider `id` must be in `SOCIAL_PROVIDERS` (`enumText`, plain text — adding a value needs **no**
  DB migration).
- `auth.login` / `auth.register` events now carry any `SOCIAL_PROVIDERS` value in `provider` —
  update any `switch(provider)` in subscribers.

## Sessions (Next.js)

Sessions are HttpOnly cookies encrypted with `SPFN_AUTH_SESSION_SECRET` (JWE), holding the
client private key + `keyId` (`SessionData`: `{ userId, privateKey, keyId, algorithm }`). The
interceptor reads them to sign outbound RPC JWTs. From `@spfn/auth/nextjs/server`:

```typescript
import { saveSession, getSession, clearSession } from '@spfn/auth/nextjs/server';

await saveSession({ userId: '123', privateKey: '...', keyId: 'uuid', algorithm: 'ES256' });
const session = await getSession();   // read-only, safe in Server Components
await clearSession();
```

RSC guards (redirect when unmet) — `RequireAuth`, `RequireRole`, `RequirePermission`:

```tsx
import { RequireAuth, RequireRole } from '@spfn/auth/nextjs/server';

export default async function AdminPage()
{
    return (
        <RequireAuth redirectTo="/login">
            <RequireRole roles={['admin', 'superadmin']} redirectTo="/forbidden">
                <Dashboard />
            </RequireRole>
        </RequireAuth>
    );
}
```

Also exported: `getAuthSessionData`, `getUserRole`, `getUserPermissions`, `hasAnyRole`,
`hasAnyPermission`, the OAuth pending-session helpers, and `createOAuthCallbackHandler`.

## RBAC

Built-in roles: `superadmin` (priority 100), `admin` (80), `user` (10). Built-in permissions:
`auth:self:manage`, `user:read|write|delete|invite`, `rbac:role:manage`, `rbac:permission:manage`.
Custom roles/permissions are declared on the lifecycle (preferred — runs on startup) or via
`initializeAuth(options)`.

```typescript
createAuthLifecycle({
    roles: [{ name: 'editor', displayName: 'Editor', priority: 30 }],
    permissions: [{ name: 'post:publish', displayName: 'Publish Posts', category: 'content' }],
    rolePermissions: { editor: ['post:publish'] },
});
```

Programmatic checks (server): `hasPermission`, `hasAnyPermission`, `hasAllPermissions`, `hasRole`,
`hasAnyRole`, `getUserRole`, `getUserPermissions`. Runtime role admin: `createRole`, `updateRole`,
`deleteRole`, `setRolePermissions`, `addPermissionToRole`, `removePermissionFromRole`,
`getAllRoles`, `getRoleByName`, `getRolePermissions`.

## Events

`@spfn/auth` emits decoupled events (via `@spfn/core/event`). Subscribe for welcome emails,
analytics, onboarding, etc. Client-supplied `metadata` on register/OAuth flows is forwarded verbatim.

```typescript
import { authLoginEvent, authRegisterEvent, invitationCreatedEvent, invitationAcceptedEvent } from '@spfn/auth/server';

authRegisterEvent.subscribe(async ({ userId, email, provider, metadata }) =>
{
    if (email) await sendWelcome(email);
});
```

Payload types: `AuthLoginPayload`, `AuthRegisterPayload`, `InvitationCreatedPayload`,
`InvitationAcceptedPayload`, `AuthDeletionRequestedPayload`, `AuthDeletionCancelledPayload`,
`AuthDeletionCompletedPayload`. These events also bind to `@spfn/core/job` jobs via `.on(event)`.

## Registration gate (`beforeRegister`)

Events fire *after* the user exists — they cannot reject a registration. For server-enforced
signup policy (age gate, invite-only domains, block lists) inject a validator with
`configureAuth`; it runs **before the user row is created** on every registration channel:
`credentials` (email/phone register), `oauth` (new-user social signup, web + native), and
`invitation` (acceptance). Throwing rejects the registration; `RegistrationRejectedError` (403)
is the recommended error. The hook receives the same `metadata` the app supplied to
`register` / OAuth start / the invitation — never credentials.

```typescript
import { configureAuth, RegistrationRejectedError } from '@spfn/auth/server';

configureAuth({
    beforeRegister: async ({ channel, provider, email, phone, metadata }) =>
    {
        if (!isOldEnough(metadata?.birthDate))
        {
            throw new RegistrationRejectedError({ message: 'Age requirement not met' });
        }
    },
});
```

Notes:
- Runs after built-in checks (verification token, duplicate account) — existing error
  precedence is unchanged, and the hook cannot be probed without a valid verification token.
- Not called when an OAuth login links a social account to an existing user, nor for admin
  seeding in `initializeAuth()`.
- OAuth signups have no client-typed fields unless you pass `metadata` at OAuth start — decide
  per channel (reject, or allow and collect during onboarding).
- On the `oauth` channel `email` is the provider-reported address and may be **unverified**
  (the created account then stores `email` as `null`). The context carries
  `emailVerified` — an email-based allow/block policy must check it before trusting `email`.
- The hook runs **inside the registration DB transaction** on every channel — keep it fast.
  A slow call (e.g. an external policy API) holds a pooled DB connection open per signup.
- On the **web** OAuth flow a rejection surfaces as the standard OAuth error redirect
  (302 to the app's OAuth error URL, message only) — not a 403 JSON response. The native
  OAuth flow, credentials, and invitation channels return the error status (403) directly.

## One-Time Token

For short-lived authenticated handshakes (e.g. SSE) where a `Bearer` header is awkward: issue
with `authApi.issueOneTimeToken`, protect the consuming route with the `oneTimeTokenAuth`
middleware. Call `initOneTimeTokenManager({ ttl, store })` during setup for a custom TTL/store.

## Account Deletion & Recovery

Grace-period deletion with in-window recovery, an admin/GDPR-response entry point for immediate
purge, and a pluggable app-data cleanup hook. Not covered by this feature: re-signup email
blind-index/hashing (a purged account's email becomes reusable immediately — see the project's
PII protection track for blind-index re-signup prevention), backup beyond-use handling, DSR
intake/response workflows, and webhook fan-out — those are app/ops concerns.

```
active ──request (re-auth)──> pending_deletion ──grace period elapses (cron)──> deleted (anonymize) | row removed (hard-delete)
  ^                                  │
  └───────────cancel (re-auth)───────┘        immediate = grace period of 0, same pipeline
```

- **Request** — `POST /_auth/deletion/request` (authenticated). Step-up re-auth: password
  holders confirm with `password`; OAuth-only/passwordless accounts confirm with a
  `verificationToken` from `/_auth/codes` + `/_auth/codes/verify` (`purpose: 'account_deletion'`).
  On success: status → `pending_deletion`, every active session key is revoked, a
  `account_deletion_requests` audit row is created, `auth.deletion.requested` fires, and (if
  the user has an email and `sendNotifications` is on) a notice is sent with the scheduled purge
  date.
- **Login is blocked while pending** — password login, OAuth login, and the `authenticate`
  middleware all reject a `pending_deletion` account with `AccountPendingDeletionError` (403,
  `details.purgeScheduledAt`) instead of the generic `AccountDisabledError`, so the client can
  show a recovery prompt.
- **Cancel (recovery)** — `POST /_auth/deletion/cancel` (public — sessions were revoked at
  request time, so there's no Bearer token to authenticate with). Credential-based: email/phone
  plus `password` or a fresh `verificationToken`. On success, status → `active`; the user still
  needs to log in separately afterward.
- **Purge job** — sweeps `account_deletion_requests` for rows past their grace period and
  destroys the account. Register it explicitly (see below); it is **not** wired up by
  `createAuthLifecycle()` automatically.
- **Admin / GDPR-response entry points** — `requestAccountDeletionService(userId, { requestedBy: 'admin', immediate })`
  and `purgeUserService(userId)` are exported for app-side admin routes / DSR handling; the app
  owns the route and its authorization.

```typescript
import { defineServerConfig } from '@spfn/core/server';
import { createAuthLifecycle, authJobRouter } from '@spfn/auth/server';

export default defineServerConfig()
    .lifecycle(createAuthLifecycle({
        deletion: {
            gracePeriodDays: 30,               // default; 0 = immediate
            purgeStrategy: 'anonymize',        // default; or 'hard-delete'
            allowSelfImmediate: false,         // default; self-service immediate: true
            sendNotifications: true,           // default
            onBeforePurge: async (user) =>
            {
                // throw to skip this user for the current sweep (retried next run)
                await appDataCleanup(user.id);
            },
        },
    }))
    .jobs(authJobRouter)   // registers the daily (04:00 UTC) purge sweep
    .routes(appRouter)
    .build();
```

**Purge strategies:**

- `anonymize` (default) — scrubs PII, keeps the row: `email` → `deleted-{publicId}@deleted.invalid`,
  `phone`/`username`/`passwordHash` → `null`, `status` → `'deleted'`, `deletedAt`/`deletedBy` set
  (`softDelete()` on `users`). Social accounts and public keys are deleted (frees the provider
  link and revokes access), the profile's PII columns are cleared, and any leftover verification
  codes for the original email/phone are removed. The freed email/phone can be re-registered
  immediately.
- `hard-delete` — physically removes the `users` row; child rows (`user_profiles`,
  `user_public_keys`, `user_social_accounts`, `user_permissions`) cascade-delete via their FK.
  The `account_deletion_requests` audit row survives either strategy — its `userId` FK is
  `set null` (not cascade), by design, so "who requested/purged what, when" outlives the user row.

The final "your account has been deleted" notice is sent **after** the purge transaction commits
(never before, and never on a purge that aborted or rolled back — see below), using the address
captured before the destructive step ran. This holds for `hard-delete` too: the row is already
gone by send time, but the address was captured beforehand, so the notice still goes out.

**Concurrency.** The purge job re-verifies the user is still `pending_deletion` on the write
primary immediately before any destructive DML, inside the same transaction as the DML itself —
closing the window between a stale read (the sweep's own batch, or replica lag) and a concurrent
`cancel`. The `account_deletion_requests` claim (`markCompleted`) is a conditional `UPDATE ...
WHERE status = 'pending'`; if a concurrent cancel already moved the row off `pending`, the claim
matches zero rows and the purge aborts with no destructive DML and no overwritten audit row.

**Cron schedule caveat.** `deletion.purgeCron` (default `0 4 * * *`) is stored for reference, but
the static `authJobRouter` export above always runs on the *default* cron — `job(...).cron(...)`
is fixed at module-import time, which happens before `createAuthLifecycle()` runs in your
`server.config.ts`. For a non-default schedule, build the router yourself, after the
`createAuthLifecycle()` call, and register that instead:

```typescript
import { createAuthDeletionJobRouter } from '@spfn/auth/server';

// ... after .lifecycle(createAuthLifecycle({ deletion: { purgeCron: '0 3 * * *' } }))
.jobs(createAuthDeletionJobRouter({ purgeCron: '0 3 * * *' }))
```

Register **only one** of `authJobRouter` / `createAuthDeletionJobRouter(...)` — both build a job
named `auth.deletion.purge`, so registering both (e.g. the static export *and* a custom-cron
router) double-registers the same job name against pg-boss instead of overriding it.

## Pitfalls & anti-patterns

- **Wrong entry point.** `@spfn/auth/server` and `@spfn/auth/nextjs/*` are server-only (Node /
  `server-only`). Importing them in a client component breaks the build. Entities, services, and
  repositories are on `/server`, not on root `@spfn/auth`.
- **No `app.bind(contract, ...)`.** That contract pattern is removed. Use the route DSL
  (`route.get().handler()` + `defineRouter`). Any docs/snippets using `app.bind` are stale.
- **Custom error classes must be registered.** Add them to an `ErrorRegistry` (mirror
  `authErrorRegistry` in `src/errors/index.ts`) and pass it to your `createApi({ errorRegistry })`,
  or the client receives a generic error instead of the typed one.
- **Two env files, by audience.** `SPFN_AUTH_SESSION_SECRET` lives in `.env.local` (Next.js needs
  it for cookie crypto); `SPFN_AUTH_VERIFICATION_TOKEN_SECRET` lives in `.env.server`. Splitting
  them wrong yields "missing secret" failures only at runtime.
- **`SPFN_AUTH_SESSION_SECRET` is validated.** Minimum 32 chars plus entropy/unique-char checks —
  a short or low-entropy value fails startup, not just a warning.
- **Forgetting the interceptor import.** Without `import '@spfn/auth/nextjs/api'` in the RPC proxy
  route, the client sends no `Authorization` header and every protected call 401s. The
  `authenticate` middleware error message points here.
- **Custom OAuth callback without `Transactional()`.** A failure mid-callback leaves an orphan
  user. Always wrap the callback route in `Transactional()` and call `oauthCallbackService`.
- **`sideEffects: false` tree-shakes the google provider.** The built-in provider self-registers
  via a module side-effect; an aggressive bundler config can drop it. Don't mark this package's
  imports side-effect-free.
- **Public routes need an explicit opt-out.** With global `authenticate`, any route without
  `.skip(['auth'])` (or `optionalAuth`, which auto-skips) requires a valid token.
- **`SOCIAL_PROVIDERS` is plain `enumText`.** Adding a provider value needs no DB migration, but
  every `switch(provider)` over login/register events must handle the new value.
- **Email/SMS is not here.** It moved to `@spfn/notification` (`import { sendEmail, sendSMS } from
  '@spfn/notification/server'`). Wire verification-code / invitation emails through its events.
- **`authJobRouter` isn't registered for you.** `createAuthLifecycle()`'s `afterInfrastructure`
  hook runs *before* `@spfn/core` initializes pg-boss and registers jobs, so the lifecycle has no
  opportunity to auto-register the account-deletion purge job. Call `.jobs(authJobRouter)`
  yourself — see [Account Deletion & Recovery](#account-deletion--recovery).
- **`USER_STATUSES` gained `pending_deletion` / `deleted`.** Any code with a `switch(user.status)`
  or an exhaustive status union must handle both — `enumText` is plain `text` with no DB `CHECK`,
  so nothing enforces this at the database layer.

## Complete example

```typescript
// server.config.ts
import { defineServerConfig } from '@spfn/core/server';
import { createAuthLifecycle } from '@spfn/auth/server';
import { appRouter } from './router';

export default defineServerConfig()
    .port(8790)
    .routes(appRouter)
    .lifecycle(createAuthLifecycle({
        roles: [{ name: 'editor', displayName: 'Editor', priority: 30 }],
        permissions: [{ name: 'post:publish', displayName: 'Publish Posts', category: 'content' }],
        rolePermissions: { editor: ['post:publish'] },
    }))
    .build();

// router.ts
import { defineRouter } from '@spfn/core/route';
import { authRouter, authenticate } from '@spfn/auth/server';
import { getMe } from './routes/me';

export const appRouter = defineRouter({ getMe })
    .packages([authRouter])
    .use([authenticate]);
export type AppRouter = typeof appRouter;

// app/api/rpc/[routeName]/route.ts
import '@spfn/auth/nextjs/api';
import { createRpcProxy } from '@spfn/core/nextjs/server';
import { authRouteMap } from '@spfn/auth';
import { routeMap } from '@/generated/route-map';
export const { GET, POST } = createRpcProxy({ routeMap: { ...routeMap, ...authRouteMap } });

// any client component
import { authApi } from '@spfn/auth';
const session = await authApi.getAuthSession.call({});
```

## Related

- `@spfn/core` — route DSL (`route`, `defineRouter`), `createApi`, env (`@spfn/core/env`),
  errors (`ErrorRegistry`), db (`Transactional`), events, jobs.
- `@spfn/notification` — email/SMS/push (verification codes, invitation emails).
- Full guide: `docs/guides/authentication.md`.
