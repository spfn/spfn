import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Redis } from 'ioredis';

import { NonceManager, PublicKeyCache } from '../cache';
import { generateKeyPair } from '../crypto';

const createMockRedis = (): Redis =>
{
    const store = new Map<string, { value: string; expiry?: number }>();

    return {
        get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
        setex: vi.fn(async (key: string, ttl: number, value: string) =>
        {
            store.set(key, { value, expiry: Date.now() + ttl * 1000 });
            return 'OK';
        }),
        del: vi.fn(async (...keys: string[]) =>
        {
            let deleted = 0;
            for (const key of keys)
            {
                if (store.delete(key)) deleted++;
            }
            return deleted;
        }),
        keys: vi.fn(async (pattern: string) =>
        {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return Array.from(store.keys()).filter(k => regex.test(k));
        }),
        exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
        set: vi.fn(async (key: string, value: string, ...args: any[]) =>
        {
            if (args.includes('NX') && store.has(key))
            {
                return null;
            }
            const ttlIndex = args.indexOf('EX');
            const ttl = ttlIndex >= 0 ? args[ttlIndex + 1] : undefined;
            store.set(key, { value, expiry: ttl ? Date.now() + ttl * 1000 : undefined });
            return 'OK';
        }),
    } as any;
};

describe('PublicKeyCache', () =>
{
    let redis: Redis;
    let cache: PublicKeyCache;

    beforeEach(() =>
    {
        redis = createMockRedis();
        cache = new PublicKeyCache({ redis, memoryTTL: 60, redisTTL: 300 });
    });

    describe('get / set', () =>
    {
        it('should cache and retrieve public key', async () =>
        {
            const { publicKey } = generateKeyPair();
            const keyId = 'test-key-123';

            await cache.set(keyId, publicKey);
            const retrieved = await cache.get(keyId);

            expect(retrieved).toBe(publicKey);
        });

        it('should use memory cache (L1)', async () =>
        {
            const { publicKey } = generateKeyPair();
            const keyId = 'test-key-123';

            await cache.set(keyId, publicKey);

            await cache.get(keyId);
            await cache.get(keyId);

            expect(redis.get).toHaveBeenCalledTimes(0);
        });

        it('should fallback to Redis cache (L2)', async () =>
        {
            const { publicKey } = generateKeyPair();
            const keyId = 'test-key-123';

            await redis.setex(`pubkey:${keyId}`, 300, publicKey);

            const retrieved = await cache.get(keyId);

            expect(retrieved).toBe(publicKey);
            expect(redis.get).toHaveBeenCalledTimes(1);
        });

        it('should return null if key not found', async () =>
        {
            const retrieved = await cache.get('non-existent-key');
            expect(retrieved).toBeNull();
        });

        it('should reject invalid public key', async () =>
        {
            await expect(cache.set('test-key', 'invalid-key!')).rejects.toThrow(
                'Invalid public key format'
            );
        });
    });

    describe('delete', () =>
    {
        it('should delete key from all caches', async () =>
        {
            const { publicKey } = generateKeyPair();
            const keyId = 'test-key-123';

            await cache.set(keyId, publicKey);
            await cache.delete(keyId);

            const retrieved = await cache.get(keyId);
            expect(retrieved).toBeNull();
        });
    });

    describe('clear', () =>
    {
        it('should clear all caches', async () =>
        {
            const pair1 = generateKeyPair();
            const pair2 = generateKeyPair();

            await cache.set('key-1', pair1.publicKey);
            await cache.set('key-2', pair2.publicKey);

            await cache.clear();

            const retrieved1 = await cache.get('key-1');
            const retrieved2 = await cache.get('key-2');

            expect(retrieved1).toBeNull();
            expect(retrieved2).toBeNull();
        });
    });

    describe('getStats', () =>
    {
        it('should return cache stats', async () =>
        {
            const { publicKey } = generateKeyPair();

            await cache.set('key-1', publicKey);
            await cache.set('key-2', publicKey);

            const stats = cache.getStats();

            expect(stats.memorySize).toBe(2);
            expect(stats.memoryKeys).toContain('key-1');
            expect(stats.memoryKeys).toContain('key-2');
        });
    });
});

describe('NonceManager', () =>
{
    let redis: Redis;
    let manager: NonceManager;

    beforeEach(() =>
    {
        redis = createMockRedis();
        manager = new NonceManager(redis, 60);
    });

    describe('checkAndStore', () =>
    {
        it('should accept new nonce', async () =>
        {
            const nonce = 'nonce-123';
            const isNew = await manager.checkAndStore(nonce);

            expect(isNew).toBe(true);
        });

        it('should reject duplicate nonce', async () =>
        {
            const nonce = 'nonce-123';

            const isNew1 = await manager.checkAndStore(nonce);
            const isNew2 = await manager.checkAndStore(nonce);

            expect(isNew1).toBe(true);
            expect(isNew2).toBe(false);
        });
    });

    describe('exists', () =>
    {
        it('should return true if nonce exists', async () =>
        {
            const nonce = 'nonce-123';
            await manager.store(nonce);

            const exists = await manager.exists(nonce);
            expect(exists).toBe(true);
        });

        it('should return false if nonce does not exist', async () =>
        {
            const exists = await manager.exists('non-existent-nonce');
            expect(exists).toBe(false);
        });
    });

    describe('store', () =>
    {
        it('should store nonce', async () =>
        {
            const nonce = 'nonce-123';
            await manager.store(nonce);

            const exists = await manager.exists(nonce);
            expect(exists).toBe(true);
        });
    });
});