/**
 * @spfn/auth - Session Management Unit Tests
 *
 * Tests for Jose JWE session encryption, validation, and secret strength
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    sealSession,
    unsealSession,
    getSessionInfo,
    shouldRefreshSession,
    validateSessionSecret,
} from '@/client/lib/session';
import type { SessionData } from '@/client/lib/session';

describe('Session - Seal/Unseal', () =>
{
    const mockSessionData: SessionData = {
        userId: '123456',
        privateKey: 'MHcCAQEEIAbK7gT9pqxQx...',
        keyId: 'key-uuid-123',
        algorithm: 'ES256',
    };

    beforeEach(() =>
    {
        // Set a valid test secret
        vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should seal and unseal session data', async () =>
    {
        const sealed = await sealSession(mockSessionData, 3600);

        expect(sealed).toBeTruthy();
        expect(sealed.split('.')).toHaveLength(5); // JWE format: header.key.iv.ciphertext.tag

        const unsealed = await unsealSession(sealed);

        expect(unsealed).toEqual(mockSessionData);
        expect(unsealed.userId).toBe('123456');
        expect(unsealed.privateKey).toBe(mockSessionData.privateKey);
        expect(unsealed.keyId).toBe('key-uuid-123');
        expect(unsealed.algorithm).toBe('ES256');
    });

    it('should produce different encrypted output for same data', async () =>
    {
        const sealed1 = await sealSession(mockSessionData, 3600);
        const sealed2 = await sealSession(mockSessionData, 3600);

        // Different IVs should produce different ciphertext
        expect(sealed1).not.toBe(sealed2);

        // But both should decrypt to the same data
        const unsealed1 = await unsealSession(sealed1);
        const unsealed2 = await unsealSession(sealed2);

        expect(unsealed1).toEqual(unsealed2);
    });

    it('should handle various TTL values', async () =>
    {
        const ttlTests = [1, 60, 3600, 86400, 604800]; // 1s, 1m, 1h, 1d, 1w

        for (const ttl of ttlTests)
        {
            const sealed = await sealSession(mockSessionData, ttl);
            const unsealed = await unsealSession(sealed);

            expect(unsealed).toEqual(mockSessionData);
        }
    });

    it('should use default 7-day TTL when not specified', async () =>
    {
        const sealed = await sealSession(mockSessionData); // No TTL argument

        const info = await getSessionInfo(sealed);
        const ttlSeconds = Math.floor((info!.expiresAt.getTime() - info!.issuedAt.getTime()) / 1000);

        // Should be approximately 7 days (604800 seconds)
        expect(ttlSeconds).toBeGreaterThan(604700);
        expect(ttlSeconds).toBeLessThan(604900);
    });
});

describe('Session - Tampering Detection', () =>
{
    const mockSessionData: SessionData = {
        userId: '123',
        privateKey: 'key',
        keyId: 'uuid',
        algorithm: 'ES256',
    };

    beforeEach(() =>
    {
        vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should reject tampered JWT', async () =>
    {
        const sealed = await sealSession(mockSessionData);

        // Tamper with the ciphertext
        const parts = sealed.split('.');
        parts[3] = parts[3].slice(0, -10) + 'TAMPERED!!';
        const tampered = parts.join('.');

        await expect(unsealSession(tampered)).rejects.toThrow();
    });

    it('should reject JWT with modified header', async () =>
    {
        const sealed = await sealSession(mockSessionData);

        const parts = sealed.split('.');
        parts[0] = parts[0].slice(0, -5) + 'XXXXX';
        const tampered = parts.join('.');

        await expect(unsealSession(tampered)).rejects.toThrow();
    });

    it('should reject JWT with modified tag', async () =>
    {
        const sealed = await sealSession(mockSessionData);

        const parts = sealed.split('.');
        parts[4] = parts[4].slice(0, -5) + 'AAAAA';
        const tampered = parts.join('.');

        await expect(unsealSession(tampered)).rejects.toThrow();
    });

    it('should reject completely malformed JWT', async () =>
    {
        await expect(unsealSession('not.a.valid.jwt')).rejects.toThrow();
    });
});

describe('Session - Expiration', () =>
{
    const mockSessionData: SessionData = {
        userId: '123',
        privateKey: 'key',
        keyId: 'uuid',
        algorithm: 'ES256',
    };

    beforeEach(() =>
    {
        vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should reject expired session', async () =>
    {
        const sealed = await sealSession(mockSessionData, 1); // 1 second TTL

        // Wait for session to expire
        await new Promise(resolve => setTimeout(resolve, 1500));

        await expect(unsealSession(sealed)).rejects.toThrow('Session expired');
    });

    it('should work with sessions close to expiry', async () =>
    {
        const sealed = await sealSession(mockSessionData, 2); // 2 seconds TTL

        // Wait 1 second (still valid)
        await new Promise(resolve => setTimeout(resolve, 1000));

        const unsealed = await unsealSession(sealed);
        expect(unsealed).toEqual(mockSessionData);
    });
});

describe('Session - Secret Validation', () =>
{
    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should throw error when SESSION_SECRET is not set', async () =>
    {
        vi.unstubAllEnvs(); // Clear all env vars

        await expect(sealSession({ userId: '1', privateKey: 'k', keyId: 'i', algorithm: 'ES256' }))
            .rejects.toThrow('SESSION_SECRET environment variable is not set');
    });

    it('should throw error when SESSION_SECRET is too short', async () =>
    {
        vi.stubEnv('SESSION_SECRET', 'short'); // Less than 32 chars

        await expect(sealSession({ userId: '1', privateKey: 'k', keyId: 'i', algorithm: 'ES256' }))
            .rejects.toThrow('SESSION_SECRET must be at least 32 characters long');
    });
});

describe('Session - Metadata (getSessionInfo)', () =>
{
    const mockSessionData: SessionData = {
        userId: '123',
        privateKey: 'key',
        keyId: 'uuid',
        algorithm: 'ES256',
    };

    beforeEach(() =>
    {
        vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should get session metadata without full decryption', async () =>
    {
        const sealed = await sealSession(mockSessionData, 3600);

        const info = await getSessionInfo(sealed);

        expect(info).toBeTruthy();
        expect(info?.issuer).toBe('spfn-auth');
        expect(info?.audience).toBe('spfn-client');
        expect(info?.issuedAt).toBeInstanceOf(Date);
        expect(info?.expiresAt).toBeInstanceOf(Date);
    });

    it('should return correct expiration time', async () =>
    {
        const ttl = 7200; // 2 hours
        const sealed = await sealSession(mockSessionData, ttl);

        const info = await getSessionInfo(sealed);
        const actualTtl = Math.floor((info!.expiresAt.getTime() - info!.issuedAt.getTime()) / 1000);

        expect(actualTtl).toBeGreaterThan(ttl - 5);
        expect(actualTtl).toBeLessThan(ttl + 5);
    });

    it('should return null for invalid JWT', async () =>
    {
        const info = await getSessionInfo('invalid.jwt.token');

        expect(info).toBeNull();
    });
});

describe('Session - Refresh Detection (shouldRefreshSession)', () =>
{
    const mockSessionData: SessionData = {
        userId: '123',
        privateKey: 'key',
        keyId: 'uuid',
        algorithm: 'ES256',
    };

    beforeEach(() =>
    {
        vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should recommend refresh for session expiring soon', async () =>
    {
        // Create session expiring in 12 hours
        const sealed = await sealSession(mockSessionData, 12 * 60 * 60);

        // Threshold: 24 hours
        const needsRefresh = await shouldRefreshSession(sealed, 24);

        expect(needsRefresh).toBe(true);
    });

    it('should not recommend refresh for fresh session', async () =>
    {
        // Create session expiring in 48 hours
        const sealed = await sealSession(mockSessionData, 48 * 60 * 60);

        // Threshold: 24 hours
        const needsRefresh = await shouldRefreshSession(sealed, 24);

        expect(needsRefresh).toBe(false);
    });

    it('should use default 24-hour threshold', async () =>
    {
        // Create session expiring in 12 hours
        const sealed = await sealSession(mockSessionData, 12 * 60 * 60);

        // No threshold argument (defaults to 24)
        const needsRefresh = await shouldRefreshSession(sealed);

        expect(needsRefresh).toBe(true);
    });

    it('should recommend refresh for invalid session', async () =>
    {
        const needsRefresh = await shouldRefreshSession('invalid.jwt');

        expect(needsRefresh).toBe(true); // Safe default
    });
});

describe('Session - Secret Strength Validation (validateSessionSecret)', () =>
{
    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should validate strong secret', () =>
    {
        vi.stubEnv('SESSION_SECRET', 'aB3!xY9#mN2$pQ7&wE5%rT8@uI4^oP6*'); // 32 chars, high entropy

        const result = validateSessionSecret();

        expect(result.valid).toBe(true);
        expect(result.details).toBeTruthy();
        expect(result.details!.length).toBe(32);
        expect(result.details!.uniqueChars).toBeGreaterThan(16);
        expect(result.details!.entropy).toBeGreaterThan(3.5);
    });

    it('should reject secret that is not set', () =>
    {
        vi.unstubAllEnvs();

        const result = validateSessionSecret();

        expect(result.valid).toBe(false);
        expect(result.error).toBe('SPFN_AUTH_SESSION_SECRET is not set');
    });

    it('should reject short secret', () =>
    {
        vi.stubEnv('SESSION_SECRET', 'short'); // 5 chars

        const result = validateSessionSecret();

        expect(result.valid).toBe(false);
        expect(result.error).toContain('too short');
        expect(result.details?.length).toBe(5);
    });

    it('should reject secret with low character diversity', () =>
    {
        vi.stubEnv('SESSION_SECRET', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); // 32 chars, only 1 unique

        const result = validateSessionSecret();

        expect(result.valid).toBe(false);
        expect(result.error).toContain('low diversity');
        expect(result.details?.uniqueChars).toBe(1);
    });

    it('should reject secret with low entropy', () =>
    {
        // 32 chars with 16+ unique chars but very unbalanced distribution (low entropy)
        // 'a' appears 17 times, 'bcdefghijklmnop' each appears once
        vi.stubEnv('SESSION_SECRET', 'aaaaaaaaaaaaaaaaabcdefghijklmnop');

        const result = validateSessionSecret();

        expect(result.valid).toBe(false);
        expect(result.error).toContain('low entropy');
        expect(result.details?.entropy).toBeLessThan(3.5);
    });

    it('should provide detailed error information', () =>
    {
        vi.stubEnv('SESSION_SECRET', 'weakweak'); // 8 chars, low entropy

        const result = validateSessionSecret();

        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
        expect(result.details).toBeTruthy();
        expect(result.details?.length).toBe(8);
        expect(result.details?.uniqueChars).toBeLessThan(16);
        expect(result.details?.entropy).toBeLessThan(3.5);
    });

    it('should calculate Shannon entropy correctly', () =>
    {
        // Highly random string should have high entropy
        vi.stubEnv('SESSION_SECRET', 'q8W!r3@tY#u9I$o0P%a1S^d2F&g3H*j4K');

        const result = validateSessionSecret();

        expect(result.valid).toBe(true);
        expect(result.details?.entropy).toBeGreaterThan(4.5); // High entropy
    });

    it('should accept minimum valid secret (32 chars, 16 unique, 3.5 entropy)', () =>
    {
        vi.stubEnv('SESSION_SECRET', 'abcdefgh12345678ABCDEFGH!@#$%^&*'); // Borderline valid

        const result = validateSessionSecret();

        expect(result.valid).toBe(true);
    });
});

describe('Session - Performance', () =>
{
    const mockSessionData: SessionData = {
        userId: '123',
        privateKey: 'key',
        keyId: 'uuid',
        algorithm: 'ES256',
    };

    beforeEach(() =>
    {
        vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should seal session quickly', async () =>
    {
        const start = Date.now();
        await sealSession(mockSessionData);
        const duration = Date.now() - start;

        // Should be fast (< 50ms)
        expect(duration).toBeLessThan(50);
    });

    it('should unseal session quickly', async () =>
    {
        const sealed = await sealSession(mockSessionData);

        const start = Date.now();
        await unsealSession(sealed);
        const duration = Date.now() - start;

        // Should be fast (< 50ms)
        expect(duration).toBeLessThan(50);
    });

    it('should validate secret strength instantly', () =>
    {
        vi.stubEnv('SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');

        const start = Date.now();
        validateSessionSecret();
        const duration = Date.now() - start;

        // Should be nearly instant (< 10ms)
        expect(duration).toBeLessThan(10);
    });
});