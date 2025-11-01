/**
 * @spfn/auth - Change Password Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb } from '../../../__tests__/helpers/db';
import { users } from '../../../entities';
import { hashPassword } from '../../../helpers/password';
import { generateToken } from '../../../helpers/jwt';
import app from '../index';

describe('POST /auth/change-password', () =>
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

    describe('Successful password change', () =>
    {
        it('should change password with valid credentials', async () =>
        {
            const db = getTestDb();

            // Create test user
            const oldPasswordHash = await hashPassword('OldPassword123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash: oldPasswordHash,
                    role: 'user',
                    status: 'active',
                }
            ).returning();

            // Generate auth token
            const token = generateToken({
                userId: user.id,
                role: user.role,
            });

            // Change password request
            const req = new Request('http://localhost/change-password',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        currentPassword: 'OldPassword123!',
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.success).toBe(true);

            // Verify password was actually changed in DB
            const [updatedUser] = await db.select().from(users).where(users => users.id === user.id);
            expect(updatedUser.passwordHash).not.toBe(oldPasswordHash);
            expect(updatedUser.passwordChangeRequired).toBe(false);
        });

        it('should clear passwordChangeRequired flag after password change', async () =>
        {
            const db = getTestDb();

            // Create admin user with password change required
            const oldPasswordHash = await hashPassword('TempPassword123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'admin@example.com',
                    passwordHash: oldPasswordHash,
                    role: 'superadmin',
                    status: 'active',
                    passwordChangeRequired: true,
                }
            ).returning();

            // Generate auth token
            const token = generateToken({
                userId: user.id,
                role: user.role,
            });

            // Change password request
            const req = new Request('http://localhost/change-password',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        currentPassword: 'TempPassword123!',
                        newPassword: 'NewSecurePassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);

            // Verify passwordChangeRequired was cleared
            const [updatedUser] = await db.select().from(users).where(users => users.id === user.id);
            expect(updatedUser.passwordChangeRequired).toBe(false);
        });
    });

    describe('Failed password change', () =>
    {
        it('should return 401 without authentication token', async () =>
        {
            const req = new Request('http://localhost/change-password',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        currentPassword: 'OldPassword123!',
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
            expect(data.error.code).toBe('UNAUTHORIZED');
        });

        it('should return 401 with invalid token', async () =>
        {
            const req = new Request('http://localhost/change-password',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer invalid-token',
                    },
                    body: JSON.stringify({
                        currentPassword: 'OldPassword123!',
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
        });

        it('should return 401 for wrong current password', async () =>
        {
            const db = getTestDb();

            // Create test user
            const passwordHash = await hashPassword('CorrectPassword123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                }
            ).returning();

            // Generate auth token
            const token = generateToken({
                userId: user.id,
                role: 'user',
            });

            // Try to change password with wrong current password
            const req = new Request('http://localhost/change-password',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        currentPassword: 'WrongPassword123!',
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
            expect(data.error.code).toBe('INVALID_CREDENTIALS');
        });

        it('should return 403 for suspended user', async () =>
        {
            const db = getTestDb();

            // Create suspended user
            const passwordHash = await hashPassword('Password123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'suspended@example.com',
                    passwordHash,
                    status: 'suspended',
                }
            ).returning();

            // Generate auth token
            const token = generateToken({
                userId: user.id,
                role: 'user',
            });

            // Try to change password
            const req = new Request('http://localhost/change-password',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        currentPassword: 'Password123!',
                        newPassword: 'NewPassword456!',
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
        it('should return 400 for short new password', async () =>
        {
            const db = getTestDb();

            const passwordHash = await hashPassword('OldPassword123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                }
            ).returning();

            const token = generateToken({
                userId: user.id,
                role: 'user',
            });

            const req = new Request('http://localhost/change-password',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        currentPassword: 'OldPassword123!',
                        newPassword: 'short', // Less than 8 characters
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should return 400 for missing currentPassword', async () =>
        {
            const db = getTestDb();

            const passwordHash = await hashPassword('Password123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                }
            ).returning();

            const token = generateToken({
                userId: user.id,
                role: 'user',
            });

            const req = new Request('http://localhost/change-password',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });
    });
});