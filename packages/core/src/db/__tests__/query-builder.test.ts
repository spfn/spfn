/**
 * Query Builder Tests
 *
 * Test QueryBuilder chainable API
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { testUsers } from './fixtures/entities';
import { Repository } from '../repository/repository.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL)
{
    throw new Error('DATABASE_URL environment variable is required for tests');
}

describe('QueryBuilder', () =>
{
    let client: ReturnType<typeof postgres>;
    let db: ReturnType<typeof drizzle>;
    let userRepo: Repository<typeof testUsers>;

    beforeAll(async () =>
    {
        client = postgres(DATABASE_URL, { max: 1 });
        db = drizzle(client);
        userRepo = new Repository(db, testUsers);
    });

    afterAll(async () =>
    {
        await client`TRUNCATE TABLE test_users CASCADE`;
        await client.end();
    });

    beforeEach(async () =>
    {
        await client`TRUNCATE TABLE test_users CASCADE`;
    });

    describe('query()', () =>
    {
        it('should return a QueryBuilder instance', () =>
        {
            const query = userRepo.query();

            expect(query).toBeDefined();
            expect(typeof query.where).toBe('function');
            expect(typeof query.orderBy).toBe('function');
            expect(typeof query.limit).toBe('function');
            expect(typeof query.offset).toBe('function');
        });
    });

    describe('where() chaining', () =>
    {
        beforeEach(async () =>
        {
            await userRepo.save({ email: 'admin@example.com', name: 'Admin' });
            await userRepo.save({ email: 'user1@example.com', name: 'User 1' });
            await userRepo.save({ email: 'user2@example.com', name: 'User 2' });
        });

        it('should filter by single condition', async () =>
        {
            const users = await userRepo
                .query()
                .where({ email: { like: 'user' } })
                .findMany();

            expect(users).toHaveLength(2);
            users.forEach(user =>
            {
                expect(user.email).toContain('user');
            });
        });

        it('should combine multiple where() calls with AND', async () =>
        {
            await userRepo.save({ email: 'admin-test@example.com', name: 'Admin Test' });

            const users = await userRepo
                .query()
                .where({ email: { like: 'admin' } })
                .where({ name: { like: 'Admin Test' } })
                .findMany();

            expect(users).toHaveLength(1);
            expect(users[0].email).toBe('admin-test@example.com');
        });
    });

    describe('orderBy() chaining', () =>
    {
        beforeEach(async () =>
        {
            await userRepo.save({ email: 'c@example.com', name: 'C User' });
            await userRepo.save({ email: 'a@example.com', name: 'A User' });
            await userRepo.save({ email: 'b@example.com', name: 'B User' });
        });

        it('should sort by email ascending', async () =>
        {
            const users = await userRepo
                .query()
                .orderBy('email', 'asc')
                .findMany();

            expect(users[0].email).toBe('a@example.com');
            expect(users[1].email).toBe('b@example.com');
            expect(users[2].email).toBe('c@example.com');
        });

        it('should sort by email descending', async () =>
        {
            const users = await userRepo
                .query()
                .orderBy('email', 'desc')
                .findMany();

            expect(users[0].email).toBe('c@example.com');
            expect(users[1].email).toBe('b@example.com');
            expect(users[2].email).toBe('a@example.com');
        });

        it('should support multiple orderBy calls', async () =>
        {
            await userRepo.save({ email: 'd@example.com', name: 'A User' });

            const users = await userRepo
                .query()
                .orderBy('name', 'asc')
                .orderBy('email', 'asc')
                .findMany();

            // First by name, then by email
            expect(users[0].name).toBe('A User');
            expect(users[1].name).toBe('A User');
            expect(users[0].email).toBe('a@example.com');
            expect(users[1].email).toBe('d@example.com');
        });
    });

    describe('limit() and offset()', () =>
    {
        beforeEach(async () =>
        {
            for (let i = 1; i <= 10; i++)
            {
                await userRepo.save({
                    email: `user${i}@example.com`,
                    name: `User ${i}`
                });
            }
        });

        it('should limit results', async () =>
        {
            const users = await userRepo
                .query()
                .limit(5)
                .findMany();

            expect(users).toHaveLength(5);
        });

        it('should skip records with offset', async () =>
        {
            const users = await userRepo
                .query()
                .orderBy('email', 'asc')
                .offset(5)
                .findMany();

            expect(users).toHaveLength(5);
            expect(users[0].email).toBe('user6@example.com');
        });

        it('should combine limit and offset for pagination', async () =>
        {
            const users = await userRepo
                .query()
                .orderBy('email', 'asc')
                .limit(3)
                .offset(2)
                .findMany();

            expect(users).toHaveLength(3);
            expect(users[0].email).toBe('user3@example.com');
            expect(users[2].email).toBe('user5@example.com');
        });
    });

    describe('findMany()', () =>
    {
        beforeEach(async () =>
        {
            await userRepo.save({ email: 'test1@example.com' });
            await userRepo.save({ email: 'test2@example.com' });
        });

        it('should return array of records', async () =>
        {
            const users = await userRepo
                .query()
                .findMany();

            expect(Array.isArray(users)).toBe(true);
            expect(users).toHaveLength(2);
        });

        it('should return empty array when no records', async () =>
        {
            await client`TRUNCATE TABLE test_users CASCADE`;

            const users = await userRepo
                .query()
                .findMany();

            expect(users).toEqual([]);
        });
    });

    describe('findOne()', () =>
    {
        beforeEach(async () =>
        {
            await userRepo.save({ email: 'first@example.com', name: 'First' });
            await userRepo.save({ email: 'second@example.com', name: 'Second' });
        });

        it('should return first matching record', async () =>
        {
            const user = await userRepo
                .query()
                .where({ email: { like: 'first' } })
                .findOne();

            expect(user).toBeDefined();
            expect(user?.email).toBe('first@example.com');
        });

        it('should return null when no match', async () =>
        {
            const user = await userRepo
                .query()
                .where({ email: { like: 'nonexistent' } })
                .findOne();

            expect(user).toBeNull();
        });

        it('should respect limit(1) behavior', async () =>
        {
            const user = await userRepo
                .query()
                .orderBy('email', 'asc')
                .findOne();

            expect(user).toBeDefined();
            expect(user?.email).toBe('first@example.com');
        });
    });

    describe('count()', () =>
    {
        beforeEach(async () =>
        {
            await userRepo.save({ email: 'admin@example.com' });
            await userRepo.save({ email: 'user1@example.com' });
            await userRepo.save({ email: 'user2@example.com' });
        });

        it('should count all records', async () =>
        {
            const count = await userRepo
                .query()
                .count();

            expect(count).toBe(3);
        });

        it('should count filtered records', async () =>
        {
            const count = await userRepo
                .query()
                .where({ email: { like: 'user' } })
                .count();

            expect(count).toBe(2);
        });

        it('should return 0 when no records', async () =>
        {
            const count = await userRepo
                .query()
                .where({ email: { like: 'nonexistent' } })
                .count();

            expect(count).toBe(0);
        });
    });

    describe('Complex chaining', () =>
    {
        beforeEach(async () =>
        {
            for (let i = 1; i <= 20; i++)
            {
                await userRepo.save({
                    email: `user${i}@example.com`,
                    name: `User ${i}`
                });
            }
        });

        it('should chain multiple methods', async () =>
        {
            const users = await userRepo
                .query()
                .where({ email: { like: 'user1' } })
                .orderBy('email', 'desc')
                .limit(5)
                .offset(0)
                .findMany();

            expect(users.length).toBeGreaterThan(0);
            expect(users.length).toBeLessThanOrEqual(5);
            users.forEach(user =>
            {
                expect(user.email).toContain('user1');
            });
        });

        it('should support query reuse', async () =>
        {
            const baseQuery = userRepo
                .query()
                .where({ email: { like: 'user1' } });

            const users = await baseQuery.findMany();
            const count = await baseQuery.count();

            expect(users.length).toBe(count);
        });
    });
});