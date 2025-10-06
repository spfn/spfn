# Caching with Redis

This guide covers how to use Redis caching in SPFN.

## Overview

SPFN provides built-in Redis support with automatic master-replica detection.

## Quick Start

### Environment Setup

```bash
# Single Redis instance
REDIS_URL=redis://localhost:6379

# Master-Replica setup
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379
```

### Basic Usage

```typescript
import { initRedis, getRedis, getRedisRead } from '@spfn/core';

// Initialize (auto-called by startServer)
await initRedis();

// Write operations (to master)
const redis = getRedis();
await redis?.set('user:123', JSON.stringify(user));
await redis?.setex('session:abc', 3600, token);

// Read operations (from replica if available)
const redisRead = getRedisRead();
const cached = await redisRead?.get('user:123');
```

## Features

- **Auto-detection** of master/replica configuration
- **Singleton pattern** with lazy initialization
- **Connection pooling** and health checks
- **TLS/SSL support**
- **Graceful shutdown**

## Architecture

- Write operations always go to master
- Read operations use replica when available
- Falls back to master if replica unavailable
- Automatic reconnection on connection loss

## Advanced Usage

### Custom Configuration

```typescript
import Redis from 'ioredis';
import { initRedis } from '@spfn/core';

// Custom Redis configuration
const customRedis = new Redis({
  host: 'localhost',
  port: 6379,
  password: 'secret',
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

await initRedis(customRedis);
```

### Caching Patterns

```typescript
// Cache-aside pattern
async function getUser(id: number) {
  const redis = getRedisRead();
  const cached = await redis?.get(`user:${id}`);

  if (cached) {
    return JSON.parse(cached);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, id)
  });

  if (user) {
    await getRedis()?.setex(`user:${id}`, 3600, JSON.stringify(user));
  }

  return user;
}

// Cache invalidation
async function updateUser(id: number, data: any) {
  const user = await db.update(users)
    .set(data)
    .where(eq(users.id, id))
    .returning();

  // Invalidate cache
  await getRedis()?.del(`user:${id}`);

  return user;
}
```

## Module Documentation

See the [Cache Module README](../../packages/core/src/cache/README.md) for detailed technical documentation.