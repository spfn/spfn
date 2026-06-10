# @spfn/core/db/manager — DB connection lifecycle, pool, health-check & reconnect

Global singleton database manager for postgres.js + Drizzle: connection acquisition,
pool config, Primary+Replica detection, periodic health checks, and two-tier automatic
pool recovery (periodic + query-error fast-path).

## Import paths

Everything is consumed through **`@spfn/core/db`**. There is **no** `@spfn/core/db/manager`
package subpath — `manager/index.ts` is an internal barrel; the public surface is
re-exported by `@spfn/core/db`.

```typescript
import {
    initDatabase,
    getDatabase,
    setDatabase,
    closeDatabase,
    getDatabaseInfo,
    forceReconnectDatabase,
    createDatabaseFromEnv,
    createDatabaseConnection,
    checkConnection,
    reportDatabaseError,
    isConnectionLevelError,
    resetConnectionErrorCounter,
} from '@spfn/core/db';

import type { DatabaseClients, PoolConfig, RetryConfig } from '@spfn/core/db';
```

> `getDatabaseMonitoringConfig` and `getDatabaseInfo` are the only debug/introspection
> helpers. **`getDatabaseMonitoringConfig` is exported from the `manager/` barrel but is
> NOT re-exported through `@spfn/core/db`** — it is effectively internal (consumed by the
> repository layer). Do not rely on importing it from `@spfn/core/db`.

---

## Public API (complete, via `@spfn/core/db`)

Lifecycle:

- `initDatabase(options?): Promise<{ write?, read? }>` — connect from env, test, start
  health check. Idempotent + concurrency-locked.
- `getDatabase(type?): PostgresJsDatabase` — get the singleton instance. **Throws** if not
  initialized. `type` is `'read' | 'write'` (default `'write'`).
- `setDatabase(write, read?): void` — directly set instances (testing/manual). No connect,
  no validation, no cleanup of previous instances.
- `closeDatabase(): Promise<void>` — graceful shutdown: stop health check, end pools, clear
  global state.

Recovery:

- `forceReconnectDatabase(reason?): Promise<boolean>` — on-demand atomic-swap pool rebuild.
  Returns `true` if a rebuild ran, `false` if skipped (uninitialized / closing / already
  reconnecting).
- `reportDatabaseError(error): void` — feed a caught query error to the fast-path trigger.
  No-op for non-connection errors. Fire-and-forget (never awaits, never throws).
- `isConnectionLevelError(error): boolean` — classify whether an error is connection-level
  (vs. a query/constraint error).
- `resetConnectionErrorCounter(): void` — test helper; clears the sliding-window counter.

Low-level / factory:

- `createDatabaseFromEnv(options?): Promise<DatabaseClients>` — build clients from env using
  pattern detection. Does **not** touch global state or start health checks.
- `createDatabaseConnection(connectionString, poolConfig, retryConfig): Promise<Sql>` —
  single postgres.js client with exponential-backoff retry. Returns the raw `Sql` client.
- `checkConnection(client): Promise<boolean>` — run `SELECT 1`, return health as a boolean
  (never throws).

Introspection:

- `getDatabaseInfo(): { hasWrite, hasRead, isReplica }` — non-throwing status snapshot.

Types: `DatabaseClients`, `PoolConfig`, `RetryConfig` (also `DbConnectionType`,
`GetDatabaseFn` from the barrel, but those are not re-exported by `@spfn/core/db`).

> **Not exported (internal):** `detectDatabasePattern`, `startHealthCheck`,
> `stopHealthCheck`, `triggerForceReconnect`, `reconnectAndRestore`, all of
> `global-state.ts` (`getWriteInstance`/`setWriteInstance`/…), and the config builders
> (`getPoolConfig`, `getRetryConfig`, `buildHealthCheckConfig`, `buildMonitoringConfig`).
> Configure them via `initDatabase(options)` or env vars — do not import them.
> There is **no** `discoverPackageSchemas` export. Schema discovery is reached only through
> `getDrizzleConfig` / `generateDrizzleConfigFile` (from `@spfn/core/db`, defined in
> `config-generator.ts` — out of scope for this README).

---

## Quick Start

```typescript
import { initDatabase, getDatabase, closeDatabase } from '@spfn/core/db';

await initDatabase();              // auto-detect from env, test, start health check

const db = getDatabase();          // 'write' (default)
const dbR = getDatabase('read');   // replica if configured, else falls back to write

const users = await db.select().from(usersTable);

process.on('SIGTERM', async () => {
    await closeDatabase();
    process.exit(0);
});
```

### Environment variables (connection)

```bash
# Single database (most common)
DATABASE_URL=postgresql://localhost:5432/mydb

# Primary + Replica
DATABASE_WRITE_URL=postgresql://primary:5432/mydb
DATABASE_READ_URL=postgresql://replica:5432/mydb
```

`DATABASE_URL`, `DATABASE_WRITE_URL`, `DATABASE_READ_URL` are validated via the
`@spfn/core/config` schema (`parsePostgresUrl`). All read through `env` from
`@spfn/core/config`, **not** raw `process.env`.

---

## Connection acquisition (`getDatabase`)

`getDatabase(type?)` reads the singleton off `globalThis`:

- `getDatabase()` / `getDatabase('write')` → write instance, or **throws**
  `Database not initialized (type: write)…` if `initDatabase()` was never called.
- `getDatabase('read')` → read instance, **falling back to write** when no replica is
  configured (`readInst ?? writeInst`). Throws only if neither exists.

It never returns `undefined`. There is **no implicit lazy init** — you must call
`initDatabase()` (or `setDatabase()`) first.

Set `DB_DEBUG_TRACE=true` (non-production only) to log every `getDatabase()` call with the
resolved caller `file:line` extracted from the stack — useful for tracing "who is querying
before init".

### `initDatabase(options?)` semantics

- **Idempotent**: if a write instance already exists, returns it immediately.
- **Concurrency-locked**: an in-flight `initDatabase()` is shared via an internal
  `initPromise`; parallel callers await the same promise.
- **Tests connections** (`SELECT 1` on write, and on read if distinct) before marking ready;
  on failure it cleans up the half-open clients and throws
  `Database connection test failed: …`.
- **Persists `options`** to global state so `forceReconnectDatabase()` and health-check
  recovery rebuild with the *same* pool/health/monitoring config.
- Throws `Cannot initialize database while closing` if called during `closeDatabase()`.

```typescript
await initDatabase({
    pool:        { max: 50, idleTimeout: 60 },
    healthCheck: { enabled: true, interval: 30000, reconnect: true, maxRetries: 5, retryInterval: 5000 },
    monitoring:  { enabled: true, slowThreshold: 1000, logQueries: false },
});
```

---

## Pattern detection (factory)

`createDatabaseFromEnv()` detects, in priority order:

1. **write-read** — `DATABASE_WRITE_URL` **and** `DATABASE_READ_URL` set → separate pools.
2. **single** — `DATABASE_URL` set → one pool used for both read and write.
3. **single** — only `DATABASE_WRITE_URL` set → write-only, one pool.
4. **none** — nothing set → throws `No database configuration found…`.

In the **write-read** case the write connection is required (failure throws
`Write database connection failed: …`); the read connection is **optional** — if the replica
fails to connect, it logs a warning and falls back to the write client for reads (so
`isReplica` becomes `false`).

> `detectDatabasePattern()` is an internal function, not an export. Use `getDatabaseInfo()`
> (`{ hasWrite, hasRead, isReplica }`) to inspect the resolved topology.

---

## Pool & retry config

Resolution priority for every knob: **`options` arg > env var > NODE_ENV default**.
Pool and retry numbers are parsed from **raw `process.env`** inside `config.ts`
(`parseEnvNumber`/`parseEnvBoolean`), independent of the `@spfn/core/config` schema.

### Pool

```bash
DB_POOL_MAX=20            # max connections   (prod default 20, dev 10)
DB_POOL_IDLE_TIMEOUT=30   # idle timeout (s)  (prod default 30, dev 20)
```

### Retry (exponential backoff, applied per `createDatabaseConnection`)

```bash
DB_RETRY_MAX=5            # max attempts      (prod 5, dev 3)
DB_RETRY_INITIAL_DELAY=100   # ms             (prod 100, dev 50)
DB_RETRY_MAX_DELAY=10000     # ms cap         (prod 10000, dev 5000)
DB_RETRY_FACTOR=2            # multiplier      (prod 2, dev 2)
```

Backoff = `min(initialDelay * factor^attempt, maxDelay)` with 50–100% jitter.
**Non-retryable errors fail immediately** (no retry): authentication failures, "database
does not exist", and SSL/TLS errors. Total attempts = `maxRetries + 1`.

### Connect timeout & socket family

- `connect_timeout` is fixed at **10s** per attempt (postgres.js handles it; no
  `Promise.race`).
- `DATABASE_SOCKET_FAMILY=4` or `=6` forces IPv4/IPv6 for DB sockets — a workaround for
  Node 25+ Happy Eyeballs causing `EHOSTUNREACH`. Read from raw `process.env`; unset =
  default Node behavior.

---

## Health check & two-tier recovery

When a Postgres server restarts, a partition heals, or a deploy rotates the DB, the whole
postgres.js pool can hold dead sockets. Recovery happens two ways, both using the **same
atomic swap**: a fresh pool is created **and validated** before the global reference is
replaced, then the old clients are `end({ timeout: 5 })`-ed.

### 1. Periodic health check (interval-driven)

Started automatically by `initDatabase()` when `healthCheck.enabled`. Every
`DB_HEALTH_CHECK_INTERVAL` (default **60000ms**) it runs `SELECT 1` on write (and read if
distinct). On failure, if `reconnect` is on, it runs `attemptReconnection()`.

```bash
DB_HEALTH_CHECK_ENABLED=true
DB_HEALTH_CHECK_INTERVAL=60000
DB_HEALTH_CHECK_RECONNECT=true
DB_HEALTH_CHECK_MAX_RETRIES=3
DB_HEALTH_CHECK_RETRY_INTERVAL=5000
```

The interval is **never cleared during reconnection** — only `closeDatabase()` →
`stopHealthCheck()` clears it.

### 2. Query-error fast-path (error-driven)

A bare `SELECT 1` can false-pass (postgres.js opens a new socket for it while other dead
sockets remain). `reconnect-trigger.ts` watches **real** query errors instead. A
sliding-window counter trips a force-reconnect once enough connection-level failures occur,
cutting latency from up to 60s to a few seconds.

```bash
DB_RECONNECT_ERROR_THRESHOLD=3      # connection errors needed to trip (read once at module load)
DB_RECONNECT_ERROR_WINDOW_MS=10000  # sliding window (min 1000ms)
```

These two knobs are read **once at import time** (operational tuning, not per-call). Invalid
values silently fall back to defaults.

**Auto-hooked** — application code does **not** call `reportDatabaseError()` manually:

- `BaseRepository.withContext` (`src/db/repository.ts`) reports caught errors.
- The `@Transactional` middleware (`src/db/transaction/middleware.ts`) reports caught errors.

`isConnectionLevelError()` classifies across the whole error chain
(`cause`/`original`/`error`/`err`/`inner`):

- `instanceof ConnectionError`
- postgres.js codes: `CONNECTION_ENDED`, `CONNECTION_CLOSED`, `CONNECTION_DESTROYED`,
  `CONNECT_TIMEOUT`, `CONNECTION_CONNECT_TIMEOUT`
- Node errno: `ECONNRESET`, `ECONNREFUSED`, `EPIPE`, `ETIMEDOUT`, `EHOSTUNREACH`,
  `ENETUNREACH`, `ENOTFOUND`
- PG SQLSTATE: class `08*`, `53300`, `57P01/02/03`

### Manual trigger

```typescript
import { forceReconnectDatabase } from '@spfn/core/db';

app.post('/admin/db/reconnect', async (c) => {
    const ran = await forceReconnectDatabase('admin_request');
    return c.json({ reconnected: ran });
});
```

Returns `false` (no rebuild) when the DB is uninitialized, currently closing, or a reconnect
is already in flight; `true` when a rebuild ran (success or retries exhausted).

### Monitoring config

```bash
DB_MONITORING_ENABLED=true       # default: true in dev, false in prod
DB_MONITORING_SLOW_THRESHOLD=1000
DB_MONITORING_LOG_QUERIES=false
```

Stored at init; consumed internally by the repository layer for slow-query logging.

---

## Pitfalls & anti-patterns

- **No `@spfn/core/db/manager` subpath.** Import from `@spfn/core/db`. The `manager/`
  barrel is internal.
- **`getDatabase()` throws before init.** It does not lazily connect. Call `initDatabase()`
  (server startup does this) or `setDatabase()` (tests) first, otherwise
  `Database not initialized (type: …)`.
- **`getDatabase('read')` silently falls back to write** when no replica exists — it does
  not throw, so a misconfigured `DATABASE_READ_URL` looks "fine". Check `getDatabaseInfo()
  .isReplica` to confirm a real replica.
- **A failed replica connection is non-fatal.** In write-read mode a dead `DATABASE_READ_URL`
  only logs a warning and reuses the write pool. Reads silently hit the primary.
- **Do not import the internals.** `detectDatabasePattern`, `getPoolConfig`,
  `buildHealthCheckConfig`, `startHealthCheck`, `triggerForceReconnect`, and the
  `global-state` accessors are not exported. Configure via `initDatabase(options)` / env.
- **`setDatabase()` does not clean up.** It swaps the global reference without closing the
  previous pool — passing `undefined` leaks connections. Use `closeDatabase()` for real
  teardown.
- **Don't manually call `reportDatabaseError()` for repo/transactional queries** — they are
  already hooked. Manual calls there get **deduped** anyway (WeakSet across the error chain),
  so a single failure counts once. Only feed it for raw `db.execute(...)` outside those
  paths.
- **`reportDatabaseError()` is fire-and-forget** — do not `await` it. It never throws and
  triggers the rebuild in the background.
- **Reconnect tuning is load-time only.** `DB_RECONNECT_ERROR_THRESHOLD` /
  `DB_RECONNECT_ERROR_WINDOW_MS` are read once at import; changing `process.env` at runtime
  has no effect.
- **Pool/retry env vars bypass the config schema.** `config.ts` reads them from raw
  `process.env` (with `0`-min integer parsing), so they are NOT in the
  `@spfn/core/config` env schema and won't show up in `spfn env validate`.
- **Closing wins over reconnect.** Reconnect paths re-check `isClosing` before the swap; if
  `closeDatabase()` started mid-rebuild the fresh pool is torn down instead of leaked. Don't
  race `closeDatabase()` with `forceReconnectDatabase()` expecting the rebuild to survive.
- **`isReplica` flips after a fallback.** If the replica was up at init but the pool later
  rebuilds without it (or vice versa), topology can change — read it live, don't cache.

---

## Complete example

```typescript
// src/server/db.ts
import { initDatabase, getDatabase, getDatabaseInfo, closeDatabase } from '@spfn/core/db';

export async function startDb()
{
    await initDatabase({
        pool:        { max: 30, idleTimeout: 30 },
        healthCheck: { enabled: true, interval: 30000, reconnect: true, maxRetries: 5, retryInterval: 5000 },
        monitoring:  { enabled: true, slowThreshold: 500 },
    });

    const info = getDatabaseInfo();
    if (info.isReplica)
    {
        console.log('Primary + Replica active');
    }
}

export function db()      { return getDatabase('write'); }
export function dbRead()  { return getDatabase('read'); }

process.on('SIGTERM', async () =>
{
    await closeDatabase();
    process.exit(0);
});
```

```typescript
// Raw query outside BaseRepository / @Transactional — opt into the fast-path manually:
import { getDatabase, reportDatabaseError } from '@spfn/core/db';
import { sql } from 'drizzle-orm';

try
{
    await getDatabase().execute(sql`SELECT now()`);
}
catch (error)
{
    reportDatabaseError(error);   // fire-and-forget; no-op for non-connection errors
    throw error;
}
```

---

## Types reference

```typescript
type DbConnectionType = 'read' | 'write';

interface DatabaseClients {
    write?:       PostgresJsDatabase;   // primary (or both if no replica)
    read?:        PostgresJsDatabase;   // replica (falls back to write)
    writeClient?: Sql;                  // raw client, for cleanup
    readClient?:  Sql;
}

interface PoolConfig  { max: number; idleTimeout: number; }                       // seconds
interface RetryConfig { maxRetries: number; initialDelay: number; maxDelay: number; factor: number; }

interface DatabaseOptions {            // initDatabase() argument
    pool?:        Partial<PoolConfig>;
    healthCheck?: Partial<HealthCheckConfig>;
    monitoring?:  Partial<MonitoringConfig>;
}
```

## Related

- [@spfn/core/db](../README.md) — DB module (helpers, schema, transaction, repository)
- [@spfn/core/config](../../config/README.md) — env schema for `DATABASE_*` / `DB_*`
- [@spfn/core/env](../../env/README.md) — env parsing/validation primitives
- [@spfn/core/logger](../../logger/README.md) — structured logging
