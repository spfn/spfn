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
} from './cache-factory';

export {
    getCache,
    getCacheRead,
    isCacheDisabled,
    setCache,
    initCache,
    closeCache,
    getCacheInfo,
} from './cache-manager';

export type { CacheClients } from './cache-factory';

// Factory functions - re-exported from cache-factory.js
export {
    createCacheFromEnv as createRedisFromEnv,
    createSingleCacheFromEnv as createSingleRedisFromEnv,
} from './cache-factory';

export type { CacheClients as RedisClients } from './cache-factory';
