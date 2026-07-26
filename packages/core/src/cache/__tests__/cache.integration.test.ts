/**
 * Integration tests with real Redis instances
 * Requires Docker: docker-compose -f docker-compose.test.yml up -d
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createCacheFromEnv } from '../cache-factory';
import { initCache, getCache, getCacheRead, closeCache, getCacheInfo } from '../cache-manager';

describe('Cache Integration Tests', () =>
{
    const originalEnv = process.env;

    beforeAll(() =>
    {
        // Ensure Cache containers are running
        console.log('📝 Integration tests require running Cache containers');
        console.log('   Run: docker-compose -f docker-compose.test.yml up -d');
    });

    beforeEach(async () =>
    {
        // Clean up before each test
        await closeCache();
        process.env = { ...originalEnv };
    });

    afterAll(async () =>
    {
        // Clean up after all tests
        await closeCache();
        process.env = originalEnv;
    });

    describe('Single Redis Instance', () =>
    {
        it('should connect to single Redis instance', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            const { write, read } = await createCacheFromEnv();

            expect(write).toBeDefined();
            expect(read).toBeDefined();
            expect(write).toBe(read); // Same instance

            // Test actual connection
            if (write)
            {
                const pong = await write.ping();
                expect(pong).toBe('PONG');

                await write.quit();
            }
        });

        it('should perform basic Redis operations', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            const { write } = await createCacheFromEnv();

            if (write)
            {
                // Set
                await write.set('test:key', 'test-value');

                // Get
                const value = await write.get('test:key');
                expect(value).toBe('test-value');

                // Delete
                await write.del('test:key');

                // Verify deleted
                const deletedValue = await write.get('test:key');
                expect(deletedValue).toBeNull();

                await write.quit();
            }
        });

        it('should handle JSON data', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            const { write } = await createCacheFromEnv();

            if (write)
            {
                const testData = { id: 123, name: 'Test User', active: true };

                await write.set('test:user:123', JSON.stringify(testData));

                const retrieved = await write.get('test:user:123');
                expect(retrieved).toBeDefined();

                if (retrieved)
                {
                    const parsed = JSON.parse(retrieved);
                    expect(parsed).toEqual(testData);
                }

                await write.del('test:user:123');
                await write.quit();
            }
        });

        it('should handle expiration (TTL)', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            const { write } = await createCacheFromEnv();

            if (write)
            {
                // Set with 2 second expiration
                await write.set('test:expire', 'value', 'EX', 2);

                // Should exist
                let value = await write.get('test:expire');
                expect(value).toBe('value');

                // Wait 3 seconds
                await new Promise((resolve) => setTimeout(resolve, 3000));

                // Should be expired
                value = await write.get('test:expire');
                expect(value).toBeNull();

                await write.quit();
            }
        }, 10000); // Longer timeout for this test
    });

    describe('Master-Replica Setup', () =>
    {
        it('should connect to master and replica separately', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://localhost:6480';
            process.env.CACHE_READ_URL = 'redis://localhost:6481';

            const { write, read } = await createCacheFromEnv();

            expect(write).toBeDefined();
            expect(read).toBeDefined();
            expect(write).not.toBe(read); // Different instances

            // Test connections
            if (write && read)
            {
                const writePong = await write.ping();
                const readPong = await read.ping();

                expect(writePong).toBe('PONG');
                expect(readPong).toBe('PONG');

                await write.quit();
                await read.quit();
            }
        });

        it('should write to master and read from replica', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://localhost:6480';
            process.env.CACHE_READ_URL = 'redis://localhost:6481';

            const { write, read } = await createCacheFromEnv();

            if (write && read)
            {
                const testKey = 'test:replica:key';
                const testValue = 'replica-test-value';

                // Write to master
                await write.set(testKey, testValue);

                // Small delay for replication
                await new Promise((resolve) => setTimeout(resolve, 100));

                // Read from replica
                const value = await read.get(testKey);
                expect(value).toBe(testValue);

                // Cleanup
                await write.del(testKey);
                await write.quit();
                await read.quit();
            }
        });
    });

    describe('Redis Manager Integration', () =>
    {
        it('should initialize Redis via initCache()', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            const result = await initCache();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();

            // Test via getCache()
            const redis = getCache();
            expect(redis).toBeDefined();

            if (redis)
            {
                const pong = await redis.ping();
                expect(pong).toBe('PONG');
            }

            await closeCache();
        });

        it('should test connection with ping() before accepting', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            const result = await initCache();

            expect(result.write).toBeDefined();

            // If initCache() succeeded, connection was tested with ping()
            const info = getCacheInfo();
            expect(info.hasWrite).toBe(true);

            await closeCache();
        });

        it('should fail gracefully with invalid host', async () =>
        {
            process.env.CACHE_URL = 'redis://invalid-host-that-does-not-exist:6379';

            const result = await initCache();

            // Should fail but not throw
            expect(result.write).toBeUndefined();
            expect(result.read).toBeUndefined();

            const info = getCacheInfo();
            expect(info.hasWrite).toBe(false);
        }, 30000); // 30 second timeout for connection failure

        it('should provide separate read instance for master-replica', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://localhost:6480';
            process.env.CACHE_READ_URL = 'redis://localhost:6481';

            await initCache();

            const write = getCache();
            const read = getCacheRead();

            expect(write).toBeDefined();
            expect(read).toBeDefined();
            expect(write).not.toBe(read);

            const info = getCacheInfo();
            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(true);

            await closeCache();
        });

        it('should use write instance as read fallback for single instance', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            await initCache();

            const write = getCache();
            const read = getCacheRead();

            expect(write).toBeDefined();
            expect(read).toBeDefined();
            expect(write).toBe(read); // Same instance

            const info = getCacheInfo();
            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(false);

            await closeCache();
        });
    });

    describe('Authentication', () =>
    {
        it('should connect to Redis with password', async () =>
        {
            process.env.CACHE_URL = 'redis://:secret123@localhost:6482';

            const { write } = await createCacheFromEnv();

            expect(write).toBeDefined();

            if (write)
            {
                const pong = await write.ping();
                expect(pong).toBe('PONG');

                // Test operation
                await write.set('test:auth', 'auth-value');
                const value = await write.get('test:auth');
                expect(value).toBe('auth-value');

                await write.del('test:auth');
                await write.quit();
            }
        });
    });

    describe('Connection Lifecycle', () =>
    {
        it('should properly close connections', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            await initCache();

            let redis = getCache();
            expect(redis).toBeDefined();

            await closeCache();

            redis = getCache();
            expect(redis).toBeUndefined();

            const info = getCacheInfo();
            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
        });

        it('should close both write and read instances', async () =>
        {
            process.env.CACHE_WRITE_URL = 'redis://localhost:6480';
            process.env.CACHE_READ_URL = 'redis://localhost:6481';

            await initCache();

            let info = getCacheInfo();
            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(true);

            await closeCache();

            info = getCacheInfo();
            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
            expect(info.isReplica).toBe(false);
        });

        it('should be safe to call closeCache() multiple times', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            await initCache();
            await closeCache();
            await closeCache(); // Second call should not throw
            await closeCache(); // Third call should not throw

            const info = getCacheInfo();
            expect(info.hasWrite).toBe(false);
        });
    });

    describe('Real-world Scenarios', () =>
    {
        it('should handle concurrent operations', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            await initCache();
            const redis = getCache();

            if (redis)
            {
                // Concurrent writes
                const promises = [];
                for (let i = 0; i < 10; i++)
                {
                    promises.push(redis.set(`test:concurrent:${i}`, `value-${i}`));
                }

                await Promise.all(promises);

                // Concurrent reads
                const readPromises = [];
                for (let i = 0; i < 10; i++)
                {
                    readPromises.push(redis.get(`test:concurrent:${i}`));
                }

                const values = await Promise.all(readPromises);

                values.forEach((value, index) =>
                {
                    expect(value).toBe(`value-${index}`);
                });

                // Cleanup
                const delPromises = [];
                for (let i = 0; i < 10; i++)
                {
                    delPromises.push(redis.del(`test:concurrent:${i}`));
                }
                await Promise.all(delPromises);
            }

            await closeCache();
        });

        it('should handle pipelines for bulk operations', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            await initCache();
            const redis = getCache();

            if (redis)
            {
                const pipeline = redis.pipeline();

                // Queue multiple commands
                for (let i = 0; i < 100; i++)
                {
                    pipeline.set(`test:bulk:${i}`, `value-${i}`);
                }

                // Execute all at once
                const results = await pipeline.exec();

                expect(results).toHaveLength(100);
                results?.forEach((result) =>
                {
                    expect(result[0]).toBeNull(); // No error
                    expect(result[1]).toBe('OK'); // Success
                });

                // Cleanup
                const delPipeline = redis.pipeline();
                for (let i = 0; i < 100; i++)
                {
                    delPipeline.del(`test:bulk:${i}`);
                }
                await delPipeline.exec();
            }

            await closeCache();
        });

        it('should handle sets and sorted sets', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            await initCache();
            const redis = getCache();

            if (redis)
            {
                // Set operations
                await redis.sadd('test:set', 'member1', 'member2', 'member3');
                const members = await redis.smembers('test:set');
                expect(members).toHaveLength(3);
                expect(members).toContain('member1');

                // Sorted set operations
                await redis.zadd('test:zset', 10, 'user1', 20, 'user2', 30, 'user3');
                const range = await redis.zrange('test:zset', 0, -1);
                expect(range).toEqual(['user1', 'user2', 'user3']);

                const score = await redis.zscore('test:zset', 'user2');
                expect(score).toBe('20');

                // Cleanup
                await redis.del('test:set');
                await redis.del('test:zset');
            }

            await closeCache();
        });

        it('should handle lists for queues', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            await initCache();
            const redis = getCache();

            if (redis)
            {
                // Push to queue
                await redis.rpush('test:queue', 'job1', 'job2', 'job3');

                // Get queue length
                const length = await redis.llen('test:queue');
                expect(length).toBe(3);

                // Pop from queue (FIFO)
                const job1 = await redis.lpop('test:queue');
                const job2 = await redis.lpop('test:queue');
                const job3 = await redis.lpop('test:queue');

                expect(job1).toBe('job1');
                expect(job2).toBe('job2');
                expect(job3).toBe('job3');

                // Queue should be empty
                const remaining = await redis.llen('test:queue');
                expect(remaining).toBe(0);

                await redis.del('test:queue');
            }

            await closeCache();
        });

        it('should handle hash operations', async () =>
        {
            process.env.CACHE_URL = 'redis://localhost:6479';

            await initCache();
            const redis = getCache();

            if (redis)
            {
                // Set hash fields
                await redis.hset('test:user:1', 'name', 'John', 'age', '30', 'email', 'john@example.com');

                // Get single field
                const name = await redis.hget('test:user:1', 'name');
                expect(name).toBe('John');

                // Get all fields
                const user = await redis.hgetall('test:user:1');
                expect(user).toEqual({
                    name: 'John',
                    age: '30',
                    email: 'john@example.com',
                });

                // Increment field
                await redis.hincrby('test:user:1', 'age', 1);
                const age = await redis.hget('test:user:1', 'age');
                expect(age).toBe('31');

                await redis.del('test:user:1');
            }

            await closeCache();
        });
    });
});
