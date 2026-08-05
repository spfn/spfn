# @spfn/core/cache — singleton Valkey/Redis connection manager (graceful-degrading)

Manages a process-global cache connection (ioredis `Redis | Cluster`) built from `CACHE_*`
env vars. `getCache()` / `getCacheRead()` hand you the **raw ioredis client** — there is no
typed wrapper. When no config is present, the library is missing, or the connection fails,
the module runs in **disabled mode** (getters return `undefined`) instead of throwing.

Valkey is a Redis fork (7.2.4 base) with 100% protocol compatibility, so `redis://` /
`rediss://` URLs and the ioredis client work unchanged against either.

## Import paths

```typescript
import {
    getCache, getCacheRead, isCacheDisabled,
    setCache, initCache, closeCache, getCacheInfo,
    createCacheFromEnv, createSingleCacheFromEnv,
} from '@spfn/core/cache';
```

Single entry point — there is no `@spfn/core/cache/*` subpath. `ioredis` is an **optional
peer dependency** (`peerDependenciesMeta.ioredis.optional`); install it only when you want
cache enabled. It is `import()`-ed dynamically, so without it the bundle never references it.

---

## Public API (complete)

Connection manager (`cache-manager.ts`):

| Export | Signature | Notes |
|--------|-----------|-------|
| `getCache()` | `() => Redis \| Cluster \| undefined` | Write instance. `undefined` if disabled/uninit. |
| `getCacheRead()` | `() => Redis \| Cluster \| undefined` | Read instance; falls back to write (`state.read ?? state.write`). |
| `isCacheDisabled()` | `() => boolean` | True when not configured / lib missing / connect failed. |
| `setCache(write, read?)` | `(Redis\|Cluster\|undefined, Redis\|Cluster\|undefined?) => void` | Manual/test injection. `read` defaults to `write`. Sets `disabled = !write`. |
| `initCache()` | `() => Promise<{ write?, read?, disabled: boolean }>` | `ping()`-tests then registers. Called by `startServer()`. |
| `closeCache()` | `() => Promise<void>` | `quit()`s connections, resets to disabled. Graceful-shutdown safe. |
| `getCacheInfo()` | `() => { hasWrite: boolean; hasRead: boolean; isReplica: boolean; disabled: boolean }` | Debug snapshot. |

Factory (`cache-factory.ts`):

| Export | Signature | Notes |
|--------|-----------|-------|
| `createCacheFromEnv()` | `() => Promise<CacheClients>` | Builds client(s) from env. Does **not** `ping` or register globally. |
| `createSingleCacheFromEnv()` | `() => Promise<Redis \| Cluster \| undefined>` | Returns only `write` from the above. |

Aliases & types:

- `createRedisFromEnv` = `createCacheFromEnv`, `createSingleRedisFromEnv` = `createSingleCacheFromEnv` (backward-compat).
- `type CacheClients = { write?: Redis \| Cluster; read?: Redis \| Cluster }`.
- `type RedisClients = CacheClients` (alias).

> **No such API.** There is **no** `cache` singleton object and **no** typed convenience
> wrapper. `cache.get<T>(...)`, `cache.set(key, value, { ttl })`, `cache.exists`,
> `cache.prefix(...)`, `cache.hset/hget/hgetall`, `cache.lpush/lrange` **as methods on a
> `cache` export do not exist** — older docs showing `import { cache } from '@spfn/core/cache'`
> are stale. You call those Redis commands directly on the ioredis instance returned by
> `getCache()` (e.g. `getCache()?.set(...)`, `getCache()?.hset(...)`). Likewise the env var is
> **`CACHE_URL`**, not `REDIS_URL` — `REDIS_URL` is ignored by the factory.

---

## Quick Start

```typescript
import { startServer } from '@spfn/core/server';

await startServer(); // calls initCache() — cache enabled if CACHE_URL is set, else disabled
```

```typescript
import { getCache, getCacheRead, isCacheDisabled } from '@spfn/core/cache';

// Write (raw ioredis client). Always null-check — may be undefined in disabled mode.
const cache = getCache();
if (cache)
{
    await cache.set('user:123', JSON.stringify({ name: 'John' }));
}

// Read (replica if configured, else same as write)
const value = await getCacheRead()?.get('user:123');
const user = value ? JSON.parse(value) : null;

// Or branch on disabled mode
if (isCacheDisabled())
{
    return fetchFromDatabase(); // alternative path
}
```

Install ioredis to enable cache (optional):

```bash
pnpm add ioredis   # ioredis speaks both Valkey and Redis
```

---

## Environment variables

`createCacheFromEnv()` reads only `CACHE_*` vars, in this priority order:

| Pattern | Vars | Result |
|---------|------|--------|
| Single (most common) | `CACHE_URL` | one client used for both read & write |
| Master-Replica | `CACHE_WRITE_URL` + `CACHE_READ_URL` (both required) | separate write/read clients |
| Sentinel | `CACHE_SENTINEL_HOSTS` + `CACHE_MASTER_NAME` (+ `CACHE_PASSWORD`) | one client via sentinels |
| Cluster | `CACHE_CLUSTER_NODES` (+ `CACHE_PASSWORD`) | one `Cluster` client |
| TLS | `CACHE_TLS_REJECT_UNAUTHORIZED` | applied when URL is `rediss://` |

```bash
# Single
CACHE_URL=redis://localhost:6379
CACHE_URL=redis://:<password>@host:6379   # with auth (do not commit real secrets)
CACHE_URL=rediss://secure.host:6380       # TLS
CACHE_TLS_REJECT_UNAUTHORIZED=false       # accept self-signed cert (rediss:// only)

# Master-Replica (BOTH must be set, else this pattern is skipped)
CACHE_WRITE_URL=redis://master:6379
CACHE_READ_URL=redis://replica:6379

# Sentinel
CACHE_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379
CACHE_MASTER_NAME=mymaster

# Cluster
CACHE_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
```

`hasCacheConfig()` checks `CACHE_URL`, `CACHE_WRITE_URL`, `CACHE_READ_URL`,
`CACHE_SENTINEL_HOSTS`, or `CACHE_CLUSTER_NODES`. If none are set, the factory short-circuits
to `{ write: undefined, read: undefined }` (disabled) **without importing ioredis**.

---

## Lifecycle: factory vs manager

- **`createCacheFromEnv()`** is pure construction: it builds and returns ioredis client(s)
  but never pings them and never touches global state. Use it for custom wiring/tests.
- **`initCache()`** is the managed path: it calls the factory, **`ping()`-tests** write (and
  read, if distinct), and only then registers into the global singleton. On ping failure it
  `quit()`s the connections and sets `disabled = true`. `startServer()` calls this for you.
- The singleton lives on `globalThis[Symbol.for('@spfn/core:cache')]`, so it survives the
  CJS/ESM dual-package hazard (one shared state even if the module loads twice). All
  consumers (`@spfn/auth`, your app, etc.) share the exact same connection.

```typescript
import { initCache, getCacheInfo, closeCache } from '@spfn/core/cache';

const { disabled } = await initCache();   // idempotent: returns existing state if already init'd
console.log(getCacheInfo());              // { hasWrite, hasRead, isReplica, disabled }

process.on('SIGTERM', async () =>
{
    await closeCache();
    process.exit(0);
});
```

`initCache()` is idempotent via `if (state.write) return …` — calling it again when already
connected returns the current state without re-pinging.

---

## Using the client (raw ioredis)

`getCache()` returns a standard ioredis `Redis | Cluster`. All commands are the ioredis API,
not an SPFN wrapper — values are strings/buffers, **no automatic JSON serialization**, and
**TTL is the ioredis native form** (`'EX', seconds` or `'PX', ms`), not a `{ ttl }` option.

```typescript
const cache = getCache();
if (cache)
{
    // Strings + TTL (seconds via EX; milliseconds via PX)
    await cache.set('session:abc', JSON.stringify(data), 'EX', 3600); // expires in 1h
    await cache.set('flag', '1', 'PX', 500);                          // expires in 500ms
    await cache.expire('session:abc', 60);                            // (re)set TTL, seconds
    const ttl = await cache.ttl('session:abc');                       // seconds remaining

    // Existence / delete / counters
    await cache.exists('session:abc');   // 1 | 0
    await cache.del('session:abc');
    await cache.incr('counter');

    // Hashes
    await cache.hset('user:123', 'name', 'John');
    await cache.hget('user:123', 'name');
    await cache.hgetall('user:123');     // Record<string,string>

    // Lists
    await cache.rpush('queue', 'item');
    await cache.lrange('queue', 0, -1);
}

// Reads can target the replica
await getCacheRead()?.get('session:abc');
```

For full command coverage see the ioredis docs — anything ioredis supports works here.

---

## Testing

`setCache()` injects instances (real or mock) without touching env or pinging:

```typescript
import { setCache, isCacheDisabled } from '@spfn/core/cache';
import { vi } from 'vitest';

beforeAll(() =>
{
    setCache({ get: vi.fn(), set: vi.fn(), del: vi.fn(),
               ping: vi.fn().mockResolvedValue('PONG'),
               quit: vi.fn().mockResolvedValue('OK') } as any);
});

afterAll(() => setCache(undefined)); // undefined → disabled mode

it('reports enabled', () => expect(isCacheDisabled()).toBe(false));
```

`setCache(undefined)` flips the module to disabled mode (`disabled = !write`), which is the
simplest way to exercise your degradation path.

---

## Pitfalls & anti-patterns

- **There is no `cache` object / typed wrapper.** Don't write
  `import { cache } from '@spfn/core/cache'` or `cache.get<T>(k)` / `cache.set(k, v, { ttl })`
  / `cache.prefix(...)`. Use `getCache()` / `getCacheRead()` and call ioredis commands on the
  returned client.
- **Always null-check the getter.** `getCache()` / `getCacheRead()` return `undefined` in
  disabled mode. Use optional chaining (`getCache()?.set(...)`) or an `if (cache)` guard —
  calling a method on `undefined` throws.
- **No automatic serialization.** ioredis stores strings/buffers. `JSON.stringify` on write
  and `JSON.parse` on read yourself; passing an object stores `"[object Object]"`.
- **TTL is ioredis-native, not `{ ttl }`.** Use `set(key, val, 'EX', seconds)` /
  `'PX', ms`, or a separate `expire(key, seconds)`. `EX` is seconds, `PX` is milliseconds —
  don't mix the units up. There is no SPFN `{ ttl }` option object.
- **Env var is `CACHE_URL`, not `REDIS_URL`.** The factory only inspects `CACHE_*` keys;
  `REDIS_URL` (and other `REDIS_*`) are ignored and leave you in disabled mode. (The
  manager's JSDoc mentioning `VALKEY_*` / legacy `REDIS_*` is aspirational — the factory does
  not read them.)
- **Master-Replica needs BOTH URLs.** Setting only `CACHE_WRITE_URL` (without
  `CACHE_READ_URL`) skips the replica branch; if `CACHE_URL` is also unset you get disabled
  mode. Set both, or just use `CACHE_URL`.
- **`createCacheFromEnv()` does not ping or register.** It returns possibly-unhealthy clients
  and does not populate the global singleton. For the validated, shared instance use
  `initCache()` (or `startServer()`); `getCache()` only sees instances registered via
  `initCache()` / `setCache()`.
- **`closeCache()` is a no-op while disabled** and resets state to disabled afterward. After
  closing, `getCache()` returns `undefined` until the next `initCache()` — don't cache the
  client reference across a shutdown.
- **Secrets in URLs.** `CACHE_URL` / `CACHE_PASSWORD` carry credentials — keep them in
  gitignored env files (`.env.server`), never commit real values. The factory masks the
  password in its debug log (`:***@`); your own logging should do the same.

---

## Complete example

```typescript
// cache-aside with the raw client + graceful degradation
import { getCache, getCacheRead } from '@spfn/core/cache';

async function getUser(id: string): Promise<User | null>
{
    const cached = await getCacheRead()?.get(`user:${id}`);
    if (cached)
    {
        return JSON.parse(cached) as User;
    }

    const user = await userRepo.findById(id);
    if (user)
    {
        // 1h TTL; manual JSON serialization. No-op if cache disabled (optional chaining).
        await getCache()?.set(`user:${id}`, JSON.stringify(user), 'EX', 3600);
    }
    return user;
}

async function updateUser(id: string, data: Partial<User>): Promise<User>
{
    const user = await userRepo.update(id, data);
    await getCache()?.del(`user:${id}`); // invalidate
    return user;
}
```

```typescript
// manual wiring without env (e.g. custom config / one-off scripts)
import { setCache, getCache, closeCache } from '@spfn/core/cache';
import Redis from 'ioredis';

setCache(new Redis({ host: 'localhost', port: 6379, db: 0 }));
await getCache()?.set('k', 'v');
await closeCache();
```

---

## Types reference

```typescript
interface CacheClients
{
    write?: Redis | Cluster;  // primary (also read if no replica)
    read?:  Redis | Cluster;  // replica; getCacheRead() falls back to write
}
type RedisClients = CacheClients; // backward-compat alias

// getCacheInfo() return shape
{ hasWrite: boolean; hasRead: boolean; isReplica: boolean; disabled: boolean }
```

`Redis` / `Cluster` are ioredis types (`import('ioredis')`).

## Related

- [@spfn/core/env](../env/README.md) — defining/validating `CACHE_*` vars
- [@spfn/core/logger](../logger/README.md) — the `@spfn/core:cache` child logger this module uses
- [@spfn/core](../../README.md) — main package documentation
- [ioredis](https://github.com/redis/ioredis) — full command/client API for the returned instance
- [Valkey](https://valkey.io/docs/) — protocol-compatible Redis fork
