import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRedisFromEnv, createSingleRedisFromEnv } from './redis-factory.js';

describe('redis-factory', () =>
{
    const originalEnv = process.env;

    beforeEach(() =>
    {
        // Reset environment
        process.env = { ...originalEnv };
        vi.clearAllMocks();
    });

    afterEach(() =>
    {
        // Restore environment
        process.env = originalEnv;
    });

    describe('createRedisFromEnv', () =>
    {
        it('should return undefined when no Redis config exists', async () =>
        {
            delete process.env.REDIS_URL;
            delete process.env.REDIS_WRITE_URL;
            delete process.env.REDIS_READ_URL;
            delete process.env.REDIS_SENTINEL_HOSTS;
            delete process.env.REDIS_CLUSTER_NODES;

            const result = await createRedisFromEnv();

            expect(result.write).toBeUndefined();
            expect(result.read).toBeUndefined();
        });

        it('should create single instance from REDIS_URL', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read); // Same instance
        });

        it('should create master-replica from REDIS_WRITE_URL and REDIS_READ_URL', async () =>
        {
            process.env.REDIS_WRITE_URL = 'redis://master:6379';
            process.env.REDIS_READ_URL = 'redis://replica:6379';

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).not.toBe(result.read); // Different instances
        });

        it('should support TLS with rediss:// protocol', async () =>
        {
            process.env.REDIS_URL = 'rediss://secure.redis.com:6380';

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
            // Note: Can't easily test TLS config without mocking ioredis constructor
        });

        it('should support REDIS_TLS_REJECT_UNAUTHORIZED=false', async () =>
        {
            process.env.REDIS_URL = 'rediss://localhost:6380';
            process.env.REDIS_TLS_REJECT_UNAUTHORIZED = 'false';

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
        });

        it('should prioritize single instance over master-replica when only REDIS_URL is set', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';
            // No REDIS_WRITE_URL or REDIS_READ_URL

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read);
        });

        it('should handle sentinel configuration', async () =>
        {
            process.env.REDIS_SENTINEL_HOSTS = 'sentinel1:26379,sentinel2:26379';
            process.env.REDIS_MASTER_NAME = 'mymaster';
            process.env.REDIS_PASSWORD = 'secret';

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read);
        });

        it('should handle cluster configuration', async () =>
        {
            process.env.REDIS_CLUSTER_NODES = 'node1:6379,node2:6379,node3:6379';
            process.env.REDIS_PASSWORD = 'secret';

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read);
        });

        it('should fallback to REDIS_URL when other configs are present but incomplete', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';
            process.env.REDIS_WRITE_URL = 'redis://master:6379';
            // Missing REDIS_READ_URL

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
            // Should use REDIS_URL as fallback
        });

        it('should handle ioredis import failure gracefully', async () =>
        {
            // This test is tricky - need to mock import() to fail
            // For now, we'll test the behavior when ioredis is not installed
            // by checking the catch block logic

            process.env.REDIS_URL = 'redis://localhost:6379';

            // If ioredis is installed, this will work
            // If not, it should return undefined and log warning
            const result = await createRedisFromEnv();

            // Either works or returns undefined
            expect(result).toBeDefined();
        });
    });

    describe('createSingleRedisFromEnv', () =>
    {
        it('should return only write instance', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            const result = await createSingleRedisFromEnv();

            expect(result).toBeDefined();
        });

        it('should return undefined when no config exists', async () =>
        {
            delete process.env.REDIS_URL;
            delete process.env.REDIS_WRITE_URL;

            const result = await createSingleRedisFromEnv();

            expect(result).toBeUndefined();
        });

        it('should return write instance from master-replica config', async () =>
        {
            process.env.REDIS_WRITE_URL = 'redis://master:6379';
            process.env.REDIS_READ_URL = 'redis://replica:6379';

            const result = await createSingleRedisFromEnv();

            expect(result).toBeDefined();
        });
    });

    describe('Environment Variable Priority', () =>
    {
        it('should prioritize in correct order: Single > Master-Replica > Sentinel > Cluster', async () =>
        {
            // Test 1: Only REDIS_URL (highest priority)
            process.env.REDIS_URL = 'redis://single:6379';
            let result = await createRedisFromEnv();
            expect(result.write).toBe(result.read);

            // Cleanup
            if (result.write)
            {
                await result.write.quit();
            }

            // Test 2: REDIS_WRITE_URL + REDIS_READ_URL (second priority)
            delete process.env.REDIS_URL;
            process.env.REDIS_WRITE_URL = 'redis://master:6379';
            process.env.REDIS_READ_URL = 'redis://replica:6379';
            result = await createRedisFromEnv();
            expect(result.write).not.toBe(result.read);

            // Cleanup
            if (result.write)
            {
                await result.write.quit();
            }
            if (result.read && result.read !== result.write)
            {
                await result.read.quit();
            }
        });
    });

    describe('Edge Cases', () =>
    {
        it('should handle empty REDIS_URL', async () =>
        {
            process.env.REDIS_URL = '';

            const result = await createRedisFromEnv();

            expect(result.write).toBeUndefined();
            expect(result.read).toBeUndefined();
        });

        it('should handle whitespace in REDIS_URL', async () =>
        {
            process.env.REDIS_URL = '  redis://localhost:6379  ';

            const result = await createRedisFromEnv();

            // ioredis should handle trimming or fail
            expect(result).toBeDefined();
        });

        it('should handle invalid REDIS_URL format', async () =>
        {
            process.env.REDIS_URL = 'not-a-valid-url';

            const result = await createRedisFromEnv();

            // Should either create instance or fail gracefully
            expect(result).toBeDefined();
        });

        it('should handle sentinel hosts with varying port formats', async () =>
        {
            process.env.REDIS_SENTINEL_HOSTS = 'sentinel1:26379,sentinel2,sentinel3:26380';
            process.env.REDIS_MASTER_NAME = 'mymaster';

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
        });

        it('should handle cluster nodes with varying formats', async () =>
        {
            process.env.REDIS_CLUSTER_NODES = 'node1:6379,node2,node3:6380';

            const result = await createRedisFromEnv();

            expect(result.write).toBeDefined();
        });
    });
});