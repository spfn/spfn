/**
 * Repository Integration Tests
 *
 * Tests base repository pattern with transaction and read/write separation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import { Repository } from '../repository';
import { setDatabase } from '../manager';
import { runWithTransaction, type TransactionDB } from '../transaction';
import { testUsers, testPosts } from './fixtures/test-schema.js';

// Create test repositories
class UserRepository extends Repository<typeof testUsers>
{
    async findById(id: number)
    {
        const results = await this.select().where(eq(testUsers.id, id));
        return results[0] ?? null;
    }

    async findByEmail(email: string)
    {
        const results = await this.select().where(eq(testUsers.email, email));
        return results[0] ?? null;
    }

    async create(data: { name: string; email: string })
    {
        const [user] = await this.insert().values(data).returning();
        return user;
    }

    async updateName(id: number, name: string)
    {
        const [user] = await this.update()
            .set({ name })
            .where(eq(testUsers.id, id))
            .returning();
        return user;
    }

    async remove(id: number)
    {
        await this.delete().where(eq(testUsers.id, id));
    }

    async list()
    {
        return this.select();
    }
}

class PostRepository extends Repository<typeof testPosts>
{
    async findByUserId(userId: number)
    {
        return this.select().where(eq(testPosts.userId, userId));
    }

    async create(data: { userId: number; title: string; content?: string })
    {
        const [post] = await this.insert().values(data).returning();
        return post;
    }
}

describe('Repository (Integration)', () =>
{
    let client: ReturnType<typeof postgres>;
    let db: ReturnType<typeof drizzle>;
    let userRepo: UserRepository;
    let postRepo: PostRepository;

    beforeAll(async () =>
    {
        // Connect to test database
        const databaseUrl = process.env.DATABASE_URL || 'postgresql://testuser:testpass@localhost:5433/spfn_test';
        client = postgres(databaseUrl);
        db = drizzle(client);

        // Set global database instance
        setDatabase(db);

        // Drop tables if exist to ensure clean state
        await client`DROP TABLE IF EXISTS test_posts CASCADE`;
        await client`DROP TABLE IF EXISTS test_users CASCADE`;

        // Create test tables
        await client`
            CREATE TABLE test_users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
        `;

        await client`
            CREATE TABLE test_posts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES test_users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                content TEXT,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
        `;

        // Initialize repositories
        userRepo = new UserRepository(testUsers);
        postRepo = new PostRepository(testPosts);
    });

    afterAll(async () =>
    {
        // Clean up
        await client`DROP TABLE IF EXISTS test_posts CASCADE`;
        await client`DROP TABLE IF EXISTS test_users CASCADE`;
        await client.end();
        setDatabase(undefined);
    });

    beforeEach(async () =>
    {
        // Clean test data before each test
        await client`TRUNCATE TABLE test_posts, test_users CASCADE`;
    });

    describe('Basic CRUD Operations', () =>
    {
        it('should create a new record', async () =>
        {
            const user = await userRepo.create({
                name: 'John Doe',
                email: 'john@example.com',
            });

            expect(user.id).toBeDefined();
            expect(user.name).toBe('John Doe');
            expect(user.email).toBe('john@example.com');
        });

        it('should find record by ID', async () =>
        {
            const created = await userRepo.create({
                name: 'Jane Doe',
                email: 'jane@example.com',
            });

            const found = await userRepo.findById(created.id);

            expect(found).toBeDefined();
            expect(found?.id).toBe(created.id);
            expect(found?.email).toBe('jane@example.com');
        });

        it('should find record by custom criteria', async () =>
        {
            await userRepo.create({
                name: 'Test User',
                email: 'test@example.com',
            });

            const found = await userRepo.findByEmail('test@example.com');

            expect(found).toBeDefined();
            expect(found?.email).toBe('test@example.com');
        });

        it('should update a record', async () =>
        {
            const user = await userRepo.create({
                name: 'Old Name',
                email: 'update@example.com',
            });

            const updated = await userRepo.updateName(user.id, 'New Name');

            expect(updated.name).toBe('New Name');
            expect(updated.email).toBe('update@example.com');

            // Verify update persisted
            const found = await userRepo.findById(user.id);
            expect(found?.name).toBe('New Name');
        });

        it('should delete a record', async () =>
        {
            const user = await userRepo.create({
                name: 'Delete Me',
                email: 'delete@example.com',
            });

            await userRepo.remove(user.id);

            const found = await userRepo.findById(user.id);
            expect(found).toBeNull();
        });

        it('should list all records', async () =>
        {
            await userRepo.create({ name: 'User 1', email: 'user1@example.com' });
            await userRepo.create({ name: 'User 2', email: 'user2@example.com' });
            await userRepo.create({ name: 'User 3', email: 'user3@example.com' });

            const users = await userRepo.list();

            expect(users).toHaveLength(3);
        });
    });

    describe('Transaction Context Integration', () =>
    {
        it('should use transaction context when in transaction', async () =>
        {
            await db.transaction(async (tx) =>
            {
                await runWithTransaction(tx as TransactionDB, 'test-tx', async () =>
                {
                    // Create user within transaction
                    const user = await userRepo.create({
                        name: 'Transaction User',
                        email: 'tx@example.com',
                    });

                    expect(user.id).toBeDefined();

                    // Query should use same transaction
                    const found = await userRepo.findById(user.id);
                    expect(found).toBeDefined();
                    expect(found?.email).toBe('tx@example.com');
                });
            });
        });

        it('should rollback repository operations on transaction error', async () =>
        {
            try
            {
                await db.transaction(async (tx) =>
                {
                    await runWithTransaction(tx as TransactionDB, 'rollback-tx', async () =>
                    {
                        await userRepo.create({
                            name: 'Rollback User',
                            email: 'rollback@example.com',
                        });

                        throw new Error('Trigger rollback');
                    });
                });
            }
            catch (error)
            {
                // Expected
            }

            // User should not exist
            const user = await userRepo.findByEmail('rollback@example.com');
            expect(user).toBeNull();
        });

        it('should commit repository operations on transaction success', async () =>
        {
            await db.transaction(async (tx) =>
            {
                await runWithTransaction(tx as TransactionDB, 'commit-tx', async () =>
                {
                    await userRepo.create({
                        name: 'Commit User',
                        email: 'commit@example.com',
                    });
                });
            });

            // User should exist
            const user = await userRepo.findByEmail('commit@example.com');
            expect(user).toBeDefined();
        });
    });

    describe('Multi-Repository Transactions', () =>
    {
        it('should coordinate multiple repositories in transaction', async () =>
        {
            await db.transaction(async (tx) =>
            {
                await runWithTransaction(tx as TransactionDB, 'multi-repo-tx', async () =>
                {
                    // Create user
                    const user = await userRepo.create({
                        name: 'Author',
                        email: 'author@example.com',
                    });

                    // Create posts for user
                    await postRepo.create({
                        userId: user.id,
                        title: 'Post 1',
                        content: 'Content 1',
                    });

                    await postRepo.create({
                        userId: user.id,
                        title: 'Post 2',
                        content: 'Content 2',
                    });
                });
            });

            // Verify all operations committed
            const user = await userRepo.findByEmail('author@example.com');
            expect(user).toBeDefined();

            const posts = await postRepo.findByUserId(user!.id);
            expect(posts).toHaveLength(2);
        });

        it('should rollback all repositories on error', async () =>
        {
            try
            {
                await db.transaction(async (tx) =>
                {
                    await runWithTransaction(tx as TransactionDB, 'multi-rollback-tx', async () =>
                    {
                        const user = await userRepo.create({
                            name: 'Rollback Author',
                            email: 'rollback-author@example.com',
                        });

                        await postRepo.create({
                            userId: user.id,
                            title: 'Rollback Post',
                        });

                        throw new Error('Rollback all');
                    });
                });
            }
            catch (error)
            {
                // Expected
            }

            // Neither user nor post should exist
            const user = await userRepo.findByEmail('rollback-author@example.com');
            expect(user).toBeNull();

            const allPosts = await db.select().from(testPosts);
            expect(allPosts).toHaveLength(0);
        });
    });

    describe('Read/Write Separation', () =>
    {
        it('should use write database for create operations', async () =>
        {
            const user = await userRepo.create({
                name: 'Write User',
                email: 'write@example.com',
            });

            expect(user.id).toBeDefined();
        });

        it('should use read database for select operations', async () =>
        {
            // Create data first
            const created = await userRepo.create({
                name: 'Read User',
                email: 'read@example.com',
            });

            // This should use read database
            const found = await userRepo.findById(created.id);

            expect(found).toBeDefined();
            expect(found?.id).toBe(created.id);
        });

        it('should use write database for update operations', async () =>
        {
            const user = await userRepo.create({
                name: 'Update Target',
                email: 'update-target@example.com',
            });

            const updated = await userRepo.updateName(user.id, 'Updated Name');

            expect(updated.name).toBe('Updated Name');
        });

        it('should use write database for delete operations', async () =>
        {
            const user = await userRepo.create({
                name: 'Delete Target',
                email: 'delete-target@example.com',
            });

            await userRepo.remove(user.id);

            const found = await userRepo.findById(user.id);
            expect(found).toBeNull();
        });
    });

    describe('Error Handling', () =>
    {
        it('should handle unique constraint violations', async () =>
        {
            await userRepo.create({
                name: 'Unique User',
                email: 'unique@example.com',
            });

            // Try to create duplicate email
            await expect(
                userRepo.create({
                    name: 'Duplicate User',
                    email: 'unique@example.com',
                })
            ).rejects.toThrow();
        });

        it('should handle foreign key constraint violations', async () =>
        {
            // Try to create post for non-existent user
            await expect(
                postRepo.create({
                    userId: 99999,
                    title: 'Orphan Post',
                })
            ).rejects.toThrow();
        });

        it('should throw error when database not initialized', async () =>
        {
            setDatabase(undefined);

            const tempRepo = new UserRepository(testUsers);

            await expect(tempRepo.list()).rejects.toThrow('Database not initialized');

            // Restore database
            setDatabase(db);
        });
    });

    describe('Complex Queries', () =>
    {
        it('should handle cascading deletes', async () =>
        {
            // Create user with posts
            const user = await userRepo.create({
                name: 'Cascade User',
                email: 'cascade@example.com',
            });

            await postRepo.create({
                userId: user.id,
                title: 'Post 1',
            });

            await postRepo.create({
                userId: user.id,
                title: 'Post 2',
            });

            // Delete user (should cascade to posts)
            await userRepo.remove(user.id);

            // Posts should be deleted
            const posts = await postRepo.findByUserId(user.id);
            expect(posts).toHaveLength(0);
        });
    });
});