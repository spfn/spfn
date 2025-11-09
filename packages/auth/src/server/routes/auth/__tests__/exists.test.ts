/**
 * @spfn/auth - Account Exists Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb, isDatabaseAvailable } from '@/__tests__/helpers/db';
import { initializeAuth } from '@/server/services/rbac.service';
import { getRoleByName } from '@/server/services/role.service';
import { users } from '@/server/entities';
import type { ApiResponse } from '@spfn/core';
import type { CheckAccountExistsData } from '@/lib/types/api';
import app from '../index';

// Check if database is available before running tests
const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('POST /auth/exists', () =>
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

    describe('Email lookup', () =>
    {
        it('should return exists: true when user exists with email', async () =>
        {
            const db = getTestDb();

            // Get user role ID
            const userRole = await getRoleByName('user');

            // Create test user
            await db.insert(users).values(
                {
                    email: 'test@example.com',
                    passwordHash: 'hashed_password',
                    roleId: userRole!.id,
                    status: 'active',
                }
            );

            // Make request
            const req = new Request('http://localhost/_auth/exists',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'test@example.com' }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<CheckAccountExistsData>;

            // Debug: print response if not 200
            if (res.status !== 200)
            {
                console.log('Response status:', res.status);
                console.log('Response data:', JSON.stringify(data, null, 2));
            }

            expect(res.status).toBe(200);
            expect(data).toMatchObject(
                {
                    success: true,
                    data:
                        {
                            exists: true,
                            identifier: 'test@example.com',
                            identifierType: 'email',
                        },
                }
            );
        });

        it('should return exists: false when user does not exist with email', async () =>
        {
            const req = new Request('http://localhost/_auth/exists',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'nonexistent@example.com' }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<CheckAccountExistsData>;

            expect(res.status).toBe(200);
            expect(data).toMatchObject(
                {
                    success: true,
                    data:
                        {
                            exists: false,
                            identifier: 'nonexistent@example.com',
                            identifierType: 'email',
                        },
                }
            );
        });
    });

    describe('Phone lookup', () =>
    {
        it('should return exists: true when user exists with phone', async () =>
        {
            const db = getTestDb();

            // Get user role ID
            const userRole = await getRoleByName('user');

            // Create test user
            await db.insert(users).values(
                {
                    phone: '+821012345678',
                    passwordHash: 'hashed_password',
                    roleId: userRole!.id,
                    status: 'active',
                }
            );

            // Make request
            const req = new Request('http://localhost/_auth/exists',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: '+821012345678' }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<CheckAccountExistsData>;

            expect(res.status).toBe(200);
            expect(data).toMatchObject(
                {
                    success: true,
                    data:
                        {
                            exists: true,
                            identifier: '+821012345678',
                            identifierType: 'phone',
                        },
                }
            );
        });

        it('should return exists: false when user does not exist with phone', async () =>
        {
            const req = new Request('http://localhost/_auth/exists',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: '+821099999999' }),
                }
            );

            const res = await app.fetch(req);
            const data = await res.json() as ApiResponse<CheckAccountExistsData>;

            expect(res.status).toBe(200);
            expect(data).toMatchObject(
                {
                    success: true,
                    data:
                        {
                            exists: false,
                            identifier: '+821099999999',
                            identifierType: 'phone',
                        },
                }
            );
        });
    });

    describe('Validation', () =>
    {
        it('should return error when neither email nor phone is provided', async () =>
        {
            const req = new Request('http://localhost/_auth/exists',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should validate email format', async () =>
        {
            const req = new Request('http://localhost/_auth/exists',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: 'invalid-email' }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });

        it('should validate phone format (E.164)', async () =>
        {
            const req = new Request('http://localhost/_auth/exists',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: '010-1234-5678' }),
                }
            );

            const res = await app.fetch(req);

            expect(res.status).toBe(400);
        });
    });
});