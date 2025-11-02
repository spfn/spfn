/**
 * @spfn/auth - Login Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '@/__tests__/helpers/db';
import { users } from '@/server/entities';
import { hashPassword } from '@/server/helpers/password';
import app from '../index';

describe('POST /auth/login', () =>
{
    beforeAll(async () =>
    {
        await setupTestDb();
    });

    afterAll(async () =>
    {
        await teardownTestDb();
    });

    beforeEach(async () =>
    {
        const db = getTestDb();
        await clearTables(db);
    });

    describe('Successful login', () =>
    {
        it('should login with email and return token', async () =>
        {
            const db = getTestDb();

            // Create test user
            const passwordHash = await hashPassword('MyPassword123!');
            await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                    role: 'user',
                    status: 'active',
                }
            );

            // Login request
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'user@example.com',
                        password: 'MyPassword123!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data).toHaveProperty('token');
            expect(data.data).toHaveProperty('user');
            expect(data.data.user.email).toBe('user@example.com');
            expect(data.data.user.role).toBe('user');
            expect(data.data.passwordChangeRequired).toBe(false);
        });

        it('should login with phone and return token', async () =>
        {
            const db = getTestDb();

            // Create test user
            const passwordHash = await hashPassword('MyPassword123!');
            await db.insert(users).values(
                {
                    phone: '+821012345678',
                    passwordHash,
                    role: 'user',
                    status: 'active',
                }
            );

            // Login request
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: '+821012345678',
                        password: 'MyPassword123!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.user.phone).toBe('+821012345678');
        });

        it('should indicate passwordChangeRequired for admin accounts', async () =>
        {
            const db = getTestDb();

            // Create admin user with password change required
            const passwordHash = await hashPassword('TempPassword123!');
            await db.insert(users).values(
                {
                    email: 'admin@example.com',
                    passwordHash,
                    role: 'superadmin',
                    status: 'active',
                    passwordChangeRequired: true,
                    emailVerifiedAt: new Date(),
                }
            );

            // Login request
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'admin@example.com',
                        password: 'TempPassword123!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.passwordChangeRequired).toBe(true);
        });
    });

    describe('Failed login', () =>
    {
        it('should return 401 for non-existent email', async () =>
        {
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'nonexistent@example.com',
                        password: 'password123',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
            expect(data.error.code).toBe('INVALID_CREDENTIALS');
        });

        it('should return 401 for wrong password', async () =>
        {
            const db = getTestDb();

            // Create test user
            const passwordHash = await hashPassword('CorrectPassword123!');
            await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                }
            );

            // Login with wrong password
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'user@example.com',
                        password: 'WrongPassword123!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
            expect(data.error.code).toBe('INVALID_CREDENTIALS');
        });

        it('should return 403 for inactive user', async () =>
        {
            const db = getTestDb();

            // Create inactive user
            const passwordHash = await hashPassword('Password123!');
            await db.insert(users).values(
                {
                    email: 'inactive@example.com',
                    passwordHash,
                    status: 'inactive',
                }
            );

            // Login request
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'inactive@example.com',
                        password: 'Password123!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(403);
            expect(data.success).toBe(false);
            expect(data.error.code).toBe('FORBIDDEN');
        });

        it('should return 403 for suspended user', async () =>
        {
            const db = getTestDb();

            // Create suspended user
            const passwordHash = await hashPassword('Password123!');
            await db.insert(users).values(
                {
                    email: 'suspended@example.com',
                    passwordHash,
                    status: 'suspended',
                }
            );

            // Login request
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'suspended@example.com',
                        password: 'Password123!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(403);
            expect(data.success).toBe(false);
        });
    });

    describe('Validation', () =>
    {
        it('should return 400 when neither email nor phone provided', async () =>
        {
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: 'password123',
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid email format', async () =>
        {
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'invalid-email',
                        password: 'password123',
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid phone format', async () =>
        {
            const req = new Request('http://localhost/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: '010-1234-5678',
                        password: 'password123',
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });
    });
});