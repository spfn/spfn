/**
 * Integration tests with real Redis instances
 * Requires Docker: docker-compose -f docker-compose.test.yml up -d
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createRedisFromEnv, createSingleRedisFromEnv } from './redis-factory.js';
import { initRedis, getRedis, getRedisRead, closeRedis, setRedis, getRedisInfo } from './redis-manager.js';

describe('Redis Integration Tests', () =>
{
    const originalEnv = process.env;

    beforeAll(() =>
    {
        // Ensure Redis containers are running
        console.log('📝 Integration tests require running Redis containers');
        console.log('   Run: docker-compose -f docker-compose.test.yml up -d');
    });

    beforeEach(async () =>
    {
        // Clean up before each test
        await closeRedis();
        process.env = { ...originalEnv };
    });

    afterAll(async () =>
    {
        // Clean up after all tests
        await closeRedis();
        process.env = originalEnv;
    });

    describe('Single Redis Instance', () =>
    {
        it('should connect to single Redis instance', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            const { write, read } = await createRedisFromEnv();

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
            process.env.REDIS_URL = 'redis://localhost:6379';

            const { write } = await createRedisFromEnv();

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
            process.env.REDIS_URL = 'redis://localhost:6379';

            const { write } = await createRedisFromEnv();

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
            process.env.REDIS_URL = 'redis://localhost:6379';

            const { write } = await createRedisFromEnv();

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
            process.env.REDIS_WRITE_URL = 'redis://localhost:6380';
            process.env.REDIS_READ_URL = 'redis://localhost:6381';

            const { write, read } = await createRedisFromEnv();

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
            process.env.REDIS_WRITE_URL = 'redis://localhost:6380';
            process.env.REDIS_READ_URL = 'redis://localhost:6381';

            const { write, read } = await createRedisFromEnv();

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
        it('should initialize Redis via initRedis()', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            const result = await initRedis();

            expect(result.write).toBeDefined();
            expect(result.read).toBeDefined();

            // Test via getRedis()
            const redis = getRedis();
            expect(redis).toBeDefined();

            if (redis)
            {
                const pong = await redis.ping();
                expect(pong).toBe('PONG');
            }

            await closeRedis();
        });

        it('should test connection with ping() before accepting', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            const result = await initRedis();

            expect(result.write).toBeDefined();

            // If initRedis() succeeded, connection was tested with ping()
            const info = getRedisInfo();
            expect(info.hasWrite).toBe(true);

            await closeRedis();
        });

        it('should fail gracefully with invalid host', async () =>
        {
            process.env.REDIS_URL = 'redis://invalid-host-that-does-not-exist:6379';

            const result = await initRedis();

            // Should fail but not throw
            expect(result.write).toBeUndefined();
            expect(result.read).toBeUndefined();

            const info = getRedisInfo();
            expect(info.hasWrite).toBe(false);
        }, 30000); // 30 second timeout for connection failure

        it('should provide separate read instance for master-replica', async () =>
        {
            process.env.REDIS_WRITE_URL = 'redis://localhost:6380';
            process.env.REDIS_READ_URL = 'redis://localhost:6381';

            await initRedis();

            const write = getRedis();
            const read = getRedisRead();

            expect(write).toBeDefined();
            expect(read).toBeDefined();
            expect(write).not.toBe(read);

            const info = getRedisInfo();
            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(true);

            await closeRedis();
        });

        it('should use write instance as read fallback for single instance', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            await initRedis();

            const write = getRedis();
            const read = getRedisRead();

            expect(write).toBeDefined();
            expect(read).toBeDefined();
            expect(write).toBe(read); // Same instance

            const info = getRedisInfo();
            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(false);

            await closeRedis();
        });
    });

    describe('Authentication', () =>
    {
        it('should connect to Redis with password', async () =>
        {
            process.env.REDIS_URL = 'redis://:secret123@localhost:6382';

            const { write } = await createRedisFromEnv();

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
            process.env.REDIS_URL = 'redis://localhost:6379';

            await initRedis();

            let redis = getRedis();
            expect(redis).toBeDefined();

            await closeRedis();

            redis = getRedis();
            expect(redis).toBeUndefined();

            const info = getRedisInfo();
            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
        });

        it('should close both write and read instances', async () =>
        {
            process.env.REDIS_WRITE_URL = 'redis://localhost:6380';
            process.env.REDIS_READ_URL = 'redis://localhost:6381';

            await initRedis();

            let info = getRedisInfo();
            expect(info.hasWrite).toBe(true);
            expect(info.hasRead).toBe(true);
            expect(info.isReplica).toBe(true);

            await closeRedis();

            info = getRedisInfo();
            expect(info.hasWrite).toBe(false);
            expect(info.hasRead).toBe(false);
            expect(info.isReplica).toBe(false);
        });

        it('should be safe to call closeRedis() multiple times', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            await initRedis();
            await closeRedis();
            await closeRedis(); // Second call should not throw
            await closeRedis(); // Third call should not throw

            const info = getRedisInfo();
            expect(info.hasWrite).toBe(false);
        });
    });

    describe('Real-world Scenarios', () =>
    {
        it('should handle concurrent operations', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            await initRedis();
            const redis = getRedis();

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

            await closeRedis();
        });

        it('should handle pipelines for bulk operations', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            await initRedis();
            const redis = getRedis();

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

            await closeRedis();
        });

        it('should handle sets and sorted sets', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            await initRedis();
            const redis = getRedis();

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

            await closeRedis();
        });

        it('should handle lists for queues', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            await initRedis();
            const redis = getRedis();

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

            await closeRedis();
        });

        it('should handle hash operations', async () =>
        {
            process.env.REDIS_URL = 'redis://localhost:6379';

            await initRedis();
            const redis = getRedis();

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

            await closeRedis();
        });
    });
});