/**
 * @spfn/auth - Change Password Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestDb, teardownTestDb, clearTables, getTestDb, isDatabaseAvailable } from '@/__tests__/helpers/db';
import { initializeAuth } from '@/server/services/rbac.service';
import { getRoleByName } from '@/server/services/role.service';
import { users, userPublicKeys } from '@/server/entities/config';
import { hashPassword } from '@/server/helpers/password';
import { generateKeyPairES256, generateClientToken } from '@/server/lib/crypto';
import type { ApiResponse } from '@spfn/core';
import type { ChangePasswordData } from '@/lib/types/api';
import app from '../index';

// Check if database is available before running tests
const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('PUT /_auth/password', () =>
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

        // Initialize RBAC system
        await initializeAuth();
    });

    describe('Successful password change', () =>
    {
        it('should change password with valid credentials', async () =>
        {
            const db = getTestDb();

            // Get user role
            const userRole = await getRoleByName('user');

            // Create test user
            const oldPasswordHash = await hashPassword('OldPassword123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash: oldPasswordHash,
                    roleId: userRole!.id,
                    status: 'active',
                }
            ).returning();

            // Generate key pair and register public key
            const { privateKey, publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();
            await db.insert(userPublicKeys).values({
                userId: user.id,
                keyId,
                publicKey,
                fingerprint,
                algorithm,
                isActive: true,
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
            });

            // Generate client-signed token
            const token = generateClientToken(
                { userId: String(user.id) },
                privateKey,
                algorithm
            );

            // Change password request
            const req = new Request('http://localhost/_auth/password',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'X-Key-Id': keyId,
                    },
                    body: JSON.stringify({
                        currentPassword: 'OldPassword123!',
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<ChangePasswordData>;

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            if (data.success)
            {
                expect(data.data.success).toBe(true);
            }

            // Verify password was actually changed in DB
            const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));
            expect(updatedUser.passwordHash).not.toBe(oldPasswordHash);
            expect(updatedUser.passwordChangeRequired).toBe(false);
        });

        it('should clear passwordChangeRequired flag after password change', async () =>
        {
            const db = getTestDb();

            // Get superadmin role
            const superadminRole = await getRoleByName('superadmin');

            // Create admin user with password change required
            const oldPasswordHash = await hashPassword('TempPassword123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'admin@example.com',
                    passwordHash: oldPasswordHash,
                    roleId: superadminRole!.id,
                    status: 'active',
                    passwordChangeRequired: true,
                }
            ).returning();

            // Generate key pair and register public key
            const { privateKey, publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();
            await db.insert(userPublicKeys).values({
                userId: user.id,
                keyId,
                publicKey,
                fingerprint,
                algorithm,
                isActive: true,
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            });

            // Generate client-signed token
            const token = generateClientToken(
                { userId: String(user.id) },
                privateKey,
                algorithm
            );

            // Change password request
            const req = new Request('http://localhost/_auth/password',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'X-Key-Id': keyId,
                    },
                    body: JSON.stringify({
                        currentPassword: 'TempPassword123!',
                        newPassword: 'NewSecurePassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<ChangePasswordData>;

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);

            // Verify passwordChangeRequired was cleared
            const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));
            expect(updatedUser.passwordChangeRequired).toBe(false);
        });
    });

    describe('Failed password change', () =>
    {
        it('should return 401 without authentication token', async () =>
        {
            const req = new Request('http://localhost/_auth/password',
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        currentPassword: 'OldPassword123!',
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<ChangePasswordData>;

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
        });

        it('should return 401 with invalid token', async () =>
        {
            const req = new Request('http://localhost/_auth/password',
                {
                    method: 'PUT',
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
            const data = await res.json() as ApiResponse<ChangePasswordData>;

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
        });

        it('should return 401 for wrong current password', async () =>
        {
            const db = getTestDb();

            // Create test user
            // Get user role
            const userRole = await getRoleByName('user');

            const passwordHash = await hashPassword('CorrectPassword123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'active',
                }
            ).returning();

            // Generate key pair and register public key
            const { privateKey, publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();
            await db.insert(userPublicKeys).values({
                userId: user.id,
                keyId,
                publicKey,
                fingerprint,
                algorithm,
                isActive: true,
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            });

            const token = generateClientToken(
                { userId: String(user.id) },
                privateKey,
                algorithm
            );

            // Try to change password with wrong current password
            const req = new Request('http://localhost/_auth/password',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'X-Key-Id': keyId,
                    },
                    body: JSON.stringify({
                        currentPassword: 'WrongPassword123!',
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<ChangePasswordData>;

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
        });

        it('should return 403 for suspended user', async () =>
        {
            const db = getTestDb();

            // Get user role
            const userRole = await getRoleByName('user');

            // Create suspended user
            const passwordHash = await hashPassword('Password123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'suspended@example.com',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'suspended',
                }
            ).returning();

            // Generate key pair and register public key
            const { privateKey, publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();
            await db.insert(userPublicKeys).values({
                userId: user.id,
                keyId,
                publicKey,
                fingerprint,
                algorithm,
                isActive: true,
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            });

            const token = generateClientToken(
                { userId: String(user.id) },
                privateKey,
                algorithm
            );

            // Try to change password
            const req = new Request('http://localhost/_auth/password',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'X-Key-Id': keyId,
                    },
                    body: JSON.stringify({
                        currentPassword: 'Password123!',
                        newPassword: 'NewPassword456!',
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<ChangePasswordData>;

            expect(res.status).toBe(403);
            expect(data.success).toBe(false);
        });
    });

    describe('Validation', () =>
    {
        it('should return 400 for short new password', async () =>
        {
            const db = getTestDb();

            // Get user role
            const userRole = await getRoleByName('user');

            const passwordHash = await hashPassword('OldPassword123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'active',
                }
            ).returning();

            // Generate key pair and register public key
            const { privateKey, publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();
            await db.insert(userPublicKeys).values({
                userId: user.id,
                keyId,
                publicKey,
                fingerprint,
                algorithm,
                isActive: true,
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            });

            const token = generateClientToken(
                { userId: String(user.id) },
                privateKey,
                algorithm
            );

            const req = new Request('http://localhost/_auth/password',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'X-Key-Id': keyId,
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

            // Get user role
            const userRole = await getRoleByName('user');

            const passwordHash = await hashPassword('Password123!');
            const [user] = await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'active',
                }
            ).returning();

            // Generate key pair and register public key
            const { privateKey, publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();
            await db.insert(userPublicKeys).values({
                userId: user.id,
                keyId,
                publicKey,
                fingerprint,
                algorithm,
                isActive: true,
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            });

            const token = generateClientToken(
                { userId: String(user.id) },
                privateKey,
                algorithm
            );

            const req = new Request('http://localhost/_auth/password',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'X-Key-Id': keyId,
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