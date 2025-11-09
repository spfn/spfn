/**
 * @spfn/auth - JWT Helper Unit Tests
 *
 * Tests for generateJWTFromSession helper function
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { generateKeyPair } from '@/lib/crypto';
import { sealSession } from '@/lib/session';

// Mock next/headers
vi.mock('next/headers', () => ({
    cookies: vi.fn()
}));

describe('JWT Helper - generateJWTFromSession', () =>
{
    beforeAll(() =>
    {
        // Set required environment variable
        process.env.SPFN_AUTH_SESSION_SECRET = 'test-secret-key-for-testing-only-min-32-chars';
    });

    beforeEach(() =>
    {
        vi.resetAllMocks();
    });

    it('should generate JWT token from valid session cookie', async () =>
    {
        const { cookies } = await import('next/headers');
        const { generateJWTFromSession } = await import('../jwt-helper');

        // Generate test key pair
        const keyPair = generateKeyPair('ES256');

        // Create session data
        const sessionData = {
            userId: 'test-user-123',
            privateKey: keyPair.privateKey,
            keyId: 'test-key-id',
            algorithm: 'ES256' as const
        };

        // Seal session to create cookie value
        const sessionToken = await sealSession(sessionData, 3600);

        // Mock cookies to return session
        vi.mocked(cookies).mockResolvedValue({
            get: vi.fn().mockReturnValue({ value: sessionToken })
        } as any);

        // Call generateJWTFromSession
        const token = await generateJWTFromSession();

        // Verify token was generated
        expect(token).toBeTruthy();
        expect(typeof token).toBe('string');
        expect(token?.split('.')).toHaveLength(3); // Valid JWT format
    });

    it('should return null when no session cookie exists', async () =>
    {
        const { cookies } = await import('next/headers');
        const { generateJWTFromSession } = await import('../jwt-helper');

        // Mock cookies to return no session
        vi.mocked(cookies).mockResolvedValue({
            get: vi.fn().mockReturnValue(undefined)
        } as any);

        const token = await generateJWTFromSession();

        expect(token).toBeNull();
    });

    it('should return null when session cookie is invalid', async () =>
    {
        const { cookies } = await import('next/headers');
        const { generateJWTFromSession } = await import('../jwt-helper');

        // Mock cookies to return invalid session
        vi.mocked(cookies).mockResolvedValue({
            get: vi.fn().mockReturnValue({ value: 'invalid-session-token' })
        } as any);

        const token = await generateJWTFromSession();

        expect(token).toBeNull();
    });

    it('should generate valid JWT with correct payload', async () =>
    {
        const { cookies } = await import('next/headers');
        const { generateJWTFromSession } = await import('../jwt-helper');
        const { verifyClientToken } = await import('@/server/helpers/jwt');

        // Generate test key pair
        const keyPair = generateKeyPair('ES256');

        // Create session data
        const sessionData = {
            userId: 'test-user-456',
            privateKey: keyPair.privateKey,
            keyId: 'test-key-789',
            algorithm: 'ES256' as const
        };

        // Seal session
        const sessionToken = await sealSession(sessionData, 3600);

        // Mock cookies
        vi.mocked(cookies).mockResolvedValue({
            get: vi.fn().mockReturnValue({ value: sessionToken })
        } as any);

        // Generate JWT
        const token = await generateJWTFromSession();

        expect(token).toBeTruthy();

        // Verify JWT with public key
        const decoded = verifyClientToken(token!, keyPair.publicKey, keyPair.algorithm);

        expect(decoded.userId).toBe('test-user-456');
        expect(decoded.keyId).toBe('test-key-789');
        expect(decoded.iss).toBe('spfn-client');
    });

    it('should handle expired session gracefully', async () =>
    {
        const { cookies } = await import('next/headers');
        const { generateJWTFromSession } = await import('../jwt-helper');

        // Create expired session (maxAge = -1)
        const keyPair = generateKeyPair('ES256');
        const sessionData = {
            userId: 'test-user',
            privateKey: keyPair.privateKey,
            keyId: 'test-key',
            algorithm: 'ES256' as const
        };

        const sessionToken = await sealSession(sessionData, -1);

        // Mock cookies
        vi.mocked(cookies).mockResolvedValue({
            get: vi.fn().mockReturnValue({ value: sessionToken })
        } as any);

        const token = await generateJWTFromSession();

        // Should return null for expired session
        expect(token).toBeNull();
    });
});