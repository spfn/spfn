# @spfn/core/cache - Cache Infrastructure (Valkey/Redis)

Global cache instance management with automatic environment variable detection and graceful degradation.

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
- ✅ **TLS/SSL Support**: `valkeys://` and `rediss://` protocols
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
# .env - Modern (Valkey)
VALKEY_URL=valkey://localhost:6379

# Or use generic cache naming
CACHE_URL=valkey://localhost:6379

# Or legacy (Redis - still supported)
REDIS_URL=redis://localhost:6379
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

### Modern (Valkey - Recommended)

```bash
# Single instance
VALKEY_URL=valkey://localhost:6379
VALKEY_URL=valkey://:password@localhost:6379  # With auth
VALKEY_URL=valkeys://secure.valkey.io:6380    # TLS
VALKEY_TLS_REJECT_UNAUTHORIZED=false          # Self-signed certs

# Master-Replica (read/write separation)
VALKEY_WRITE_URL=valkey://master:6379
VALKEY_READ_URL=valkey://replica:6379

# Sentinel (high availability)
VALKEY_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379
VALKEY_MASTER_NAME=mymaster
VALKEY_PASSWORD=secret

# Cluster (horizontal scaling)
VALKEY_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
VALKEY_PASSWORD=secret
```

### Generic Cache Naming

```bash
# Works with both Valkey and Redis
CACHE_URL=valkey://localhost:6379
CACHE_WRITE_URL=valkey://master:6379
CACHE_READ_URL=valkey://replica:6379
```

### Legacy (Redis - Backward Compatibility)

```bash
# Still supported for existing deployments
REDIS_URL=redis://localhost:6379
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379
```

### Priority Order

When multiple configurations exist:
1. **VALKEY_\*** (highest priority)
2. **CACHE_\***
3. **REDIS_\*** (legacy, lowest priority)

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

const write = new Redis('valkey://master:6379');
const read = new Redis('valkey://replica:6379');
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

## Graceful Degradation (Disabled Mode)

The cache module is designed to never break your application. When cache is unavailable, it operates in **disabled mode**:

### Automatic Disabled Mode Triggers

1. **No Configuration**: No `VALKEY_URL` or `REDIS_URL` set
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

## Migration from Redis to Valkey

Valkey is 100% compatible with Redis. No code changes needed!

### Before (Redis)

```bash
# .env
REDIS_URL=redis://localhost:6379
```

```typescript
import { getRedis } from '@spfn/core/cache';  // Still works!

const redis = getRedis();
await redis?.set('key', 'value');
```

### After (Valkey)

```bash
# .env
VALKEY_URL=valkey://localhost:6379
```

```typescript
import { getCache } from '@spfn/core/cache';  // Modern

const cache = getCache();
await cache?.set('key', 'value');  // Same API!
```

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
// No VALKEY_URL → ioredis never imported, disabled mode
// With VALKEY_URL → ioredis dynamically loaded at runtime
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

### Configuration Not Working

**Check Priority Order:**
1. `VALKEY_URL` > `CACHE_URL` > `REDIS_URL`
2. `VALKEY_WRITE_URL` > `CACHE_WRITE_URL` > `REDIS_WRITE_URL`

**Example:**
```bash
# This will use VALKEY_URL (higher priority)
VALKEY_URL=valkey://localhost:6379
REDIS_URL=redis://localhost:6380  # Ignored
```

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
VALKEY_TLS_REJECT_UNAUTHORIZED=false
```

---

## Performance Tips

### 1. Use Read Replicas

```bash
# Separate read/write workloads
VALKEY_WRITE_URL=valkey://master:6379
VALKEY_READ_URL=valkey://replica:6379
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