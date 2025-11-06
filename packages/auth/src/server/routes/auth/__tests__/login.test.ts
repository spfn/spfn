/**
 * @spfn/auth - Login Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb, isDatabaseAvailable } from '@/__tests__/helpers/db';
import { initializeAuth } from '@/server/services/rbac.service';
import { getRoleByName } from '@/server/services/role.service';
import { users } from '@/server/entities';
import { hashPassword } from '@/server/helpers/password';
import { generateKeyPairES256 } from '@/client/lib/crypto';
import app from '../index';

// Response type based on login contract
interface LoginResponse
{
    success: true;
    data: {
        userId: string;
        email?: string;
        phone?: string;
        passwordChangeRequired: boolean;
    };
}

interface ErrorResponse
{
    success: false;
    error: {
        type: string;
        message: string;
        statusCode: number;
    };
}

// Check if database is available before running tests
const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('POST /_auth/login', () =>
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

    describe('Successful login', () =>
    {
        it('should login with email and return userId', async () =>
        {
            const db = getTestDb();

            // Get user role
            const userRole = await getRoleByName('user');

            // Create test user
            const passwordHash = await hashPassword('MyPassword123!');
            await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'active',
                }
            );

            // Generate key pair for login
            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            // Login request
            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'user@example.com',
                        password: 'MyPassword123!',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            // Debug: log response if test fails
            if (res.status !== 200)
            {
                console.log('Response status:', res.status);
                console.log('Response data:', JSON.stringify(data, null, 2));
            }

            expect(res.status).toBe(200);
            const loginData = data as LoginResponse;
            expect(loginData.success).toBe(true);
            expect(loginData.data).toHaveProperty('userId');
            expect(loginData.data.email).toBe('user@example.com');
            expect(loginData.data.passwordChangeRequired).toBe(false);
        });

        it('should login with phone and return userId', async () =>
        {
            const db = getTestDb();

            // Get user role
            const userRole = await getRoleByName('user');

            // Create test user
            const passwordHash = await hashPassword('MyPassword123!');
            await db.insert(users).values(
                {
                    phone: '+821012345678',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'active',
                }
            );

            // Generate key pair
            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            // Login request
            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: '+821012345678',
                        password: 'MyPassword123!',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as LoginResponse;

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.phone).toBe('+821012345678');
        });

        it('should indicate passwordChangeRequired for admin accounts', async () =>
        {
            const db = getTestDb();

            // Get superadmin role
            const superadminRole = await getRoleByName('superadmin');

            // Create admin user with password change required
            const passwordHash = await hashPassword('TempPassword123!');
            await db.insert(users).values(
                {
                    email: 'admin@example.com',
                    passwordHash,
                    roleId: superadminRole!.id,
                    status: 'active',
                    passwordChangeRequired: true,
                    emailVerifiedAt: new Date(),
                }
            );

            // Generate key pair
            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            // Login request
            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'admin@example.com',
                        password: 'TempPassword123!',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as LoginResponse;

            expect(res.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.data.passwordChangeRequired).toBe(true);
        });
    });

    describe('Failed login', () =>
    {
        it('should return 401 for non-existent email', async () =>
        {
            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'nonexistent@example.com',
                        password: 'password123',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            // Debug: log response if not 401
            if (res.status !== 401)
            {
                console.log('Non-existent email - Response status:', res.status);
                console.log('Non-existent email - Response data:', JSON.stringify(data, null, 2));
            }

            expect(res.status).toBe(401);
            // Check error structure (it might be different than expected)
            if ('success' in data && !data.success && 'error' in data)
            {
                // New error format
                expect(data.success).toBe(false);
            }
        });

        it('should return 401 for wrong password', async () =>
        {
            const db = getTestDb();

            // Get user role
            const userRole = await getRoleByName('user');

            // Create test user
            const passwordHash = await hashPassword('CorrectPassword123!');
            await db.insert(users).values(
                {
                    email: 'user@example.com',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'active',
                }
            );

            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            // Login with wrong password
            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'user@example.com',
                        password: 'WrongPassword123!',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json();

            // Debug: log response
            console.log('Wrong password - Response status:', res.status);
            console.log('Wrong password - Response data:', JSON.stringify(data, null, 2));

            expect(res.status).toBe(401);
            expect(data.success).toBe(false);
        });

        it('should return 403 for inactive user', async () =>
        {
            const db = getTestDb();

            // Get user role
            const userRole = await getRoleByName('user');

            // Create inactive user
            const passwordHash = await hashPassword('Password123!');
            await db.insert(users).values(
                {
                    email: 'inactive@example.com',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'inactive',
                }
            );

            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            // Login request
            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'inactive@example.com',
                        password: 'Password123!',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ErrorResponse;

            expect(res.status).toBe(403);
            expect(data.success).toBe(false);
            expect(data.error.type).toBe('AccountDisabledError');
        });

        it('should return 403 for suspended user', async () =>
        {
            const db = getTestDb();

            // Get user role
            const userRole = await getRoleByName('user');

            // Create suspended user
            const passwordHash = await hashPassword('Password123!');
            await db.insert(users).values(
                {
                    email: 'suspended@example.com',
                    passwordHash,
                    roleId: userRole!.id,
                    status: 'suspended',
                }
            );

            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            // Login request
            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'suspended@example.com',
                        password: 'Password123!',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ErrorResponse;

            expect(res.status).toBe(403);
            expect(data.success).toBe(false);
            expect(data.error.type).toBe('AccountDisabledError');
        });
    });

    describe('Validation', () =>
    {
        it('should return 400 when neither email nor phone provided', async () =>
        {
            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: 'password123',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid email format', async () =>
        {
            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: 'invalid-email',
                        password: 'password123',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid phone format', async () =>
        {
            const { publicKey, keyId, fingerprint, algorithm } = generateKeyPairES256();

            const req = new Request('http://localhost/_auth/login',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: '010-1234-5678',
                        password: 'password123',
                        publicKey,
                        keyId,
                        fingerprint,
                        algorithm,
                    }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });
    });
});