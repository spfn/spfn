# @spfn/core/cache - Cache Infrastructure (Valkey/Redis)

Global cache instance management with automatic environment variable detection and graceful degradation.

## Core Components

```
cache/
├── index.ts                    # Module exports
├── cache-factory.ts            # Cache client factory with env detection
├── cache-manager.ts            # Singleton cache instance manager
└── __tests__/
    ├── cache-factory.test.ts   # Factory tests (31 tests)
    ├── cache-manager.test.ts   # Manager tests (48 tests)
    └── cache.integration.test.ts # Integration tests (20 tests)
```

## What is Valkey?

**Valkey** is a high-performance, open-source key-value store forked from Redis 7.2.4. It maintains **100% protocol compatibility** with Redis, allowing seamless migration.

- 🔗 Website: https://valkey.io
- 📦 Drop-in Redis replacement
- ⚡ Same protocol, same commands, same client libraries
- 🆓 Truly open-source (BSD 3-Clause)

---

## Features

- ✅ **Zero-Config**: Works with environment variables only
- ✅ **Valkey & Redis**: Full support for both (100% compatible)
- ✅ **Graceful Degradation**: Runs in disabled mode if cache unavailable
- ✅ **Singleton Pattern**: One connection shared across all modules
- ✅ **Master-Replica Support**: Automatic read/write separation
- ✅ **Multiple Patterns**: Single, Master-Replica, Sentinel, Cluster
- ✅ **TLS/SSL Support**: `rediss://` protocol (Valkey uses same protocol as Redis)
- ✅ **Optional Dependency**: Works without cache library installed
- ✅ **Connection Testing**: Automatic `ping()` before accepting instances
- ✅ **Auto-initialization**: Called by `startServer()`
- ✅ **Disabled Mode**: Application continues without cache

---

## Quick Start

### 1. Install Cache Library (Optional)

```bash
# For Valkey (recommended)
pnpm install ioredis

# ioredis works with both Valkey and Redis
```

### 2. Configure Environment

```bash
# .env
CACHE_URL=redis://localhost:6379

# Or with Valkey (100% compatible, same protocol)
CACHE_URL=redis://localhost:6379
```

### 3. Auto-initialization

```typescript
import { startServer } from '@spfn/core';

// Cache automatically initialized (or disabled if unavailable)
await startServer();
```

### 4. Using Cache in Your Code

```typescript
import { getCache, getCacheRead, isCacheDisabled } from '@spfn/core/cache';

// Write operations
const cache = getCache();
if (cache) {
  await cache.set('user:123', JSON.stringify({ name: 'John' }));
} else {
  // Cache disabled - handle gracefully
  console.log('Cache unavailable, proceeding without cache');
}

// Read operations (uses replica if available)
const cacheRead = getCacheRead();
if (cacheRead) {
  const data = await cacheRead.get('user:123');
}

// Check if cache is disabled
if (isCacheDisabled()) {
  // Use alternative strategy (e.g., database, in-memory)
  return await fetchFromDatabase();
}
```

---

## Environment Variables

All environment variables use the `CACHE_*` prefix. Both Valkey and Redis use the same `redis://` or `rediss://` protocol.

### Single Instance (Most Common)

```bash
# Single cache instance (Valkey or Redis)
CACHE_URL=redis://localhost:6379
CACHE_URL=redis://:password@localhost:6379  # With auth
CACHE_URL=rediss://secure.cache.com:6380    # TLS
CACHE_TLS_REJECT_UNAUTHORIZED=false         # Self-signed certs
```

### Master-Replica Pattern

```bash
# Read/write separation
CACHE_WRITE_URL=redis://master:6379
CACHE_READ_URL=redis://replica:6379
```

### Sentinel Pattern (High Availability)

```bash
CACHE_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379
CACHE_MASTER_NAME=mymaster
CACHE_PASSWORD=secret
```

### Cluster Pattern (Horizontal Scaling)

```bash
CACHE_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
CACHE_PASSWORD=secret
```

**Note:** Valkey and Redis both use the `redis://` protocol. They are 100% compatible at the protocol level.

---

## API Reference

### `getCache()`

Get global cache write instance.

```typescript
import { getCache } from '@spfn/core/cache';

const cache = getCache();
if (cache) {
  await cache.set('key', 'value');
  await cache.del('old-key');
  await cache.incr('counter');
}
```

**Returns:** `Redis | Cluster | undefined`

---

### `getCacheRead()`

Get global cache read instance (falls back to write if no replica).

```typescript
import { getCacheRead } from '@spfn/core/cache';

const cache = getCacheRead();
if (cache) {
  const value = await cache.get('key');
  const users = await cache.lrange('users', 0, -1);
}
```

**Returns:** `Redis | Cluster | undefined`

**Use Cases:**
- Read-heavy operations
- Analytics queries
- Caching lookups
- Session retrieval

---

### `isCacheDisabled()`

Check if cache is disabled (connection failed or not configured).

```typescript
import { isCacheDisabled } from '@spfn/core/cache';

if (isCacheDisabled()) {
  // Use alternative strategy
  return await fetchFromDatabase();
}

// Use cache normally
const cache = getCache();
await cache?.set('key', 'value');
```

**Returns:** `boolean`

**When is cache disabled?**
- No environment variables configured
- ioredis library not installed
- Connection to cache server failed
- `ping()` test failed during initialization

---

### `initCache()`

Initialize cache from environment variables. Automatically called by `startServer()`.

```typescript
import { initCache } from '@spfn/core/cache';

// Manual initialization (not needed if using startServer)
const { write, read, disabled } = await initCache();

if (!disabled) {
  console.log('Cache available');
} else {
  console.log('Cache disabled - running without cache');
}
```

**Returns:** `Promise<{ write?: Redis | Cluster; read?: Redis | Cluster; disabled: boolean }>`

**Behavior:**
- Tests connection with `ping()`
- Returns existing instances if already initialized
- Logs connection status or disabled mode
- Cleans up failed connections
- Sets disabled flag on failure

---

### `closeCache()`

Close all cache connections and cleanup. Called during graceful shutdown.

```typescript
import { closeCache } from '@spfn/core/cache';

// During graceful shutdown
process.on('SIGTERM', async () => {
  await closeCache();
  process.exit(0);
});
```

**Returns:** `Promise<void>`

---

### `setCache(write, read?)`

Set global cache instances manually (for testing or custom configuration).

```typescript
import { setCache } from '@spfn/core/cache';
import Redis from 'ioredis';

const write = new Redis('redis://master:6379');
const read = new Redis('redis://replica:6379');
setCache(write, read);
```

**Parameters:**
- `write: Redis | Cluster | undefined` - Write instance
- `read?: Redis | Cluster | undefined` - Read instance (optional, defaults to write)

---

### `getCacheInfo()`

Get cache connection information (for debugging).

```typescript
import { getCacheInfo } from '@spfn/core/cache';

const info = getCacheInfo();
console.log(info);
// {
// hasWrite: true,
//   hasRead: true,
//   isReplica: true,  // true if read instance is different from write
//   disabled: false
// }
```

**Returns:** `{ hasWrite: boolean; hasRead: boolean; isReplica: boolean; disabled: boolean }`

---

### `createCacheFromEnv()`

Create cache client(s) from environment variables. Low-level factory function.

```typescript
import { createCacheFromEnv } from '@spfn/core/cache';

const { write, read } = await createCacheFromEnv();
if (write) {
  await write.ping();
  console.log('Cache connected');
}
```

**Returns:** `Promise<CacheClients>` (`{ write?: Redis | Cluster; read?: Redis | Cluster }`)

**Supported Patterns (Priority Order):**
1. Single instance: `CACHE_URL`
2. Master-Replica: `CACHE_WRITE_URL` + `CACHE_READ_URL`
3. Sentinel: `CACHE_SENTINEL_HOSTS` + `CACHE_MASTER_NAME`
4. Cluster: `CACHE_CLUSTER_NODES`

---

### `createSingleCacheFromEnv()`

Create single cache client from environment variables. Only returns write instance.

```typescript
import { createSingleCacheFromEnv } from '@spfn/core/cache';

const cache = await createSingleCacheFromEnv();
if (cache) {
  await cache.set('key', 'value');
}
```

**Returns:** `Promise<Redis | Cluster | undefined>`

---

### Backward Compatibility Aliases

For projects migrating from Redis-specific naming:

```typescript
import {
  createRedisFromEnv,      // Alias for createCacheFromEnv
  createSingleRedisFromEnv // Alias for createSingleCacheFromEnv
} from '@spfn/core/cache';

import type {
  RedisClients             // Alias for CacheClients
} from '@spfn/core/cache';
```

---

## Type Exports

```typescript
import type { CacheClients, RedisClients } from '@spfn/core/cache';

interface CacheClients {
  /** Primary cache for writes (or both read/write if no replica) */
  write?: Redis | Cluster;
  /** Replica cache for reads (optional, falls back to write) */
  read?: Redis | Cluster;
}

// RedisClients is an alias for CacheClients (backward compatibility)
type RedisClients = CacheClients;
```

---

## Graceful Degradation (Disabled Mode)

The cache module is designed to never break your application. When cache is unavailable, it operates in **disabled mode**:

### Automatic Disabled Mode Triggers

1. **No Configuration**: No `CACHE_URL` environment variable set
2. **Library Missing**: ioredis not installed
3. **Connection Failed**: Cannot connect to cache server
4. **Ping Failed**: Cache server not responding

### Handling Disabled Mode

```typescript
import { getCache, isCacheDisabled } from '@spfn/core/cache';

// Pattern 1: Check before using
const cache = getCache();
if (cache) {
  await cache.set('key', 'value');
} else {
  // Gracefully skip caching
  console.log('Cache unavailable, proceeding without cache');
}

// Pattern 2: Check disabled flag
if (isCacheDisabled()) {
  // Use alternative strategy
  return await database.query('SELECT * FROM users');
}

// Pattern 3: Optional chaining
await getCache()?.set('key', 'value');  // Safe, won't throw
```

### Logging in Disabled Mode

```typescript
// Info level - disabled mode activated
[cache] No cache configuration found - running without cache
[cache] Cache disabled - no configuration or library not installed

// Warn level - library missing
[cache] Cache client library not installed
        suggestion: Install ioredis to enable cache: pnpm install ioredis
        mode: disabled

// Error level - connection failed
[cache] Cache connection failed - running in disabled mode
        mode: disabled
```

---

## Advanced Usage

### Master-Replica Pattern

```typescript
import { getCache, getCacheRead } from '@spfn/core/cache';

// Write to master
async function updateUser(id: string, data: any) {
  const cache = getCache();
  if (cache) {
    await cache.set(`user:${id}`, JSON.stringify(data));
  }
}

// Read from replica
async function getUser(id: string) {
  const cache = getCacheRead();
  if (cache) {
    const data = await cache.get(`user:${id}`);
    return data ? JSON.parse(data) : null;
  }
  return null;
}
```

### Testing with Mock Cache

```typescript
import { setCache, isCacheDisabled } from '@spfn/core/cache';
import { vi } from 'vitest';

describe('My Feature', () => {
  beforeAll(() => {
    const mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      quit: vi.fn().mockResolvedValue('OK'),
    };
    setCache(mockCache as any);
  });

  afterAll(async () => {
    setCache(undefined);
  });

  it('should use cache when available', () => {
    expect(isCacheDisabled()).toBe(false);
  });
});
```

### Testing Disabled Mode

```typescript
import { setCache, isCacheDisabled } from '@spfn/core/cache';

describe('Disabled Mode', () => {
  beforeAll(() => {
    setCache(undefined); // Simulate disabled cache
  });

  it('should handle disabled cache gracefully', () => {
    expect(isCacheDisabled()).toBe(true);
    // Your code should still work without cache
  });
});
```

### Custom Configuration

```typescript
import { setCache } from '@spfn/core/cache';
import Redis from 'ioredis';

// Custom Valkey configuration
const cache = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
  maxRetriesPerRequest: 3,
});

setCache(cache);
```

---

## Using Valkey

Valkey is 100% compatible with Redis. Simply point to your Valkey server:

```bash
# .env
CACHE_URL=redis://your-valkey-server:6379
```

```typescript
import { getCache } from '@spfn/core/cache';

const cache = getCache();
await cache?.set('key', 'value');  // Same API as Redis!
```

No code changes needed - Valkey uses the same protocol as Redis.

---

## Architecture

### Singleton Pattern

All modules share the same cache instance:

```typescript
// @spfn/auth
import { getCache } from '@spfn/core/cache';
const cache = getCache();  // Same instance

// @spfn/session
import { getCache } from '@spfn/core/cache';
const cache = getCache();  // Same instance

// Your app
import { getCache } from '@spfn/core/cache';
const cache = getCache();  // Same instance
```

### Dynamic Import

Cache library is loaded only when needed:

```typescript
// No CACHE_URL → ioredis never imported, disabled mode
// With CACHE_URL → ioredis dynamically loaded at runtime
```

### Optional Dependency

```json
{
  "peerDependenciesMeta": {
    "ioredis": {
      "optional": true
    }
  }
}
```

Users install ioredis only when needed:

```bash
# Without cache
pnpm install @spfn/core  # Works fine, cache disabled

# With cache
pnpm install @spfn/core ioredis  # Cache enabled
```

---

## Troubleshooting

### ⚠️ Warning: "Cache client library not installed"

**Cause:** ioredis not installed.

**Solution:**
```bash
pnpm install ioredis
```

**Note:** Application continues in disabled mode - not a breaking error.

### ❌ Error: "Cache connection failed"

**Cause:** Cannot connect to cache server.

**Check:**
1. Cache server is running
2. Host/port is correct
3. Network/firewall allows connection
4. Password is correct (if authentication enabled)

**Recovery:** Application automatically enters disabled mode and continues.

### TLS Certificate Issues

```bash
# For self-signed certificates
CACHE_TLS_REJECT_UNAUTHORIZED=false
```

---

## Performance Tips

### 1. Use Read Replicas

```bash
# Separate read/write workloads
CACHE_WRITE_URL=redis://master:6379
CACHE_READ_URL=redis://replica:6379
```

```typescript
// Writes go to master
await getCache()?.set('key', 'value');

// Reads from replica (reduces master load)
await getCacheRead()?.get('key');
```

### 2. Pipeline Commands

```typescript
const cache = getCache();
if (cache) {
  const pipeline = cache.pipeline();
  pipeline.set('key1', 'value1');
  pipeline.set('key2', 'value2');
  pipeline.set('key3', 'value3');
  await pipeline.exec();
}
```

### 3. Use Lua Scripts for Atomic Operations

```typescript
const cache = getCache();
if (cache) {
  await cache.eval(
    `
    local current = redis.call('GET', KEYS[1])
    if current and tonumber(current) < tonumber(ARGV[1]) then
      redis.call('SET', KEYS[1], ARGV[1])
      return 1
    end
    return 0
    `,
    1,
    'max-value',
    '100'
  );
}
```

---

## Related

- [Valkey Documentation](https://valkey.io/docs/) - Valkey official docs
- [ioredis Documentation](https://github.com/redis/ioredis) - Full client API
- [FRAMEWORK_PHILOSOPHY.md](../../../../FRAMEWORK_PHILOSOPHY.md) - Infrastructure singleton pattern
- [@spfn/core](../../README.md) - Main package documentation