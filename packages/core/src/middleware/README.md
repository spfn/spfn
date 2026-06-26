# @spfn/core/middleware — Built-in HTTP middleware (error handling + request logging + proxy-guard + rate limiting)

Production Hono middleware factories and a masking helper: `ErrorHandler` (serializes
thrown errors into HTTP responses), `RequestLogger` (structured request/response logging
with request IDs, slow-request detection, and sensitive-data masking), `createProxyGuard`
(verifies a trusted-proxy HMAC signature + origin allowlist and tags `clientType`), and
`rateLimit` (Redis-backed fixed-window limiter for brute-force / DoS protection).

> **These are the exports of this module.** `defineMiddleware` (custom named
> middleware), `.use()` / `.skip()` (route-level wiring), and `Transactional` (DB
> transaction middleware) are **not** here — they live in `@spfn/core/route` and
> `@spfn/core/db`. See [Related](#related).

## Import paths

```typescript
import {
    ErrorHandler,
    RequestLogger,
    maskSensitiveData,
    createProxyGuard,
    createCacheNonceStore,
    rateLimit,
    getClientIp,
} from '@spfn/core/middleware';

import type {
    ErrorHandlerOptions,
    OnErrorContext,
    RequestLoggerOptions,
    RequestLoggerConfig, // deprecated alias of RequestLoggerOptions
    ProxyGuardConfig,
    ProxyGuardMode,
    ClientType,
    NonceStore,
    RateLimitOptions,
} from '@spfn/core/middleware';
```

There is **no** `@spfn/core` root barrel — always import from `@spfn/core/middleware`.
`import { ErrorHandler } from '@spfn/core'` does not resolve.

---

## Public API (complete)

From `@spfn/core/middleware`:

- `ErrorHandler(options?: ErrorHandlerOptions)` → `(err, c) => Response | Promise<Response>`
  — register with `app.onError(...)`, **not** `app.use(...)`.
- `RequestLogger(options?: RequestLoggerOptions)` → Hono middleware `(c, next) => Promise<void>`
  — register with `app.use(...)`.
- `maskSensitiveData(obj, sensitiveFields, seen?)` → deep-masked copy of `obj`.
- `createProxyGuard(config?: ProxyGuardConfig)` → Hono middleware. Verifies the proxy→backend
  HMAC signature (rotating key set, keyed by `keyId`) over `method+path+query+body`, plus an
  optional origin allowlist, then sets `c.get('clientType')` (`'web'` | `'untrusted'`). Modes:
  `off` (default) / `tag` / `strict` — every gate is evaluated in BOTH modes, only enforcement
  differs (strict rejects 403/413, tag tags `untrusted` and continues). `maxBodyBytes` caps the
  hashed body (stream-measured). Usually enabled via `defineServerConfig().proxyGuard({...})`,
  not `app.use` directly.
- `createCacheNonceStore(cache, prefix?)` → `NonceStore` for hard replay rejection (Redis
  `SET … PX NX`). Pass to `proxyGuard.nonceStore` (auto-wired from a cache when `nonce: true`).
- `rateLimit(options: RateLimitOptions)` → Hono middleware. Redis-backed fixed-window limiter,
  registered under the named `'rateLimit'` slot so routes can `.skip(['rateLimit'])`. Attach
  with `.use([rateLimit({...})])`. See [rateLimit](#ratelimit).
- `getClientIp(c)` → best-effort client IP from the proxy chain (leftmost `X-Forwarded-For`,
  then `X-Real-IP`, else `'unknown'`). Spoofable — see the caveat in [rateLimit](#ratelimit).

Types: `ErrorHandlerOptions`, `OnErrorContext`, `RequestLoggerOptions`, `RequestLoggerConfig`,
`ProxyGuardConfig`, `ProxyGuardMode`, `ClientType`, `NonceStore`, `RateLimitOptions`.

See the root `PROXY-BACKEND-AUTH-SPEC.md` for the threat model, key rotation, and `.env`
placement (`SPFN_PROXY_SECRET` in `.env.local`; grace `SPFN_PROXY_SECRET_PREVIOUS` in `.env.server`).

> **`RequestLoggerConfig` is deprecated** — it is a type alias of `RequestLoggerOptions`.
> Use `RequestLoggerOptions` in new code.

> **Most SPFN apps never call these directly.** `createServer` / `defineServerConfig`
> auto-register both — see [Auto-registration](#auto-registration-the-spfn-default-path)
> below. Manual `app.use` / `app.onError` is the raw-Hono path.

---

## Auto-registration (the SPFN default path)

When you start a server via `@spfn/core/server`, **`RequestLogger` and `ErrorHandler` are
applied for you** (along with CORS). You do not wire them by hand.

```typescript
import { defineServerConfig } from '@spfn/core/server';

export default defineServerConfig()
    .routes(appRouter)
    .build();
// → RequestLogger() (no options), CORS, then ErrorHandler() are auto-applied.
```

Toggle / configure them through `config.middleware`:

```typescript
export default defineServerConfig()
    .middleware({
        logger: true,         // RequestLogger (default: true) — set false to disable
        cors: true,           // CORS (default: true)
        errorHandler: true,   // ErrorHandler (default: true) — set false to disable
        onError: (err, ctx) =>  // forwarded into ErrorHandler({ onError })
        {
            // non-blocking side-effect (Slack, PagerDuty, ...)
            log(ctx.statusCode, ctx.method, ctx.path, err.message);
        },
    })
    .routes(appRouter)
    .build();
```

Notes (from `create-server.ts`):

- The auto-applied `RequestLogger()` is called with **no options**, so it uses the
  defaults below (excludes `/health`, `/ping`, `/favicon.ico`). To customize excludePaths
  etc., disable it (`middleware.logger: false`) and add your own via `config.use`.
- `config.middleware.onError` is the **only** `ErrorHandlerOption` exposed through the
  builder; `includeStack` / `enableLogging` fall back to their defaults under auto-config.
- Order is fixed: `RequestLogger` → CORS → routes → `ErrorHandler` (via `app.onError`).

---

## Quick Start (raw Hono)

Use this only when wiring a bare Hono app yourself (not via `defineServerConfig`).

```typescript
import { Hono } from 'hono';
import { ErrorHandler, RequestLogger } from '@spfn/core/middleware';

const app = new Hono();

app.use('*', RequestLogger());     // middleware — runs per request
app.onError(ErrorHandler());       // error hook — NOT app.use()

export default app;
```

---

## ErrorHandler

Converts a thrown error into a JSON HTTP response. Register it with **`app.onError()`**
(it is Hono's error hook, not a `use()` middleware).

### Behavior

- **`SerializableError`** (from `@spfn/core/errors`) → serialized via its `toJSON()`, using
  the error's own `statusCode` as the HTTP status. Custom fields (`resource`, `fields`, …)
  are preserved. Detection is duck-typed (`toJSON` + numeric `statusCode`) so it survives
  module duplication under tsx/dev.
- **Standard `Error`** → falls back to `{ __type: 'Error', message }`, status from a
  `statusCode` property on the error if present, else `500`.
- **`cause` chain** → the root cause message is extracted and added as `cause`.
- **Production information disclosure** → when `includeStack` is `false` (the production
  default), the client message is genericized for anything whose text may come from the DB
  driver: standard (uncaught) `Error`s become `"Internal Server Error"` with no `cause`, and
  any error exposing `internal === true` (the `DatabaseError` family — `QueryError`,
  `ConnectionError`, `TransactionError`, … carrying raw SQL / table / column / parameter
  text) becomes `"Internal server error"` with no `details`. Full detail is still logged
  server-side. Errors with a safe, constructed message (`EntityNotFoundError`,
  `DuplicateEntryError`, and all non-DB `SerializableError`s) are returned unchanged.
- **Logging** (when `enableLogging`): `warn` for 4xx, `error` for 5xx, via the
  `@spfn/core:error-handler` logger.
- **`onError` callback** → fired non-blocking (`Promise.resolve(...).catch(...)`); never
  delays or fails the response.

### Options (`ErrorHandlerOptions`)

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `includeStack` | `boolean` | `env.NODE_ENV !== 'production'` | Add `stack` to the response body |
| `enableLogging` | `boolean` | `true` | Log errors (warn 4xx / error 5xx) |
| `onError` | `(err, ctx: OnErrorContext) => void \| Promise<void>` | — | Non-blocking side-effect callback |

```typescript
app.onError(ErrorHandler({
    includeStack: env.NODE_ENV !== 'production',
    enableLogging: true,
    onError: (err, ctx) => notify(ctx.statusCode, ctx.path, err),
}));
```

### Response format

`SerializableError` (e.g. `NotFoundError`) — body is its `toJSON()` output; HTTP status is
the error's `statusCode`:

```json
// production
{ "__type": "NotFoundError", "message": "User not found", "resource": "User" }

// development (includeStack) adds:
{ "__type": "NotFoundError", "message": "User not found", "resource": "User",
  "stack": "Error: User not found\n    at ..." }
```

Standard error fallback:

```json
{ "__type": "Error", "message": "Internal Server Error" }
// + "cause": "..."  when the error has a cause
// + "stack": "..."  only when includeStack is true
```

> The serialized field is **`__type`**, and the status code is carried by the **HTTP
> status**, not a body field. (Older docs showing `{ "error": "...", "statusCode": 400 }`
> are stale.)

### `OnErrorContext`

```typescript
interface OnErrorContext {
    statusCode: number;
    path: string;
    method: string;
    requestId?: string;   // present when RequestLogger ran first
    timestamp: string;    // ISO 8601
    userId?: string;      // from c.get('auth')?.userId, when auth middleware set it
    request: {
        headers: Record<string, string>;  // sensitive headers masked to '***'
        query: Record<string, string>;
    };
}
```

Masked request headers: `authorization`, `cookie`, `x-api-key`, `x-auth-token`
(case-insensitive). `requestId` and `userId` are only populated when the corresponding
upstream middleware (RequestLogger / auth) has run.

---

## RequestLogger

Per-request logging middleware. Register with **`app.use()`**.

### Behavior

- Generates a request ID (`req_<timestamp>_<6-byte hex>`) and stores it on the context:
  `c.set('requestId', id)` → read via `c.get('requestId')`.
- Logs `Request received` (method, path, ip, userAgent) and `Request completed`
  (status, duration). Client IP is taken from `x-forwarded-for` (first hop) → `x-real-ip` →
  `'unknown'`.
- Log level by status: `info` (<400), `warn` (4xx), `error` (5xx). Logger child:
  `@spfn/core:api`.
- **Slow requests** (`duration >= slowRequestThreshold`) get `slow: true`.
- **For 4xx/5xx**: clones the response to attach the error `response` body, and for
  `POST`/`PUT`/`PATCH` attaches the masked request body (`request`).
- If the downstream throws, logs `Request failed` at `error` level **and re-throws**
  (so `app.onError` / `ErrorHandler` still runs). It does not swallow errors.

### Options (`RequestLoggerOptions`)

| Option | Type | Default |
|--------|------|---------|
| `excludePaths` | `string[]` | `['/health', '/ping', '/favicon.ico']` |
| `sensitiveFields` | `string[]` | `['password', 'token', 'apiKey', 'secret', 'authorization']` |
| `slowRequestThreshold` | `number` (ms) | `1000` |

`excludePaths` matches **exact or prefix** — `/health` also excludes `/health/db`. Excluded
paths skip logging entirely (and get **no** request ID).

```typescript
app.use('*', RequestLogger({
    excludePaths: ['/health', '/metrics', '/_next'],
    sensitiveFields: ['password', 'creditCard', 'ssn'],
    slowRequestThreshold: 500,
}));
```

### Reading the request ID

```typescript
// in a route handler
const requestId = c.get('requestId'); // string | undefined
```

### Log output examples

```json
// Request received
{ "level": "info", "module": "api", "msg": "Request received",
  "requestId": "req_1759541628730_qsm7esvo7", "method": "POST", "path": "/users",
  "ip": "127.0.0.1", "userAgent": "..." }

// completed (success)
{ "level": "info", "module": "api", "msg": "Request completed",
  "requestId": "req_...", "method": "POST", "path": "/users", "status": 201, "duration": 45 }

// completed (4xx — includes response body + masked request body)
{ "level": "warn", "module": "api", "msg": "Request completed",
  "status": 400, "duration": 2,
  "response": { "__type": "ValidationError", "message": "Invalid request body" },
  "request": { "status": 123, "password": "***MASKED***" } }

// slow
{ "level": "info", "msg": "Request completed", "status": 200, "duration": 1250, "slow": true }

// downstream threw (then re-thrown to ErrorHandler)
{ "level": "error", "module": "api", "msg": "Request failed",
  "method": "POST", "path": "/users", "duration": 23, "error": { ... } }
```

---

## maskSensitiveData

Deep-masks fields whose name (case-insensitive) **contains** any of `sensitiveFields`,
returning a new structure. Used internally by `RequestLogger`; exported for reuse.

```typescript
import { maskSensitiveData } from '@spfn/core/middleware';

maskSensitiveData(
    { username: 'john', password: 'secret', apiKey: 'sk_live_x' },
    ['password', 'apiKey'],
);
// → { username: 'john', password: '***MASKED***', apiKey: '***MASKED***' }
```

- **Partial + case-insensitive**: `['password']` masks `userPassword`, `PASSWORD`, etc.
- **Recursive**: descends into nested objects and arrays.
- **Immutable**: shallow-clones at each level; the input is untouched.
- **Circular-safe**: repeated references become `'[Circular]'` (via an internal `WeakSet`).
- Non-objects (`null`, primitives) are returned as-is.

Replacement token is the literal string `'***MASKED***'`.

---

## rateLimit

Redis-backed **fixed-window** rate limiter. Registered under the named `'rateLimit'`
middleware so a route can opt out with `.skip(['rateLimit'])`. Attach per-route with
`.use([rateLimit({...})])`.

```typescript
import { rateLimit, getClientIp } from '@spfn/core/middleware';

// 10 requests / minute per client IP (the default dimension)
route.post('/_auth/login')
    .use([rateLimit({ limit: 10, windowMs: 60_000 })])
    .handler(/* ... */);

// limit on more than one dimension — the strictest wins
route.post('/_auth/codes')
    .use([rateLimit({
        limit: 5,
        windowMs: 60_000,
        by: (c) => [getClientIp(c)],
    })])
    .handler(/* ... */);
```

### Options (`RateLimitOptions`)

| Field | Type | Default | Notes |
|---|---|---|---|
| `limit` | `number` | — | Max requests per window, applied to **each** dimension. |
| `windowMs` | `number` | — | Window length in milliseconds. |
| `scope` | `string` | `` `${method} ${routePath}` `` | Counter-key namespace; defaults to per-route. |
| `by` | `(c) => (string \| null \| undefined)[]` | `[getClientIp(c)]` | Identity dimensions; each non-empty value is counted separately. |
| `failClosed` | `boolean` | `false` | Reject with 429 when the cache is unavailable instead of allowing through. |
| `message` | `string` | generic | 429 response message. |

### Behavior

- **Atomic**: counts via a single Lua `INCR` + `PEXPIRE`, so the expiry is never lost in
  a race between two requests.
- **Fail-open by default**: when no cache is configured (or it is disabled), requests pass
  and a warning is logged — matching the proxy-guard nonce store's graceful degradation, so
  local dev without Redis still works. Set `failClosed: true` to reject instead.
- **On exceed**: throws `TooManyRequestsError` (429) and sets a `Retry-After` header derived
  from the key's remaining TTL.
- **Storage**: keys are `ratelimit:{scope}:{dimension}` in the shared cache.

> **IP trust caveat**: `getClientIp` reads the leftmost `X-Forwarded-For` hop, which a client
> can spoof unless a trusted proxy overwrites it. For security-sensitive limits, pair the IP
> dimension with an account/target dimension rather than relying on IP alone.

---

## Pitfalls & anti-patterns

- **`ErrorHandler` goes on `app.onError()`, never `app.use()`.** It returns an
  `(err, c) => Response` error hook, not a `(c, next)` middleware. Putting it in `use()`
  (or `config.middlewares` / `config.use`) will not catch errors.
- **Don't double-register under `defineServerConfig`.** The server auto-applies both. Only
  use the raw `app.use(RequestLogger())` / `app.onError(ErrorHandler())` calls on a bare
  Hono app. To change RequestLogger options under SPFN, set `middleware.logger: false` and
  add your own via `config.use`.
- **`config.middleware.onError` is the only ErrorHandler option the builder forwards.**
  `includeStack` / `enableLogging` are not configurable through `defineServerConfig` — they
  use defaults. Need them tuned? Build the Hono app manually.
- **RequestLogger must run before ErrorHandler** for `requestId` to appear in
  `OnErrorContext`. The auto-config order (logger → … → onError) already guarantees this;
  preserve it if wiring manually (`app.use(RequestLogger())` then `app.onError(...)`).
- **Excluded paths get no request ID.** `excludePaths` short-circuits before
  `c.set('requestId')`, so handlers on `/health` etc. read `undefined`.
- **These are not "named middleware."** They have no `.skip()` name and cannot be skipped
  per-route via the route DSL. Route-level skip applies only to `NamedMiddleware` created
  with `defineMiddleware` (`@spfn/core/route`). To exclude paths from logging, use
  `excludePaths`, not `.skip()`.
- **`sensitiveFields` matches by substring.** A field named `tokenize` is masked because it
  contains `token`. Choose field names with that in mind.
- **Don't import from `@spfn/core`.** No root barrel exists; use `@spfn/core/middleware`.
- **`RequestLoggerConfig` is deprecated** — alias of `RequestLoggerOptions`.

---

## Complete example (raw Hono)

```typescript
import { Hono } from 'hono';
import { ErrorHandler, RequestLogger } from '@spfn/core/middleware';
import { NotFoundError } from '@spfn/core/errors';

const app = new Hono();

// 1. RequestLogger first — assigns requestId, times every request
app.use('*', RequestLogger({
    excludePaths: ['/health'],
    slowRequestThreshold: 500,
}));

app.get('/users/:id', async (c) =>
{
    const requestId = c.get('requestId');
    const user = await findUser(c.req.param('id'));

    if (!user)
    {
        throw new NotFoundError({ message: 'User not found', resource: 'User' });
    }

    return c.json({ requestId, user });
});

// 2. ErrorHandler last — onError hook catches everything above
app.onError(ErrorHandler({
    includeStack: process.env.NODE_ENV !== 'production',
    onError: (err, ctx) => notify(ctx),
}));

export default app;
```

Under SPFN, the equivalent is just `defineServerConfig().routes(appRouter).build()` — both
middleware are added automatically.

---

## Types reference

```typescript
interface ErrorHandlerOptions {
    includeStack?: boolean;   // default: env.NODE_ENV !== 'production'
    enableLogging?: boolean;  // default: true
    onError?: (err: Error, context: OnErrorContext) => Promise<void> | void;
}

interface OnErrorContext {
    statusCode: number;
    path: string;
    method: string;
    requestId?: string;
    timestamp: string;
    userId?: string;
    request: { headers: Record<string, string>; query: Record<string, string> };
}

interface RequestLoggerOptions {
    excludePaths?: string[];        // default: ['/health', '/ping', '/favicon.ico']
    sensitiveFields?: string[];     // default: ['password','token','apiKey','secret','authorization']
    slowRequestThreshold?: number;  // default: 1000 (ms)
}

type RequestLoggerConfig = RequestLoggerOptions; // @deprecated

function maskSensitiveData(obj: any, sensitiveFields: string[], seen?: WeakSet<object>): any;
```

## Related

- [@spfn/core/route](../route/README.md) — `defineMiddleware` / `defineMiddlewareFactory`
  (custom named middleware), route-level `.use()` / `.skip()` wiring and execution order.
- [@spfn/core/db](../db/README.md) — `Transactional()` route middleware
  (auto commit/rollback).
- [@spfn/core/server](../server/README.md) — `defineServerConfig` / `config.middleware`,
  which auto-registers `RequestLogger` + `ErrorHandler`.
- [@spfn/core/errors](../errors/README.md) — `SerializableError` and the built-in error
  classes that `ErrorHandler` serializes.
- [@spfn/core/logger](../logger/README.md) — the logger both middleware write to.
</content>
</invoke>
