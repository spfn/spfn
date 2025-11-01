/**
 * Cache infrastructure (Valkey/Redis)
 * Provides singleton cache instance management for all SPFN modules
 * Supports Master-Replica pattern with separate read/write instances
 *
 * Valkey is a Redis fork (7.2.4 base) with 100% protocol compatibility
 * https://valkey.io
 */

// Modern exports (cache)
export {
    createCacheFromEnv,
    createSingleCacheFromEnv,
} from './cache-factory.js';

export {
    getCache,
    getCacheRead,
    isCacheDisabled,
    setCache,
    initCache,
    closeCache,
    getCacheInfo,
} from './cache-manager.js';

export type { CacheClients } from './cache-factory.js';

// Legacy exports (backward compatibility)
// Manager functions - re-exported from cache-manager.js
export {
    getRedis,
    getRedisRead,
    setRedis,
    initRedis,
    closeRedis,
    getRedisInfo,
} from './cache-manager.js';

// Factory functions - re-exported from cache-factory.js
export {
    createCacheFromEnv as createRedisFromEnv,
    createSingleCacheFromEnv as createSingleRedisFromEnv,
} from './cache-factory.js';

export type { CacheClients as RedisClients } from './cache-factory.js';