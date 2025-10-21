/**
 * Transaction Middleware Integration Tests
 *
 * Tests automatic transaction management in Hono routes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { Transactional } from '../transaction';
import { getTransaction, getTransactionId } from '../transaction/context.js';
import { setDatabase } from '../manager';
import { testUsers } from './fixtures/test-schema.js';

describe('Transaction Middleware (Integration)', () =>
{
    let client: ReturnType<typeof postgres>;
    let db: ReturnType<typeof drizzle>;

    beforeAll(async () =>
    {
        // Connect to test database
        const databaseUrl = process.env.DATABASE_URL || 'postgresql://testuser:testpass@localhost:5433/spfn_test';
        client = postgres(databaseUrl);
        db = drizzle(client);

        // Set global database instance
        setDatabase(db);

        // Drop table if exists to ensure clean state
        await client`DROP TABLE IF EXISTS test_users CASCADE`;

        // Create test table
        await client`
            CREATE TABLE test_users (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT NOW() NOT NULL
            )
        `;
    });

    afterAll(async () =>
    {
        // Clean up
        await client`DROP TABLE IF EXISTS test_users CASCADE`;
        await client.end();
        setDatabase(undefined);
    });

    beforeEach(async () =>
    {
        // Clean test data before each test
        await client`TRUNCATE TABLE test_users CASCADE`;
    });

    describe('Automatic Transaction Management', () =>
    {
        it('should provide transaction context in route handler', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional());

            app.get('/test', async (c) =>
            {
                const tx = getTransaction();
                const txId = getTransactionId();

                expect(tx).toBeDefined();
                expect(txId).toMatch(/^tx_/);

                return c.json({ success: true });
            });

            const response = await app.request('/test');
            expect(response.status).toBe(200);
        });

        it('should auto-commit on successful request', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional());

            app.post('/users', async (c) =>
            {
                const tx = getTransaction();

                const [user] = await tx!.insert(testUsers).values({
                    name: 'Auto Commit User',
                    email: 'autocommit@example.com',
                }).returning();

                return c.json(user, 201);
            });

            const response = await app.request('/users', { method: 'POST' });
            expect(response.status).toBe(201);

            // Verify data was committed
            const users = await db.select().from(testUsers);
            expect(users).toHaveLength(1);
            expect(users[0].email).toBe('autocommit@example.com');
        });

        it('should auto-rollback on error', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional());

            app.post('/users', async (c) =>
            {
                const tx = getTransaction();

                await tx!.insert(testUsers).values({
                    name: 'Rollback User',
                    email: 'rollback@example.com',
                });

                // Throw error to trigger rollback
                throw new Error('Something went wrong');
            });

            try
            {
                await app.request('/users', { method: 'POST' });
            }
            catch (error)
            {
                // Error expected
            }

            // Verify data was rolled back
            const users = await db.select().from(testUsers);
            expect(users).toHaveLength(0);
        });

        it('should rollback on validation error', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional());

            app.post('/users', async (c) =>
            {
                const tx = getTransaction();

                // Insert first user
                await tx!.insert(testUsers).values({
                    name: 'First User',
                    email: 'first@example.com',
                });

                // Try to insert duplicate email (should fail)
                await tx!.insert(testUsers).values({
                    name: 'Duplicate User',
                    email: 'first@example.com', // Same email
                });

                return c.json({ success: true });
            });

            try
            {
                await app.request('/users', { method: 'POST' });
            }
            catch (error)
            {
                // Unique constraint violation expected
            }

            // Verify both inserts were rolled back
            const users = await db.select().from(testUsers);
            expect(users).toHaveLength(0);
        });
    });

    describe('Transaction Options', () =>
    {
        it('should support custom slow threshold', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional({ slowThreshold: 100 }));

            app.get('/slow', async (c) =>
            {
                // Simulate slow operation
                await new Promise(resolve => setTimeout(resolve, 150));
                return c.json({ success: true });
            });

            const response = await app.request('/slow');
            expect(response.status).toBe(200);
            // Slow transaction warning should be logged (check logs manually)
        });

        it('should support disabling logging', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional({ enableLogging: false }));

            app.get('/test', async (c) =>
            {
                return c.json({ success: true });
            });

            const response = await app.request('/test');
            expect(response.status).toBe(200);
            // No logs should be emitted
        });

        it('should enforce transaction timeout', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional({ timeout: 100 }));

            app.get('/timeout', async (c) =>
            {
                // Simulate operation that exceeds timeout
                await new Promise(resolve => setTimeout(resolve, 200));
                return c.json({ success: true });
            });

            // Add error handler to expose error details
            app.onError((err, c) =>
            {
                return c.json({
                    error: err.message,
                    statusCode: 'statusCode' in err ? err.statusCode : 500,
                }, 500);
            });

            const response = await app.request('/timeout');

            // Timeout should result in error response
            expect(response.status).toBe(500);

            const body = await response.json();
            expect(body.error).toContain('Transaction timeout');
        }, 10000); // Test timeout 10s

        it('should allow disabling timeout', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional({ timeout: 0 }));

            app.get('/long', async (c) =>
            {
                // Simulate long operation (no timeout)
                await new Promise(resolve => setTimeout(resolve, 100));
                return c.json({ success: true });
            });

            const response = await app.request('/long');
            expect(response.status).toBe(200);
        });
    });

    describe('Complex Scenarios', () =>
    {
        it('should handle multiple database operations', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional());

            app.post('/complex', async (c) =>
            {
                const tx = getTransaction();

                // Insert multiple users
                const [user1] = await tx!.insert(testUsers).values({
                    name: 'User 1',
                    email: 'user1@example.com',
                }).returning();

                const [user2] = await tx!.insert(testUsers).values({
                    name: 'User 2',
                    email: 'user2@example.com',
                }).returning();

                // Update user1
                await tx!.update(testUsers)
                    .set({ name: 'Updated User 1' })
                    .where(sql`id = ${user1.id}`);

                return c.json({ users: [user1.id, user2.id] });
            });

            const response = await app.request('/complex', { method: 'POST' });
            expect(response.status).toBe(200);

            // Verify all operations were committed
            const users = await db.select().from(testUsers);
            expect(users).toHaveLength(2);
            expect(users.find(u => u.email === 'user1@example.com')?.name).toBe('Updated User 1');
        });

        it('should handle conditional operations', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional());

            app.post('/conditional', async (c) =>
            {
                const tx = getTransaction();
                const body = await c.req.json();

                // Insert user
                const [user] = await tx!.insert(testUsers).values({
                    name: body.name,
                    email: body.email,
                }).returning();

                // Conditionally rollback
                if (body.name === 'BadUser')
                {
                    throw new Error('Invalid user');
                }

                return c.json(user);
            });

            // Test successful case
            const response1 = await app.request('/conditional', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'GoodUser', email: 'good@example.com' }),
            });
            expect(response1.status).toBe(200);

            // Test rollback case
            try
            {
                await app.request('/conditional', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'BadUser', email: 'bad@example.com' }),
                });
            }
            catch (error)
            {
                // Expected
            }

            // Only GoodUser should exist
            const users = await db.select().from(testUsers);
            expect(users).toHaveLength(1);
            expect(users[0].email).toBe('good@example.com');
        });

        it('should isolate transactions between concurrent requests', async () =>
        {
            const app = new Hono();

            app.use('*', Transactional());

            app.post('/concurrent', async (c) =>
            {
                const tx = getTransaction();
                const body = await c.req.json();

                // Simulate some delay
                await new Promise(resolve => setTimeout(resolve, 50));

                await tx!.insert(testUsers).values({
                    name: body.name,
                    email: body.email,
                });

                return c.json({ success: true });
            });

            // Send concurrent requests
            await Promise.all([
                app.request('/concurrent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'User A', email: 'a@example.com' }),
                }),
                app.request('/concurrent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: 'User B', email: 'b@example.com' }),
                }),
            ]);

            // Both users should be inserted
            const users = await db.select().from(testUsers);
            expect(users).toHaveLength(2);
        });
    });
});