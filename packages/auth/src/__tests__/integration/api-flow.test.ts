/**
 * @spfn/auth - API Flow Integration Tests
 *
 * Real integration tests using actual HTTP requests to Hono app
 * Tests complete flow: register → login → authenticated requests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb, isDatabaseAvailable } from '../helpers/db';
import app from '@/server/routes';
import { initializeAuth } from '@/server/services/rbac.service';

// Check if database is available before running tests
const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('API Flow Integration', () =>
{
    beforeAll(async () =>
    {
        await setupTestDb();
        process.env.SPFN_AUTH_SESSION_SECRET = 'test-secret-key-for-testing-only-min-32-chars';
    });

    afterAll(async () =>
    {
        await teardownTestDb();
    });

    beforeEach(async () =>
    {
        const db = getTestDb();
        await clearTables(db);
        await initializeAuth();
    });

    it('should complete full registration flow via HTTP', async () =>
    {
        // 1. Register new user via HTTP POST
        const registerResponse = await app.request('/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'test@example.com',
                password: 'SecurePassword123!',
                publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',  // Mock public key
                keyId: 'mock-key-id',
                fingerprint: 'mock-fingerprint',
                algorithm: 'ES256',
                keySize: 91
            })
        });

        // 2. Verify response
        expect(registerResponse.status).toBe(200);

        const data = await registerResponse.json();
        expect(data.success).toBe(true);
        expect(data.data.userId).toBeDefined();
        expect(data.data.email).toBe('test@example.com');

        // 3. Verify session cookie was set
        const setCookieHeader = registerResponse.headers.get('Set-Cookie');
        expect(setCookieHeader).toBeTruthy();
        expect(setCookieHeader).toContain('session=');
        expect(setCookieHeader).toContain('HttpOnly');
    });

    it('should complete login → authenticated request flow', async () =>
    {
        // 1. First register a user
        await app.request('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'login@example.com',
                password: 'Password123!',
                publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
                keyId: 'register-key-id',
                fingerprint: 'register-fingerprint',
                algorithm: 'ES256',
                keySize: 91
            })
        });

        // 2. Login with credentials
        const loginResponse = await app.request('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'login@example.com',
                password: 'Password123!',
                publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
                keyId: 'login-key-id',
                fingerprint: 'login-fingerprint',
                algorithm: 'ES256',
                keySize: 91,
                oldKeyId: 'register-key-id'  // Rotate from register key
            })
        });

        expect(loginResponse.status).toBe(200);

        const loginData = await loginResponse.json();
        expect(loginData.success).toBe(true);
        expect(loginData.data.userId).toBeDefined();

        // 3. Extract session cookie
        const sessionCookie = loginResponse.headers.get('Set-Cookie');
        expect(sessionCookie).toBeTruthy();

        // 4. TODO: Test authenticated request with JWT
        // For now, we can verify logout works with cookie
        const logoutResponse = await app.request('/auth/logout', {
            method: 'POST',
            headers: {
                'Cookie': sessionCookie!
            }
        });

        expect(logoutResponse.status).toBe(200);
        const logoutData = await logoutResponse.json();
        expect(logoutData.success).toBe(true);
    });

    it('should reject invalid credentials', async () =>
    {
        const response = await app.request('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'nonexistent@example.com',
                password: 'WrongPassword123!',
                publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
                keyId: 'test-key',
                fingerprint: 'test-fingerprint',
                algorithm: 'ES256',
                keySize: 91
            })
        });

        expect(response.status).toBe(401);

        const data = await response.json();
        expect(data.success).toBe(false);
    });

    it('should check if account exists', async () =>
    {
        // Register user first
        await app.request('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'exists@example.com',
                password: 'Password123!',
                publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
                keyId: 'test-key',
                fingerprint: 'test-fingerprint',
                algorithm: 'ES256',
                keySize: 91
            })
        });

        // Check if email exists
        const existsResponse = await app.request('/auth/exists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'exists@example.com'
            })
        });

        expect(existsResponse.status).toBe(200);

        const existsData = await existsResponse.json();
        expect(existsData.success).toBe(true);
        expect(existsData.data.exists).toBe(true);

        // Check non-existent email
        const notExistsResponse = await app.request('/auth/exists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'notfound@example.com'
            })
        });

        const notExistsData = await notExistsResponse.json();
        expect(notExistsData.data.exists).toBe(false);
    });
});