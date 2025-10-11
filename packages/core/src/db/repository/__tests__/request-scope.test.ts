/**
 * Request-Scoped Repository Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    getScopedRepository,
    withRepositoryScope,
    RepositoryScope,
    getScopedCacheSize,
    isInRepositoryScope
} from '../request-scope.js';
import { Repository } from '../repository.js';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { id } from '../../schema/index.js';

// Test table
const testUsers = pgTable('test_users', {
    id: id(),
    name: text('name').notNull(),
    email: text('email').notNull().unique()
});

// Custom Repository
class TestUserRepository extends Repository<typeof testUsers>
{
    customMethod(): string
    {
        return 'custom';
    }
}

describe('Request-Scoped Repository', () =>
{
    describe('withRepositoryScope()', () =>
    {
        it('should create isolated scope', async () =>
        {
            const result1 = await withRepositoryScope(async () =>
            {
                const repo1 = getScopedRepository(testUsers);
                const repo2 = getScopedRepository(testUsers);
                return repo1 === repo2; // Same instance within scope
            });

            const result2 = await withRepositoryScope(async () =>
            {
                const repo1 = getScopedRepository(testUsers);
                const repo2 = getScopedRepository(testUsers);
                return repo1 === repo2; // Same instance within scope
            });

            expect(result1).toBe(true);
            expect(result2).toBe(true);
        });

        it('should isolate between different scopes', async () =>
        {
            let repo1Outside: Repository<typeof testUsers>;
            let repo2Outside: Repository<typeof testUsers>;

            await withRepositoryScope(async () =>
            {
                repo1Outside = getScopedRepository(testUsers);
            });

            await withRepositoryScope(async () =>
            {
                repo2Outside = getScopedRepository(testUsers);
            });

            // Different scopes = different instances
            expect(repo1Outside!).not.toBe(repo2Outside!);
        });

        it('should auto-clean cache after scope ends', async () =>
        {
            await withRepositoryScope(async () =>
            {
                getScopedRepository(testUsers);
                expect(getScopedCacheSize()).toBe(1);
            });

            // Outside scope - no cache
            expect(getScopedCacheSize()).toBe(0);
        });
    });

    describe('getScopedRepository()', () =>
    {
        it('should return same instance within scope', async () =>
        {
            await withRepositoryScope(async () =>
            {
                const repo1 = getScopedRepository(testUsers);
                const repo2 = getScopedRepository(testUsers);
                const repo3 = getScopedRepository(testUsers);

                expect(repo1).toBe(repo2);
                expect(repo2).toBe(repo3);
            });
        });

        it('should support custom repository classes', async () =>
        {
            await withRepositoryScope(async () =>
            {
                const repo1 = getScopedRepository(testUsers, TestUserRepository);
                const repo2 = getScopedRepository(testUsers, TestUserRepository);

                expect(repo1).toBe(repo2);
                expect(repo1).toBeInstanceOf(TestUserRepository);
                expect(repo1.customMethod()).toBe('custom');
            });
        });

        it('should cache base and custom repositories separately', async () =>
        {
            await withRepositoryScope(async () =>
            {
                const baseRepo = getScopedRepository(testUsers);
                const customRepo = getScopedRepository(testUsers, TestUserRepository);

                // Different classes = different instances
                expect(baseRepo).not.toBe(customRepo);
                expect(baseRepo).toBeInstanceOf(Repository);
                expect(customRepo).toBeInstanceOf(TestUserRepository);

                // But each is cached
                expect(getScopedRepository(testUsers)).toBe(baseRepo);
                expect(getScopedRepository(testUsers, TestUserRepository)).toBe(customRepo);
            });
        });

        it('should create new instance outside scope (graceful degradation)', () =>
        {
            // Outside scope - creates new instance every time
            const repo1 = getScopedRepository(testUsers);
            const repo2 = getScopedRepository(testUsers);

            expect(repo1).not.toBe(repo2);
            expect(repo1).toBeInstanceOf(Repository);
            expect(repo2).toBeInstanceOf(Repository);
        });
    });

    describe('RepositoryScope() middleware', () =>
    {
        it('should create scope for request', async () =>
        {
            const middleware = RepositoryScope();
            let repoInside: Repository<typeof testUsers>;

            // Simulate Hono context
            const mockContext = {} as any;
            const mockNext = async () =>
            {
                repoInside = getScopedRepository(testUsers);
                expect(isInRepositoryScope()).toBe(true);
                expect(getScopedCacheSize()).toBe(1);
            };

            await middleware(mockContext, mockNext);

            // After middleware - scope ended
            expect(isInRepositoryScope()).toBe(false);
            expect(getScopedCacheSize()).toBe(0);
        });
    });

    describe('isInRepositoryScope()', () =>
    {
        it('should return true inside scope', async () =>
        {
            await withRepositoryScope(async () =>
            {
                expect(isInRepositoryScope()).toBe(true);
            });
        });

        it('should return false outside scope', () =>
        {
            expect(isInRepositoryScope()).toBe(false);
        });
    });

    describe('getScopedCacheSize()', () =>
    {
        it('should return 0 outside scope', () =>
        {
            expect(getScopedCacheSize()).toBe(0);
        });

        it('should track cache size within scope', async () =>
        {
            await withRepositoryScope(async () =>
            {
                expect(getScopedCacheSize()).toBe(0);

                getScopedRepository(testUsers);
                expect(getScopedCacheSize()).toBe(1);

                getScopedRepository(testUsers); // Same instance
                expect(getScopedCacheSize()).toBe(1);

                getScopedRepository(testUsers, TestUserRepository); // Different class
                expect(getScopedCacheSize()).toBe(2);
            });
        });
    });

    describe('Nested scopes', () =>
    {
        it('should handle nested scopes correctly', async () =>
        {
            await withRepositoryScope(async () =>
            {
                const repo1 = getScopedRepository(testUsers);
                expect(getScopedCacheSize()).toBe(1);

                await withRepositoryScope(async () =>
                {
                    const repo2 = getScopedRepository(testUsers);
                    expect(getScopedCacheSize()).toBe(1);

                    // Inner scope has different instance
                    expect(repo1).not.toBe(repo2);
                });

                // Outer scope still has original instance
                expect(getScopedRepository(testUsers)).toBe(repo1);
                expect(getScopedCacheSize()).toBe(1);
            });
        });
    });

    describe('Memory management', () =>
    {
        it('should not leak memory across scopes', async () =>
        {
            const instances: Repository<typeof testUsers>[] = [];

            // Create 100 scopes
            for (let i = 0; i < 100; i++)
            {
                await withRepositoryScope(async () =>
                {
                    const repo = getScopedRepository(testUsers);
                    instances.push(repo);
                });
            }

            // All instances should be unique (no global cache leak)
            const uniqueInstances = new Set(instances);
            expect(uniqueInstances.size).toBe(100);

            // No active cache
            expect(getScopedCacheSize()).toBe(0);
        });
    });
});