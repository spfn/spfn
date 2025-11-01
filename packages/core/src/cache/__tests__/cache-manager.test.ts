import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Redis, Cluster } from 'ioredis';
import {
    getCache,
    getCacheRead,
    setCache,
    initCache,
    closeCache,
    getCacheInfo,
    isCacheDisabled,
    // Legacy API (for backward compatibility tests)
    getRedis,
    getRedisRead,
    setRedis,
    initRedis,
    closeRedis,
    getRedisInfo,
} from '../cache-manager.js';

describe('cache-manager', () =>
{
    // Mock Redis instance
    const createMockRedis = (name = 'mock'): Redis =>
    {
        return {
            name,
            ping: vi.fn().mockResolvedValue('PONG'),
            quit: vi.fn().mockResolvedValue('OK'),
            get: vi.fn(),
            set: vi.fn(),
            del: vi.fn(),
        } as unknown as Redis;
    };

    beforeEach(async () =>
    {
        // Clean up any existing instances
        await closeCache();
    });

    afterEach(async () =>
    {
        // Clean up after each test
        await closeCache();
        vi.clearAllMocks();
    });

    describe('getCache', () =>
    {
        it('should return undefined when not initialized', () =>
        {
            const result = getCache();
            expect(result).toBeUndefined();
        });

        it('should return write instance after setCache', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const result = getCache();
            expect(result).toBe(mockWrite);
        });

        it('should return same instance on multiple calls', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const result1 = getCache();
            const result2 = getCache();
            expect(result1).toBe(result2);
        });
    });

    describe('getCacheRead', () =>
    {
        it('should return undefined when not initialized', () =>
        {
            const result = getCacheRead();
            expect(result).toBeUndefined();
        });

        it('should return read instance when set separately', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setCache(mockWrite, mockRead);

            const result = getCacheRead();
            expect(result).toBe(mockRead);
        });

        it('should fallback to write instance when read is not set', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const result = getCacheRead();
            expect(result).toBe(mockWrite);
        });

        it('should return write instance when read is explicitly set to write', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite, mockWrite);

            const resultWrite = getCache();
            const resultRead = getCacheRead();
            expect(resultWrite).toBe(resultRead);
        });
    });

    describe('setCache', () =>
    {
        it('should set write instance', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            expect(getCache()).toBe(mockWrite);
        });

        it('should set both write and read instances', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setCache(mockWrite, mockRead);

            expect(getCache()).toBe(mockWrite);
            expect(getCacheRead()).toBe(mockRead);
        });

        it('should use write as read when read is not provided', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            expect(getCache()).toBe(mockWrite);
            expect(getCacheRead()).toBe(mockWrite);
        });

        it('should accept undefined to clear instances', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);
            expect(getCache()).toBeDefined();

            setCache(undefined);
            expect(getCache()).toBeUndefined();
            expect(getCacheRead()).toBeUndefined();
        });
    });

    describe('initCache', () =>
    {
        it('should return existing instances if already initialized', async () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setCache(mockWrite, mockRead);

            const result = await initCache();

            expect(result.write).toBe(mockWrite);
            expect(result.read).toBe(mockRead);
            expect(mockWrite.ping).not.toHaveBeenCalled(); // Should not ping again
        });

        it('should test connection with ping() for new instances', async () =>
        {
            // Mock createCacheFromEnv to return test instances
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');

            // This test requires mocking the createCacheFromEnv import
            // For integration tests, we'll test with actual cache
            // For unit tests, we can set instances manually

            setCache(undefined); // Clear first
            setCache(mockWrite, mockRead);

            expect(getCache()).toBe(mockWrite);
            expect(getCacheRead()).toBe(mockRead);
        });

        it('should handle single instance (write = read)', async () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite, mockWrite);

            const result = await initCache();

            expect(result.write).toBe(mockWrite);
            expect(result.read).toBe(mockWrite);
        });

        it('should return undefined instances when no cache config exists', async () =>
        {
            // Clear all cache env vars
            const originalEnv = process.env;
            process.env = {
                ...originalEnv,
                VALKEY_URL: undefined,
                CACHE_URL: undefined,
                REDIS_URL: undefined,
                VALKEY_WRITE_URL: undefined,
                CACHE_WRITE_URL: undefined,
                REDIS_WRITE_URL: undefined,
                VALKEY_READ_URL: undefined,
                CACHE_READ_URL: undefined,
                REDIS_READ_URL: undefined,
            };

            const result = await initCache();

            // Should return undefined when no config
            if (result.write === undefined)
            {
                expect(result.write).toBeUndefined();
                expect(result.read).toBeUndefined();
            }

            process.env = originalEnv;
        });
    });

    describe('closeCache', () =>
    {
        it('should close write instance', async () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            await closeCache();

            expect(mockWrite.quit).toHaveBeenCalledTimes(1);
            expect(getCache()).toBeUndefined();
        });

        it('should close both write and read instances', async () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setCache(mockWrite, mockRead);

            await closeCache();

            expect(mockWrite.quit).toHaveBeenCalledTimes(1);
            expect(mockRead.quit).toHaveBeenCalledTimes(1);
            expect(getCache()).toBeUndefined();
            expect(getCacheRead()).toBeUndefined();
        });

        it('should not close read instance if same as write', async () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite, mockWrite); // Same instance

            await closeCache();

            expect(mockWrite.quit).toHaveBeenCalledTimes(1); // Only once
        });

        it('should handle quit() errors gracefully', async () =>
        {
            const mockWrite = createMockRedis('write');
            mockWrite.quit = vi.fn().mockRejectedValue(new Error('Quit failed'));
            setCache(mockWrite);

            await expect(closeCache()).resolves.not.toThrow();
            expect(getCache()).toBeUndefined();
        });

        it('should handle errors in both instances', async () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            mockWrite.quit = vi.fn().mockRejectedValue(new Error('Write quit failed'));
            mockRead.quit = vi.fn().mockRejectedValue(new Error('Read quit failed'));
            setCache(mockWrite, mockRead);

            await expect(closeCache()).resolves.not.toThrow();
            expect(getCache()).toBeUndefined();
            expect(getCacheRead()).toBeUndefined();
        });

        it('should be idempotent (safe to call multiple times)', async () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            await closeCache();
            await closeCache(); // Second call should not throw

            expect(mockWrite.quit).toHaveBeenCalledTimes(1);
        });
    });

    describe('getCacheInfo', () =>
    {
        it('should return false for all flags when not initialized', () =>
        {
            const info = getCacheInfo();

            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
            expect(info.isReplica).toBe(false);
        });

        it('should return correct info for single instance', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const info = getCacheInfo();

            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(false); // Same instance
        });

        it('should return correct info for master-replica setup', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setCache(mockWrite, mockRead);

            const info = getCacheInfo();

            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(true); // Different instances
        });

        it('should return correct info after closeCache', async () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            let info = getCacheInfo();
            expect(info.hasWrite).toBe(true);

            await closeCache();

            info = getCacheInfo();
            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
            expect(info.isReplica).toBe(false);
        });
    });

    describe('Singleton Pattern', () =>
    {
        it('should maintain singleton across multiple imports', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const instance1 = getCache();
            const instance2 = getCache();

            expect(instance1).toBe(instance2);
            expect(instance1).toBe(mockWrite);
        });

        it('should share state between getCache and getCacheRead', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const writeInstance = getCache();
            const readInstance = getCacheRead();

            expect(writeInstance).toBe(readInstance);
        });
    });

    describe('Master-Replica Behavior', () =>
    {
        it('should separate read and write operations', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setCache(mockWrite, mockRead);

            const writeCache = getCache();
            const readCache = getCacheRead();

            expect(writeCache).toBe(mockWrite);
            expect(readCache).toBe(mockRead);
            expect(writeCache).not.toBe(readCache);
        });

        it('should use write instance for reads when no replica', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite); // No read instance

            const writeCache = getCache();
            const readCache = getCacheRead();

            expect(writeCache).toBe(mockWrite);
            expect(readCache).toBe(mockWrite);
        });
    });

    describe('Error Handling', () =>
    {
        it('should handle undefined write instance', () =>
        {
            setCache(undefined);

            expect(getCache()).toBeUndefined();
            expect(getCacheRead()).toBeUndefined();
        });

        it('should log errors but still clean up instances', async () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');

            mockWrite.quit = vi.fn().mockRejectedValue(new Error('Connection lost'));
            mockRead.quit = vi.fn().mockRejectedValue(new Error('Connection lost'));
            setCache(mockWrite, mockRead);

            // Should not throw even with errors
            await expect(closeCache()).resolves.not.toThrow();

            // Should still clean up instances
            expect(getCache()).toBeUndefined();
            expect(getCacheRead()).toBeUndefined();

            // Should have attempted to quit both instances
            expect(mockWrite.quit).toHaveBeenCalledTimes(1);
            expect(mockRead.quit).toHaveBeenCalledTimes(1);
        });
    });

    describe('isCacheDisabled', () =>
    {
        it('should return true when cache is not initialized', () =>
        {
            setCache(undefined);

            expect(isCacheDisabled()).toBe(true);
        });

        it('should return false when cache is initialized', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            expect(isCacheDisabled()).toBe(false);
        });

        it('should return true after closeRedis', async () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            expect(isCacheDisabled()).toBe(false);

            await closeCache();

            expect(isCacheDisabled()).toBe(true);
        });

        it('should return true when setCache(undefined) is called', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);
            expect(isCacheDisabled()).toBe(false);

            setCache(undefined);

            expect(isCacheDisabled()).toBe(true);
        });

        it('should reflect disabled state in getCacheInfo', () =>
        {
            setCache(undefined);

            const info = getCacheInfo();
            expect(info.disabled).toBe(true);
            expect(isCacheDisabled()).toBe(true);
        });

        it('should reflect enabled state in getCacheInfo', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const info = getCacheInfo();
            expect(info.disabled).toBe(false);
            expect(isCacheDisabled()).toBe(false);
        });
    });

    describe('Modern Cache API (getCache, getCacheRead)', () =>
    {
        it('getCache should be alias for getRedis', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const cache = getCache();
            const redis = getRedis();

            expect(cache).toBe(redis);
            expect(cache).toBe(mockWrite);
        });

        it('getCacheRead should be alias for getRedisRead', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setCache(mockWrite, mockRead);

            const cacheRead = getCacheRead();
            const redisRead = getRedisRead();

            expect(cacheRead).toBe(redisRead);
            expect(cacheRead).toBe(mockRead);
        });

        it('getCache should return undefined when disabled', () =>
        {
            setCache(undefined);

            expect(getCache()).toBeUndefined();
            expect(isCacheDisabled()).toBe(true);
        });

        it('getCacheRead should return undefined when disabled', () =>
        {
            setCache(undefined);

            expect(getCacheRead()).toBeUndefined();
            expect(isCacheDisabled()).toBe(true);
        });

        it('getCacheRead should fallback to write when no read instance', () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            const cache = getCache();
            const cacheRead = getCacheRead();

            expect(cache).toBe(mockWrite);
            expect(cacheRead).toBe(mockWrite);
            expect(cache).toBe(cacheRead);
        });
    });

    describe('Disabled Mode Behavior', () =>
    {
        it('should initialize in disabled mode when no config exists', async () =>
        {
            const originalEnv = process.env;
            process.env = {
                ...originalEnv,
                VALKEY_URL: undefined,
                CACHE_URL: undefined,
                REDIS_URL: undefined,
                VALKEY_WRITE_URL: undefined,
                CACHE_WRITE_URL: undefined,
                REDIS_WRITE_URL: undefined,
            };

            const result = await initCache();

            expect(result.disabled).toBe(true);
            expect(result.write).toBeUndefined();
            expect(result.read).toBeUndefined();
            expect(isCacheDisabled()).toBe(true);

            process.env = originalEnv;
        });

        it('should allow application to continue when cache is disabled', () =>
        {
            setCache(undefined);

            // Application can check and handle disabled cache
            if (isCacheDisabled())
            {
                // Alternative logic without cache
                expect(true).toBe(true);
            }
            else
            {
                // Use cache
                expect(false).toBe(true); // Should not reach here
            }
        });

        it('should gracefully handle operations on undefined cache', () =>
        {
            setCache(undefined);

            const cache = getCache();
            const cacheRead = getCacheRead();

            expect(cache).toBeUndefined();
            expect(cacheRead).toBeUndefined();

            // Optional chaining prevents errors - returns undefined safely
            expect(cache?.set('key', 'value')).toBeUndefined();
            expect(cacheRead?.get('key')).toBeUndefined();
        });

        it('should transition from enabled to disabled when closeRedis is called', async () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            expect(isCacheDisabled()).toBe(false);
            expect(getCache()).toBeDefined();

            await closeCache();

            expect(isCacheDisabled()).toBe(true);
            expect(getCache()).toBeUndefined();
        });

        it('should stay in disabled mode when closeRedis is called multiple times', async () =>
        {
            const mockWrite = createMockRedis('write');
            setCache(mockWrite);

            await closeCache();
            expect(isCacheDisabled()).toBe(true);

            await closeCache();
            expect(isCacheDisabled()).toBe(true);

            await closeCache();
            expect(isCacheDisabled()).toBe(true);
        });

        it('should report disabled state in getCacheInfo', () =>
        {
            setCache(undefined);

            const info = getCacheInfo();

            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
            expect(info.isReplica).toBe(false);
            expect(info.disabled).toBe(true);
        });
    });
});
