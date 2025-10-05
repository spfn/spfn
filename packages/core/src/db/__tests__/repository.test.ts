/**
 * Repository Pattern Tests
 *
 * Test Repository CRUD methods
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { testUsers } from './fixtures/entities';
import { Repository } from '@core/db/repository';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL)
{
    throw new Error('DATABASE_URL environment variable is required for tests');
}

describe('Repository Pattern', () =>
{
    let client: ReturnType<typeof postgres>;
    let db: ReturnType<typeof drizzle>;
    let userRepo: Repository<typeof testUsers>;

    beforeAll(async () =>
    {
        client = postgres(DATABASE_URL, { max: 1 });
        db = drizzle(client);
        userRepo = new Repository(db, testUsers);

        // Note: Table is already created in setup.ts (test_users)
    });

    afterAll(async () =>
    {
        // Clean up test data
        await client`TRUNCATE TABLE test_users CASCADE`;
        await client.end();
    });

    beforeEach(async () =>
    {
        // Reset data before each test
        await client`TRUNCATE TABLE test_users CASCADE`;
    });

    describe('save()', () =>
    {
        it('should create new user', async () =>
        {
            const newUser = {
                email: 'test@example.com',
                name: 'Test User',
            };

            const created = await userRepo.save(newUser);

            expect(created.id).toBeDefined();
            expect(created.email).toBe('test@example.com');
            expect(created.name).toBe('Test User');
        });
    });

    describe('findById()', () =>
    {
        it('should find user by id', async () =>
        {
            const newUser = await userRepo.save({
                email: 'find@example.com',
            });

            const found = await userRepo.findById(newUser.id);

            expect(found).toBeDefined();
            expect(found?.id).toBe(newUser.id);
            expect(found?.email).toBe('find@example.com');
        });

        it('should return null when user not found', async () =>
        {
            const found = await userRepo.findById(999999);
            expect(found).toBeNull();
        });
    });

    describe('findAll()', () =>
    {
        it('should return all users', async () =>
        {
            await userRepo.save({ email: 'user1@example.com'});
            await userRepo.save({ email: 'user2@example.com'});
            await userRepo.save({ email: 'user3@example.com'});

            const all = await userRepo.findAll();

            expect(all).toHaveLength(3);
        });

        it('should return empty array when no users', async () =>
        {
            const all = await userRepo.findAll();
            expect(all).toEqual([]);
        });
    });

    describe('findPage()', () =>
    {
        beforeEach(async () =>
        {
            // Create 10 test users
            for (let i = 1; i <= 10; i++)
            {
                await userRepo.save({
                    email: `user${i}@example.com`,
                    name: `User ${i}`,
                });
            }
        });

        it('should return paginated results', async () =>
        {
            const result = await userRepo.findPage({
                pagination: { page: 1, limit: 5 },
            });

            expect(result.data).toHaveLength(5);
            expect(result.meta.total).toBe(10);
            expect(result.meta.page).toBe(1);
            expect(result.meta.totalPages).toBe(2);
        });

        it('should filter users by email', async () =>
        {
            const result = await userRepo.findPage({
                filters: { email: { like: 'user1' } },
            });

            expect(result.data.length).toBeGreaterThan(0);
            result.data.forEach(user =>
            {
                expect(user.email).toContain('user1');
            });
        });

        it('should sort users by createdAt desc', async () =>
        {
            const result = await userRepo.findPage({
                sort: [{ field: 'createdAt', direction: 'desc' }],
                pagination: { page: 1, limit: 10 },
            });

            expect(result.data).toHaveLength(10);
            // Verify descending order (newest first)
            for (let i = 0; i < result.data.length - 1; i++)
            {
                const current = new Date(result.data[i].createdAt).getTime();
                const next = new Date(result.data[i + 1].createdAt).getTime();
                expect(current).toBeGreaterThanOrEqual(next);
            }
        });
    });

    describe('update()', () =>
    {
        it('should update user', async () =>
        {
            const user = await userRepo.save({
                email: 'update@example.com',
                name: 'Old Name',
            });

            const updated = await userRepo.update(user.id, {
                name: 'New Name',
            });

            expect(updated).toBeDefined();
            expect(updated?.name).toBe('New Name');
            expect(updated?.email).toBe('update@example.com');
        });

        it('should return null when user not found', async () =>
        {
            const updated = await userRepo.update(999999, { name: 'test' });
            expect(updated).toBeNull();
        });
    });

    describe('delete()', () =>
    {
        it('should delete user', async () =>
        {
            const user = await userRepo.save({
                email: 'delete@example.com',
            });

            const deleted = await userRepo.delete(user.id);

            expect(deleted).toBeDefined();
            expect(deleted?.id).toBe(user.id);

            const found = await userRepo.findById(user.id);
            expect(found).toBeNull();
        });

        it('should return null when user not found', async () =>
        {
            const deleted = await userRepo.delete(999999);
            expect(deleted).toBeNull();
        });
    });

    describe('count()', () =>
    {
        it('should count all users', async () =>
        {
            await userRepo.save({ email: 'count1@example.com'});
            await userRepo.save({ email: 'count2@example.com'});
            await userRepo.save({ email: 'count3@example.com'});

            const count = await userRepo.count();
            expect(count).toBe(3);
        });

        it('should return 0 when no users', async () =>
        {
            const count = await userRepo.count();
            expect(count).toBe(0);
        });
    });
});