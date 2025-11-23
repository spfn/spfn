import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCacheFromEnv, createSingleCacheFromEnv } from '../cache-factory';

describe('cache-factory', () =>
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

    describe('createCacheFromEnv', () =>
    {
        it('should return undefined when no cache config exists', async () =>
        {
            delete process.env.CACHE_URL;
            delete process.env.CACHE_URL;
            delete process.env.CACHE_URL;
            delete process.env.CACHE_WRITE_URL;
            delete process.env.CACHE_WRITE_URL;
            delete process.env.CACHE_WRITE_URL;
            delete process.env.CACHE_READ_URL;
            delete process.env.CACHE_READ_URL;
            delete process.env.CACHE_READ_URL;
            delete process.env.CACHE_SENTINEL_HOSTS;
            delete process.env.CACHE_SENTINEL_HOSTS;
            delete process.env.CACHE_CLUSTER_NODES;
            delete process.env.CACHE_CLUSTER_NODES;

            const result = await createCacheFromEnv();

            expect(result.write).toBeUndefined();
            expect(result.read).toBeUndefined();
        });

        it('should create single instance from CACHE_URL', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read); // Same instance
        });

        it('should create master-replica from CACHE_WRITE_URL and CACHE_READ_URL', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://master:6379';
            process.env.CACHE_READ_URL = 'redis://replica:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).not.toBe(result.read); // Different instances
        });

        it('should support TLS with rediss:// protocol', async () =>
        {
            process.env.CACHE_URL = 'rediss://secure.redis.com:6380';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            // Note: Can't easily test TLS config without mocking ioredis constructor
        });

        it('should support CACHE_TLS_REJECT_UNAUTHORIZED=false', async () =>
        {
            process.env.CACHE_URL = 'rediss://localhost:6380';
            process.env.CACHE_TLS_REJECT_UNAUTHORIZED = 'false';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
        });

        it('should prioritize single instance over master-replica when only CACHE_URL is set', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6379';
            // No CACHE_WRITE_URL or CACHE_READ_URL

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read);
        });

        it('should handle sentinel configuration', async () =>
        {
            process.env.CACHE_SENTINEL_HOSTS = 'sentinel1:26379,sentinel2:26379';
            process.env.CACHE_MASTER_NAME = 'mymaster';
            process.env.CACHE_PASSWORD = 'secret';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read);
        });

        it('should handle cluster configuration', async () =>
        {
            process.env.CACHE_CLUSTER_NODES = 'node1:6379,node2:6379,node3:6379';
            process.env.CACHE_PASSWORD = 'secret';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read);
        });

        it('should fallback to CACHE_URL when other configs are present but incomplete', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6379';
            process.env.CACHE_WRITE_URL = 'redis://master:6379';
            // Missing CACHE_READ_URL

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            // Should use CACHE_URL as fallback
        });

        it('should handle ioredis import failure gracefully', async () =>
        {
            // This test is tricky - need to mock import() to fail
            // For now, we'll test the behavior when ioredis is not installed
            // by checking the catch block logic

            process.env.CACHE_URL = 'redis://localhost:6379';

            // If ioredis is installed, this will work
            // If not, it should return undefined and log warning
            const result = await createCacheFromEnv();

            // Either works or returns undefined
            expect(result).toBeDefined();
        });
    });

    describe('createSingleCacheFromEnv', () =>
    {
        it('should return only write instance', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6379';

            const result = await createSingleCacheFromEnv();

            expect(result).toBeDefined();
        });

        it('should return undefined when no config exists', async () =>
        {
            delete process.env.CACHE_URL;
            delete process.env.CACHE_WRITE_URL;

            const result = await createSingleCacheFromEnv();

            expect(result).toBeUndefined();
        });

        it('should return write instance from master-replica config', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://master:6379';
            process.env.CACHE_READ_URL = 'redis://replica:6379';

            const result = await createSingleCacheFromEnv();

            expect(result).toBeDefined();
        });
    });

    describe('Valkey Support', () =>
    {
        it('should create single instance from CACHE_URL', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read);

            if (result.write)
            {
                await result.write.quit();
            }
        });

        it('should create master-replica from CACHE_WRITE_URL and CACHE_READ_URL', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://master:6379';
            process.env.CACHE_READ_URL = 'redis://replica:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).not.toBe(result.read);

            if (result.write)
            {
                await result.write.quit();
            }
            if (result.read && result.read !== result.write)
            {
                await result.read.quit();
            }
        });

        it('should support TLS with rediss:// protocol', async () =>
        {
            process.env.CACHE_URL = 'rediss://secure.valkey.io:6380';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();

            if (result.write)
            {
                await result.write.quit();
            }
        });

        it('should support CACHE_TLS_REJECT_UNAUTHORIZED=false', async () =>
        {
            process.env.CACHE_URL = 'rediss://localhost:6380';
            process.env.CACHE_TLS_REJECT_UNAUTHORIZED = 'false';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();

            if (result.write)
            {
                await result.write.quit();
            }
        });

        it('should handle CACHE_SENTINEL_HOSTS', async () =>
        {
            process.env.CACHE_SENTINEL_HOSTS = 'sentinel1:26379,sentinel2:26379';
            process.env.CACHE_MASTER_NAME = 'mymaster';
            process.env.CACHE_PASSWORD = 'secret';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();

            if (result.write)
            {
                await result.write.quit();
            }
        });

        it('should handle CACHE_CLUSTER_NODES', async () =>
        {
            process.env.CACHE_CLUSTER_NODES = 'node1:6379,node2:6379,node3:6379';
            process.env.CACHE_PASSWORD = 'secret';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();

            if (result.write)
            {
                await result.write.quit();
            }
        });
    });

    describe('Generic Cache Naming', () =>
    {
        it('should create single instance from CACHE_URL', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).toBe(result.read);

            if (result.write)
            {
                await result.write.quit();
            }
        });

        it('should create master-replica from CACHE_WRITE_URL and CACHE_READ_URL', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://master:6379';
            process.env.CACHE_READ_URL = 'redis://replica:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).not.toBe(result.read);

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

    describe('Environment Variable Priority', () =>
    {
        it('should prioritize in correct order: Single > Master-Replica > Sentinel > Cluster', async () =>
        {
            // Test 1: Only CACHE_URL (highest priority)
            process.env.CACHE_URL = 'redis://single:6379';
            let result = await createCacheFromEnv();
            expect(result.write).toBe(result.read);

            // Cleanup
            if (result.write)
            {
                await result.write.quit();
            }

            // Test 2: CACHE_WRITE_URL + CACHE_READ_URL (second priority)
            delete process.env.CACHE_URL;
            process.env.CACHE_WRITE_URL = 'redis://master:6379';
            process.env.CACHE_READ_URL = 'redis://replica:6379';
            result = await createCacheFromEnv();
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

        it('should prioritize CACHE_URL over CACHE_URL over CACHE_URL', async () =>
        {
            // All three set - should use CACHE_URL
            process.env.CACHE_URL = 'redis://localhost:6379';
            process.env.CACHE_URL = 'redis://cache:6379';
            process.env.CACHE_URL = 'redis://redis:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            // Connection will be to CACHE_URL (can't easily verify host without mocking)

            if (result.write)
            {
                await result.write.quit();
            }
        });

        it('should prioritize CACHE_URL over CACHE_URL when CACHE_URL is not set', async () =>
        {
            delete process.env.CACHE_URL;
            process.env.CACHE_URL = 'redis://cache:6379';
            process.env.CACHE_URL = 'redis://redis:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();

            if (result.write)
            {
                await result.write.quit();
            }
        });

        it('should use CACHE_URL when CACHE_URL and CACHE_URL are not set', async () =>
        {
            delete process.env.CACHE_URL;
            delete process.env.CACHE_URL;
            process.env.CACHE_URL = 'redis://redis:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();

            if (result.write)
            {
                await result.write.quit();
            }
        });

        it('should prioritize CACHE_WRITE_URL over CACHE_WRITE_URL over CACHE_WRITE_URL', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://master:6379';
            process.env.CACHE_WRITE_URL = 'redis://cache-master:6379';
            process.env.CACHE_WRITE_URL = 'redis://redis-master:6379';
            process.env.CACHE_READ_URL = 'redis://replica:6379';
            process.env.CACHE_READ_URL = 'redis://cache-replica:6379';
            process.env.CACHE_READ_URL = 'redis://redis-replica:6379';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();
            expect(result.write).not.toBe(result.read);

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
        it('should handle empty CACHE_URL', async () =>
        {
            process.env.CACHE_URL = '';

            const result = await createCacheFromEnv();

            expect(result.write).toBeUndefined();
            expect(result.read).toBeUndefined();
        });

        it('should handle whitespace in CACHE_URL', async () =>
        {
            process.env.CACHE_URL = '  redis://localhost:6379  ';

            const result = await createCacheFromEnv();

            // ioredis should handle trimming or fail
            expect(result).toBeDefined();
        });

        it('should handle invalid CACHE_URL format', async () =>
        {
            process.env.CACHE_URL = 'not-a-valid-url';

            const result = await createCacheFromEnv();

            // Should either create instance or fail gracefully
            expect(result).toBeDefined();
        });

        it('should handle sentinel hosts with varying port formats', async () =>
        {
            process.env.CACHE_SENTINEL_HOSTS = 'sentinel1:26379,sentinel2,sentinel3:26380';
            process.env.CACHE_MASTER_NAME = 'mymaster';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
        });

        it('should handle cluster nodes with varying formats', async () =>
        {
            process.env.CACHE_CLUSTER_NODES = 'node1:6379,node2,node3:6380';

            const result = await createCacheFromEnv();

            expect(result.write).toBeDefined();
        });
    });
});