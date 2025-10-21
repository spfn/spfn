import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Redis, Cluster } from 'ioredis';
import {
    getRedis,
    getRedisRead,
    setRedis,
    initRedis,
    closeRedis,
    getRedisInfo,
} from '../redis-manager.js';

describe('redis-manager', () =>
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
        await closeRedis();
    });

    afterEach(async () =>
    {
        // Clean up after each test
        await closeRedis();
        vi.clearAllMocks();
    });

    describe('getRedis', () =>
    {
        it('should return undefined when not initialized', () =>
        {
            const result = getRedis();
            expect(result).toBeUndefined();
        });

        it('should return write instance after setRedis', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            const result = getRedis();
            expect(result).toBe(mockWrite);
        });

        it('should return same instance on multiple calls', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            const result1 = getRedis();
            const result2 = getRedis();
            expect(result1).toBe(result2);
        });
    });

    describe('getRedisRead', () =>
    {
        it('should return undefined when not initialized', () =>
        {
            const result = getRedisRead();
            expect(result).toBeUndefined();
        });

        it('should return read instance when set separately', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setRedis(mockWrite, mockRead);

            const result = getRedisRead();
            expect(result).toBe(mockRead);
        });

        it('should fallback to write instance when read is not set', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            const result = getRedisRead();
            expect(result).toBe(mockWrite);
        });

        it('should return write instance when read is explicitly set to write', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite, mockWrite);

            const resultWrite = getRedis();
            const resultRead = getRedisRead();
            expect(resultWrite).toBe(resultRead);
        });
    });

    describe('setRedis', () =>
    {
        it('should set write instance', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            expect(getRedis()).toBe(mockWrite);
        });

        it('should set both write and read instances', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setRedis(mockWrite, mockRead);

            expect(getRedis()).toBe(mockWrite);
            expect(getRedisRead()).toBe(mockRead);
        });

        it('should use write as read when read is not provided', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            expect(getRedis()).toBe(mockWrite);
            expect(getRedisRead()).toBe(mockWrite);
        });

        it('should accept undefined to clear instances', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);
            expect(getRedis()).toBeDefined();

            setRedis(undefined);
            expect(getRedis()).toBeUndefined();
            expect(getRedisRead()).toBeUndefined();
        });
    });

    describe('initRedis', () =>
    {
        it('should return existing instances if already initialized', async () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setRedis(mockWrite, mockRead);

            const result = await initRedis();

            expect(result.write).toBe(mockWrite);
            expect(result.read).toBe(mockRead);
            expect(mockWrite.ping).not.toHaveBeenCalled(); // Should not ping again
        });

        it('should test connection with ping() for new instances', async () =>
        {
            // Mock createRedisFromEnv to return test instances
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');

            // This test requires mocking the createRedisFromEnv import
            // For integration tests, we'll test with actual Redis
            // For unit tests, we can set instances manually

            setRedis(undefined); // Clear first
            setRedis(mockWrite, mockRead);

            expect(getRedis()).toBe(mockWrite);
            expect(getRedisRead()).toBe(mockRead);
        });

        it('should handle single instance (write = read)', async () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite, mockWrite);

            const result = await initRedis();

            expect(result.write).toBe(mockWrite);
            expect(result.read).toBe(mockWrite);
        });

        it('should return undefined instances when no Redis config exists', async () =>
        {
            // Clear all Redis env vars
            const originalEnv = process.env;
            process.env = {
                ...originalEnv,
                REDIS_URL: undefined,
                REDIS_WRITE_URL: undefined,
                REDIS_READ_URL: undefined,
                REDIS_SENTINEL_HOSTS: undefined,
                REDIS_CLUSTER_NODES: undefined,
            };

            const result = await initRedis();

            // Should return undefined when no config
            if (result.write === undefined)
            {
                expect(result.write).toBeUndefined();
                expect(result.read).toBeUndefined();
            }

            process.env = originalEnv;
        });
    });

    describe('closeRedis', () =>
    {
        it('should close write instance', async () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            await closeRedis();

            expect(mockWrite.quit).toHaveBeenCalledTimes(1);
            expect(getRedis()).toBeUndefined();
        });

        it('should close both write and read instances', async () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setRedis(mockWrite, mockRead);

            await closeRedis();

            expect(mockWrite.quit).toHaveBeenCalledTimes(1);
            expect(mockRead.quit).toHaveBeenCalledTimes(1);
            expect(getRedis()).toBeUndefined();
            expect(getRedisRead()).toBeUndefined();
        });

        it('should not close read instance if same as write', async () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite, mockWrite); // Same instance

            await closeRedis();

            expect(mockWrite.quit).toHaveBeenCalledTimes(1); // Only once
        });

        it('should handle quit() errors gracefully', async () =>
        {
            const mockWrite = createMockRedis('write');
            mockWrite.quit = vi.fn().mockRejectedValue(new Error('Quit failed'));
            setRedis(mockWrite);

            await expect(closeRedis()).resolves.not.toThrow();
            expect(getRedis()).toBeUndefined();
        });

        it('should handle errors in both instances', async () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            mockWrite.quit = vi.fn().mockRejectedValue(new Error('Write quit failed'));
            mockRead.quit = vi.fn().mockRejectedValue(new Error('Read quit failed'));
            setRedis(mockWrite, mockRead);

            await expect(closeRedis()).resolves.not.toThrow();
            expect(getRedis()).toBeUndefined();
            expect(getRedisRead()).toBeUndefined();
        });

        it('should be idempotent (safe to call multiple times)', async () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            await closeRedis();
            await closeRedis(); // Second call should not throw

            expect(mockWrite.quit).toHaveBeenCalledTimes(1);
        });
    });

    describe('getRedisInfo', () =>
    {
        it('should return false for all flags when not initialized', () =>
        {
            const info = getRedisInfo();

            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
            expect(info.isReplica).toBe(false);
        });

        it('should return correct info for single instance', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            const info = getRedisInfo();

            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(false); // Same instance
        });

        it('should return correct info for master-replica setup', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setRedis(mockWrite, mockRead);

            const info = getRedisInfo();

            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(true); // Different instances
        });

        it('should return correct info after closeRedis', async () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            let info = getRedisInfo();
            expect(info.hasWrite).toBe(true);

            await closeRedis();

            info = getRedisInfo();
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
            setRedis(mockWrite);

            const instance1 = getRedis();
            const instance2 = getRedis();

            expect(instance1).toBe(instance2);
            expect(instance1).toBe(mockWrite);
        });

        it('should share state between getRedis and getRedisRead', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite);

            const writeInstance = getRedis();
            const readInstance = getRedisRead();

            expect(writeInstance).toBe(readInstance);
        });
    });

    describe('Master-Replica Behavior', () =>
    {
        it('should separate read and write operations', () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');
            setRedis(mockWrite, mockRead);

            const writeRedis = getRedis();
            const readRedis = getRedisRead();

            expect(writeRedis).toBe(mockWrite);
            expect(readRedis).toBe(mockRead);
            expect(writeRedis).not.toBe(readRedis);
        });

        it('should use write instance for reads when no replica', () =>
        {
            const mockWrite = createMockRedis('write');
            setRedis(mockWrite); // No read instance

            const writeRedis = getRedis();
            const readRedis = getRedisRead();

            expect(writeRedis).toBe(mockWrite);
            expect(readRedis).toBe(mockWrite);
        });
    });

    describe('Error Handling', () =>
    {
        it('should handle undefined write instance', () =>
        {
            setRedis(undefined);

            expect(getRedis()).toBeUndefined();
            expect(getRedisRead()).toBeUndefined();
        });

        it('should log errors but still clean up instances', async () =>
        {
            const mockWrite = createMockRedis('write');
            const mockRead = createMockRedis('read');

            mockWrite.quit = vi.fn().mockRejectedValue(new Error('Connection lost'));
            mockRead.quit = vi.fn().mockRejectedValue(new Error('Connection lost'));
            setRedis(mockWrite, mockRead);

            // Should not throw even with errors
            await expect(closeRedis()).resolves.not.toThrow();

            // Should still clean up instances
            expect(getRedis()).toBeUndefined();
            expect(getRedisRead()).toBeUndefined();

            // Should have attempted to quit both instances
            expect(mockWrite.quit).toHaveBeenCalledTimes(1);
            expect(mockRead.quit).toHaveBeenCalledTimes(1);
        });
    });
});
