# @spfn/core Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Redis Cache Infrastructure
- **Global Redis Instance Management** (`src/cache/`)
  - Singleton pattern for centralized Redis connection management
  - `getRedis()` - Get write instance
  - `getRedisRead()` - Get read instance (with fallback to write)
  - `setRedis()` - Manual instance configuration
  - `initRedis()` - Auto-initialization from environment variables
  - `closeRedis()` - Graceful shutdown and cleanup
  - `getRedisInfo()` - Debug connection information

- **Multiple Deployment Patterns**
  - Single Instance (REDIS_URL)
  - Master-Replica with read/write separation (REDIS_WRITE_URL + REDIS_READ_URL)
  - Sentinel for high availability (REDIS_SENTINEL_HOSTS + REDIS_MASTER_NAME)
  - Cluster for horizontal scaling (REDIS_CLUSTER_NODES)

- **Advanced Features**
  - TLS/SSL support with `rediss://` protocol
  - Configurable certificate validation (REDIS_TLS_REJECT_UNAUTHORIZED)
  - Connection testing with `ping()` before accepting instances
  - Automatic cleanup of failed connections
  - Dynamic import optimization (ioredis loaded only when needed)
  - Optional peer dependency (graceful degradation without Redis)

- **Developer Experience**
  - Zero-config setup (just set REDIS_URL)
  - Environment-driven configuration
  - Auto-initialization via `startServer()`
  - Comprehensive error handling and logging
  - TypeScript type safety

- **Documentation**
  - Complete API reference in `src/cache/README.md`
  - Environment variable examples
  - Master-Replica usage patterns
  - Testing guide with mock Redis
  - Performance optimization tips
  - Troubleshooting section

- **Testing**
  - 50 unit tests (redis-factory.test.ts, redis-manager.test.ts)
  - 20 integration tests with real Redis (redis.integration.test.ts)
  - Docker Compose setup for local testing (docker-compose.test.yml)
  - 100% test coverage for public APIs

#### Infrastructure Improvements
- Added `peerDependenciesMeta` for optional ioredis dependency
- Added ioredis to devDependencies for type checking
- Proper cleanup patterns for singleton resources

### Changed
- Updated `@spfn/core` main index exports to include cache APIs
- Enhanced FRAMEWORK_PHILOSOPHY.md with Redis infrastructure pattern examples
- Updated package.json with optional peer dependency configuration

### Internal
- Refactored Redis instance management from @spfn/auth to @spfn/core
- Moved redis-factory.ts to centralized infrastructure location
- Implemented infrastructure singleton pattern as per framework philosophy

## [0.1.0] - 2025-01-XX

### Added
- Initial release
- File-based routing system
- Database transaction management
- Repository pattern
- Error handling
- Type generation

---

## Migration Guide

### From @spfn/auth local Redis to @spfn/core global Redis

**Before:**
```typescript
// Each module created own Redis instance
import { createSingleRedisFromEnv } from '@spfn/auth/server/redis-factory';
const redis = await createSingleRedisFromEnv();
```

**After:**
```typescript
// All modules share global instance
import { getRedis } from '@spfn/core';
const redis = getRedis(); // Auto-initialized by startServer()
```

### Environment Variables

No changes required! Existing `REDIS_URL` continues to work.

**New capabilities:**
```bash
# Master-Replica (new)
REDIS_WRITE_URL=redis://master:6379
REDIS_READ_URL=redis://replica:6379

# TLS (new)
REDIS_URL=rediss://secure.redis.com:6380
REDIS_TLS_REJECT_UNAUTHORIZED=false

# Sentinel (new)
REDIS_SENTINEL_HOSTS=sentinel1:26379,sentinel2:26379
REDIS_MASTER_NAME=mymaster

# Cluster (new)
REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379
```

---

## Framework Philosophy

All infrastructure-level changes in this release follow the principles outlined in [FRAMEWORK_PHILOSOPHY.md](../../FRAMEWORK_PHILOSOPHY.md):

1. **Zero-Config**: Works with just `REDIS_URL` environment variable
2. **Infrastructure Singleton**: One Redis connection shared across all modules
3. **Environment-Driven**: Configuration via environment variables
4. **Graceful Degradation**: Optional dependency with memory fallback
5. **Transparent Abstraction**: Dynamic import with clear fallback behavior

---

## Performance Impact

### Positive
- ✅ Reduced memory usage (single Redis connection instead of multiple)
- ✅ Faster startup (dynamic import skips ioredis if not configured)
- ✅ Master-Replica support enables read scaling

### Neutral
- Connection testing with `ping()` adds ~10ms to startup (acceptable tradeoff for reliability)

---

## Breaking Changes

None. This is a new feature addition with backward compatibility.

---

## Deprecations

None.

---

## Security

- TLS/SSL support added for secure Redis connections
- Certificate validation configurable for self-signed certificates
- Password authentication supported in connection URLs