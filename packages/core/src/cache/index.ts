/**
 * Redis cache infrastructure
 * Provides singleton Redis instance management for all SPFN modules
 * Supports Master-Replica pattern with separate read/write instances
 */

export { createRedisFromEnv, createSingleRedisFromEnv } from './redis-factory.js';
export { getRedis, getRedisRead, setRedis, initRedis, closeRedis, getRedisInfo } from './redis-manager.js';
export type { RedisClients } from './redis-factory.js';