# @spfn/core/cache - Redis Infrastructure

Global Redis instance management with automatic environment variable detection.

## Features

- ✅ **Zero-Config**: Works with just environment variables
- ✅ **Singleton Pattern**: One Redis connection shared across all modules
- ✅ **Master-Replica Support**: Automatic read/write separation
- ✅ **Multiple Patterns**: Single, Master-Replica, Sentinel, Cluster
- ✅ **TLS/SSL Support**: `rediss://` protocol with configurable certificate validation
- ✅ **Graceful Degradation**: Optional dependency with memory fallback
- ✅ **Connection Testing**: Automatic `ping()` before accepting instances
- ✅ **Auto-initialization**: Called by `startServer()`

---

## Quick Start

### 1. Single Redis Instance (Most Common)

```bash
# .env
REDIS_URL=redis://localhost:6379
```

```typescript
import { startServer } from '@spfn/core';

// Redis automatically initialized
await startServer();
```

### 2. Using Redis in Your Code

```typescript
import { getRedis, getRedisRead } from '@spfn/core';

// Write operations
const redis = getRedis();
if (redis) {
  await redis.set('user:123', JSON.stringify({ name: 'John' }));
}

// Read operations (uses replica if available)
const redisRead = getRedisRead();
if (redisRead) {
  const data = await redisRead.get('user:123');
}
```

---

## Environment Variables

### Single Instance
```bash
REDIS_URL=redis://localhost:6379

# With authentication
REDIS_URL=redis://:password@localhost:6379

# TLS (secure)
REDIS_URL=rediss://secure.redis.com:6380
REDIS_TLS_REJECT_UNAUTHORIZED=false  # For self-signed certificates
```

### Master-Replica (Read/Write Separation)
```bash
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379
```

### Sentinel (High Availability)
```bash
REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379,sentinel3:26379
REDIS_MASTER_NAME=mymaster
REDIS_PASSWORD=secret
```

### Cluster (Horizontal Scaling)
```bash
REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
REDIS_PASSWORD=secret
```

### Priority Order

When multiple configurations exist:
1. **Single Instance** (`REDIS_URL` only)
2. **Master-Replica** (`REDIS_WRITE_URL` + `REDIS_READ_URL`)
3. **Sentinel** (`REDIS_SENTINEL_HOSTS` + `REDIS_MASTER_NAME`)
4. **Cluster** (`REDIS_CLUSTER_NODES`)

---

## API Reference

### `getRedis()`

Get global Redis write instance.

```typescript
import { getRedis } from '@spfn/core';

const redis = getRedis();
if (redis) {
  await redis.set('key', 'value');
  await redis.del('old-key');
  await redis.incr('counter');
}
```

**Returns:** `Redis | Cluster | undefined`

---

### `getRedisRead()`

Get global Redis read instance (falls back to write if no replica).

```typescript
import { getRedisRead } from '@spfn/core';

const redis = getRedisRead();
if (redis) {
  const value = await redis.get('key');
  const users = await redis.lrange('users', 0, -1);
}
```

**Returns:** `Redis | Cluster | undefined`

**Use Cases:**
- Read-heavy operations
- Analytics queries
- Caching lookups
- Session retrieval

---

### `initRedis()`

Initialize Redis from environment variables. Automatically called by `startServer()`.

```typescript
import { initRedis } from '@spfn/core';

// Manual initialization (not needed if using startServer)
const { write, read } = await initRedis();

if (write) {
  console.log('Redis initialized');
}
```

**Returns:** `Promise<{ write?: Redis | Cluster; read?: Redis | Cluster }>`

**Behavior:**
- Tests connection with `ping()`
- Returns existing instances if already initialized
- Logs connection status
- Cleans up failed connections

---

### `closeRedis()`

Close all Redis connections and cleanup. Called during graceful shutdown.

```typescript
import { closeRedis } from '@spfn/core';

// During graceful shutdown
process.on('SIGTERM', async () => {
  await closeRedis();
  process.exit(0);
});
```

**Returns:** `Promise<void>`

---

### `setRedis(write, read?)`

Set global Redis instances manually (for testing or custom configuration).

```typescript
import { setRedis } from '@spfn/core';
import Redis from 'ioredis';

const write = new Redis('redis://master:6379');
const read = new Redis('redis://replica:6379');
setRedis(write, read);
```

**Parameters:**
- `write: Redis | Cluster | undefined` - Write instance
- `read?: Redis | Cluster | undefined` - Read instance (optional, defaults to write)

---

### `getRedisInfo()`

Get Redis connection information (for debugging).

```typescript
import { getRedisInfo } from '@spfn/core';

const info = getRedisInfo();
console.log(info);
// {
//   hasWrite: true,
//   hasRead: true,
//   isReplica: true  // true if read instance is different from write
// }
```

**Returns:** `{ hasWrite: boolean; hasRead: boolean; isReplica: boolean }`

---

## Advanced Usage

### Master-Replica Pattern

```typescript
import { getRedis, getRedisRead } from '@spfn/core';

// Write to master
async function updateUser(id: string, data: any) {
  const redis = getRedis();
  if (redis) {
    await redis.set(`user:${id}`, JSON.stringify(data));
  }
}

// Read from replica
async function getUser(id: string) {
  const redis = getRedisRead();
  if (redis) {
    const data = await redis.get(`user:${id}`);
    return data ? JSON.parse(data) : null;
  }
  return null;
}
```

### Testing with Mock Redis

```typescript
import { setRedis } from '@spfn/core';

// In your test setup
beforeAll(() => {
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue('OK'),
  };
  setRedis(mockRedis as any);
});

afterAll(async () => {
  setRedis(undefined);
});
```

### Custom Configuration

```typescript
import { setRedis } from '@spfn/core';
import Redis from 'ioredis';

// Custom Redis configuration
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
  maxRetriesPerRequest: 3,
});

setRedis(redis);
```

---

## Architecture

### Singleton Pattern

All modules share the same Redis instance:

```typescript
// @spfn/auth
import { getRedis } from '@spfn/core/cache';
const redis = getRedis();  // Same instance

// @spfn/session
import { getRedis } from '@spfn/core/cache';
const redis = getRedis();  // Same instance

// Your app
import { getRedis } from '@spfn/core/cache';
const redis = getRedis();  // Same instance
```

### Dynamic Import

Redis is loaded only when needed:

```typescript
// No REDIS_URL → ioredis never imported
// With REDIS_URL → ioredis dynamically loaded at runtime
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
# Without Redis
pnpm install @spfn/core  # Works fine

# With Redis
pnpm install @spfn/core ioredis
```

---

## Troubleshooting

### ⚠️ Warning: "Using memory-only cache"

**Cause:** No Redis configuration found or ioredis not installed.

**Solutions:**
1. Install ioredis: `pnpm install ioredis`
2. Set `REDIS_URL` in `.env`

### ❌ Error: "Redis connection failed"

**Cause:** Cannot connect to Redis server.

**Check:**
1. Redis server is running
2. Host/port is correct
3. Network firewall allows connection
4. Password is correct (if authentication enabled)

### TLS Certificate Issues

```bash
# For self-signed certificates
REDIS_TLS_REJECT_UNAUTHORIZED=false
```

### Connection Pooling

ioredis automatically manages connection pooling. Default settings:

- Max retries: 3
- Retry delay: Exponential backoff
- Keep-alive: Enabled

---

## Performance Tips

### 1. Use Read Replicas

```bash
# Separate read/write workloads
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379
```

```typescript
// Writes go to master
await getRedis()?.set('key', 'value');

// Reads from replica (reduces master load)
await getRedisRead()?.get('key');
```

### 2. Pipeline Commands

```typescript
const redis = getRedis();
if (redis) {
  const pipeline = redis.pipeline();
  pipeline.set('key1', 'value1');
  pipeline.set('key2', 'value2');
  pipeline.set('key3', 'value3');
  await pipeline.exec();
}
```

### 3. Use Lua Scripts for Atomic Operations

```typescript
const redis = getRedis();
if (redis) {
  const result = await redis.eval(
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

- [FRAMEWORK_PHILOSOPHY.md](../../../../FRAMEWORK_PHILOSOPHY.md) - Infrastructure singleton pattern
- [ioredis Documentation](https://github.com/redis/ioredis) - Full Redis client API
- [@spfn/core](../../README.md) - Main package documentation