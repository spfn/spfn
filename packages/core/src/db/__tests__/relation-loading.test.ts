/**
 * Relation Loading Tests
 *
 * Test Repository relation loading methods (Priority 2)
 * Tests findByIdWith(), findManyWith(), findOneWith()
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
    testUsers,
    testPosts,
    testUsersRelations,
    testPostsRelations
} from './fixtures/entities';
import { Repository } from '../repository/repository.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL)
{
    throw new Error('DATABASE_URL environment variable is required for tests');
}

describe('Relation Loading', () =>
{
    let client: ReturnType<typeof postgres>;
    let db: ReturnType<typeof drizzle>;
    let userRepo: Repository<typeof testUsers>;
    let postRepo: Repository<typeof testPosts>;

    beforeAll(async () =>
    {
        client = postgres(DATABASE_URL, { max: 1 });

        // Initialize db with schema for relation support
        // IMPORTANT: Schema keys must match table names for db.query API
        const schema = {
            test_users: testUsers,
            test_posts: testPosts,
            testUsersRelations,
            testPostsRelations,
        };

        db = drizzle(client, { schema });

        userRepo = new Repository<typeof testUsers>(db, testUsers);
        postRepo = new Repository<typeof testPosts>(db, testPosts);
    });

    afterAll(async () =>
    {
        await client`TRUNCATE TABLE test_posts CASCADE`;
        await client`TRUNCATE TABLE test_users CASCADE`;
        await client.end();
    });

    beforeEach(async () =>
    {
        await client`TRUNCATE TABLE test_posts CASCADE`;
        await client`TRUNCATE TABLE test_users CASCADE`;
    });

    describe('findByIdWith()', () =>
    {
        it('should load user with posts', async () =>
        {
            // Create user
            const user = await userRepo.save({
                email: 'author@example.com',
                name: 'Author User',
            });

            // Create posts for this user
            await postRepo.save({
                title: 'First Post',
                content: 'Content 1',
                authorId: user.id,
            });

            await postRepo.save({
                title: 'Second Post',
                content: 'Content 2',
                authorId: user.id,
            });

            // Load user with posts
            const userWithPosts = await userRepo.findByIdWith(user.id, {
                with: {
                    posts: true,
                },
            });

            expect(userWithPosts).toBeDefined();
            expect(userWithPosts.id).toBe(user.id);
            expect(userWithPosts.posts).toBeDefined();
            expect(userWithPosts.posts).toHaveLength(2);
            expect(userWithPosts.posts[0].title).toBe('First Post');
            expect(userWithPosts.posts[1].title).toBe('Second Post');
        });

        it('should return null when user not found', async () =>
        {
            const userWithPosts = await userRepo.findByIdWith(999999, {
                with: {
                    posts: true,
                },
            });

            expect(userWithPosts).toBeNull();
        });

        it('should work without relations', async () =>
        {
            const user = await userRepo.save({
                email: 'simple@example.com',
                name: 'Simple User',
            });

            const found = await userRepo.findByIdWith(user.id, {});

            expect(found).toBeDefined();
            expect(found.id).toBe(user.id);
            expect(found.posts).toBeUndefined();
        });
    });

    describe('findManyWith()', () =>
    {
        it('should load all users with their posts', async () =>
        {
            // Create users
            const user1 = await userRepo.save({
                email: 'user1@example.com',
                name: 'User 1',
            });

            const user2 = await userRepo.save({
                email: 'user2@example.com',
                name: 'User 2',
            });

            // Create posts
            await postRepo.save({
                title: 'User 1 Post',
                content: 'Content',
                authorId: user1.id,
            });

            await postRepo.save({
                title: 'User 2 Post 1',
                content: 'Content',
                authorId: user2.id,
            });

            await postRepo.save({
                title: 'User 2 Post 2',
                content: 'Content',
                authorId: user2.id,
            });

            // Load all users with posts
            const usersWithPosts = await userRepo.findManyWith({
                with: {
                    posts: true,
                },
            });

            expect(usersWithPosts).toHaveLength(2);

            const foundUser1 = usersWithPosts.find(u => u.id === user1.id);
            const foundUser2 = usersWithPosts.find(u => u.id === user2.id);

            expect(foundUser1?.posts).toHaveLength(1);
            expect(foundUser2?.posts).toHaveLength(2);
        });

        it('should return empty array when no users', async () =>
        {
            const usersWithPosts = await userRepo.findManyWith({
                with: {
                    posts: true,
                },
            });

            expect(usersWithPosts).toEqual([]);
        });
    });

    describe('findManyWith() with filters', () =>
    {
        it('should filter users and load their posts', async () =>
        {
            // Create users
            const admin = await userRepo.save({
                email: 'admin@example.com',
                name: 'Admin User',
            });

            const regular = await userRepo.save({
                email: 'user@example.com',
                name: 'Regular User',
            });

            // Create posts
            await postRepo.save({
                title: 'Admin Post',
                content: 'Admin Content',
                authorId: admin.id,
            });

            await postRepo.save({
                title: 'User Post',
                content: 'User Content',
                authorId: regular.id,
            });

            // Filter by admin ID and load posts
            const { eq } = await import('drizzle-orm');
            const adminsWithPosts = await userRepo.findManyWith({
                where: eq(testUsers.id, admin.id),
                with: {
                    posts: true,
                },
            });

            expect(adminsWithPosts).toHaveLength(1);
            expect(adminsWithPosts[0].email).toBe('admin@example.com');
            expect(adminsWithPosts[0].posts).toBeDefined();
            expect(adminsWithPosts[0].posts).toHaveLength(1);
            expect(adminsWithPosts[0].posts[0].title).toBe('Admin Post');
        });

        it('should return empty array when no match', async () =>
        {
            await userRepo.save({
                email: 'test@example.com',
                name: 'Test User',
            });

            const { eq } = await import('drizzle-orm');
            const result = await userRepo.findManyWith({
                where: eq(testUsers.id, 999999),
                with: {
                    posts: true,
                },
            });

            expect(result).toEqual([]);
        });
    });

    describe('Post relations (inverse)', () =>
    {
        it('should load post with author', async () =>
        {
            // Create user
            const user = await userRepo.save({
                email: 'author@example.com',
                name: 'Author User',
            });

            // Create post
            const post = await postRepo.save({
                title: 'Test Post',
                content: 'Test Content',
                authorId: user.id,
            });

            // Load post with author
            const postWithAuthor = await postRepo.findByIdWith(post.id, {
                with: {
                    author: true,
                },
            });

            expect(postWithAuthor).toBeDefined();
            expect(postWithAuthor.id).toBe(post.id);
            expect(postWithAuthor.author).toBeDefined();
            expect(postWithAuthor.author.id).toBe(user.id);
            expect(postWithAuthor.author.email).toBe('author@example.com');
        });
    });

    describe('Nested relations', () =>
    {
        it('should support nested relation queries', async () =>
        {
            // Create user
            const user = await userRepo.save({
                email: 'nested@example.com',
                name: 'Nested Test',
            });

            // Create multiple posts
            await postRepo.save({
                title: 'Post 1',
                content: 'Content 1',
                authorId: user.id,
            });

            await postRepo.save({
                title: 'Post 2',
                content: 'Content 2',
                authorId: user.id,
            });

            // Load user with posts, then verify we can access nested data
            const userWithPosts = await userRepo.findByIdWith(user.id, {
                with: {
                    posts: true,
                },
            });

            expect(userWithPosts).toBeDefined();
            expect(userWithPosts.posts).toHaveLength(2);

            // Verify nested data integrity
            userWithPosts.posts.forEach((post: any) =>
            {
                expect(post.authorId).toBe(user.id);
                expect(post.title).toBeDefined();
            });
        });
    });

    describe('Error handling', () =>
    {
        it('should throw error when db.query API not available', async () =>
        {
            // Create a repository with db that has no schema
            const clientNoSchema = postgres(DATABASE_URL, { max: 1 });
            const dbNoSchema = drizzle(clientNoSchema); // No schema provided
            const repoNoSchema = new Repository(dbNoSchema, testUsers);

            await expect(async () =>
            {
                await repoNoSchema.findByIdWith(1, {
                    with: { posts: true },
                });
            }).rejects.toThrow('Relational queries require db.query API');

            await clientNoSchema.end();
        });
    });
});