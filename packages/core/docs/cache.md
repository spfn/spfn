# Cache

Redis caching with type-safe operations.

## Setup

```bash
REDIS_URL=redis://localhost:6379
```

## Basic Usage

```typescript
import { cache } from '@spfn/core/cache';

// Set
await cache.set('user:123', { id: '123', name: 'John' });
await cache.set('session:abc', data, { ttl: 3600 });  // 1 hour

// Get
const user = await cache.get<User>('user:123');

// Delete
await cache.del('user:123');

// Check existence
const exists = await cache.exists('user:123');
```

## TTL Options

```typescript
// Set with TTL (seconds)
await cache.set('key', value, { ttl: 60 });      // 1 minute
await cache.set('key', value, { ttl: 3600 });    // 1 hour
await cache.set('key', value, { ttl: 86400 });   // 1 day

// No expiration
await cache.set('key', value);  // Permanent until deleted
```

## Patterns

### Cache-Aside

```typescript
async function getUser(id: string): Promise<User>
{
    const cached = await cache.get<User>(`user:${id}`);
    if (cached)
    {
        return cached;
    }

    const user = await userRepo.findById(id);
    if (user)
    {
        await cache.set(`user:${id}`, user, { ttl: 3600 });
    }

    return user;
}
```

### Cache Invalidation

```typescript
async function updateUser(id: string, data: Partial<User>)
{
    const user = await userRepo.update(id, data);
    await cache.del(`user:${id}`);  // Invalidate cache
    return user;
}
```

### Cache with Prefix

```typescript
const userCache = cache.prefix('user');

await userCache.set('123', user);     // Key: user:123
await userCache.get('123');
await userCache.del('123');
```

## Hash Operations

```typescript
// Set hash field
await cache.hset('user:123', 'name', 'John');

// Get hash field
const name = await cache.hget('user:123', 'name');

// Get all hash fields
const user = await cache.hgetall('user:123');

// Delete hash field
await cache.hdel('user:123', 'name');
```

## List Operations

```typescript
// Push to list
await cache.lpush('queue', item);
await cache.rpush('queue', item);

// Pop from list
const item = await cache.lpop('queue');
const item = await cache.rpop('queue');

// Get list range
const items = await cache.lrange('queue', 0, -1);  // All items
```

## Best Practices

```typescript
// 1. Use consistent key naming
`user:${id}`
`session:${token}`
`cache:posts:${page}`

// 2. Set appropriate TTL
{ ttl: 300 }    // 5 min for frequently changing data
{ ttl: 3600 }   // 1 hour for stable data
{ ttl: 86400 }  // 1 day for rarely changing data

// 3. Invalidate on write
await userRepo.update(id, data);
await cache.del(`user:${id}`);
```
