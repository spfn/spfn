/**
 * @spfn/auth - OAuth Unit Tests
 *
 * Tests for OAuth state management and pending session
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    createOAuthState,
    verifyOAuthState,
    type OAuthState,
} from '../../server/lib/oauth/state';
import {
    isGoogleOAuthEnabled,
    getGoogleAuthUrl,
    getGoogleOAuthConfig,
} from '../../server/lib/oauth/google';
import {
    sealPendingSession,
    unsealPendingSession,
    type PendingSessionData,
} from '../../nextjs/session-helpers';

describe('OAuth State - Create/Verify', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    const mockStateParams = {
        provider: 'google',
        returnUrl: '/dashboard',
        publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
        keyId: 'key-uuid-123',
        fingerprint: 'abc123def456',
        algorithm: 'ES256' as const,
    };

    it('should create and verify OAuth state', async () =>
    {
        const state = await createOAuthState(mockStateParams);

        expect(state).toBeTruthy();
        expect(typeof state).toBe('string');

        const verified = await verifyOAuthState(state);

        expect(verified.provider).toBe('google');
        expect(verified.returnUrl).toBe('/dashboard');
        expect(verified.publicKey).toBe(mockStateParams.publicKey);
        expect(verified.keyId).toBe('key-uuid-123');
        expect(verified.fingerprint).toBe('abc123def456');
        expect(verified.algorithm).toBe('ES256');
        expect(verified.nonce).toBeTruthy();
        expect(verified.expiresAt).toBeGreaterThan(Date.now());
    });

    it('should produce different state for same params (different nonce)', async () =>
    {
        const state1 = await createOAuthState(mockStateParams);
        const state2 = await createOAuthState(mockStateParams);

        expect(state1).not.toBe(state2);

        const verified1 = await verifyOAuthState(state1);
        const verified2 = await verifyOAuthState(state2);

        expect(verified1.nonce).not.toBe(verified2.nonce);
    });

    it('should reject tampered state', async () =>
    {
        const state = await createOAuthState(mockStateParams);

        // Tamper with the state
        const decoded = decodeURIComponent(state);
        const tampered = encodeURIComponent(decoded.slice(0, -10) + 'TAMPERED!!');

        await expect(verifyOAuthState(tampered)).rejects.toThrow();
    });

    it('should reject malformed state', async () =>
    {
        await expect(verifyOAuthState('not-a-valid-state')).rejects.toThrow();
    });

    it('should handle URL-safe encoding', async () =>
    {
        const params = {
            ...mockStateParams,
            returnUrl: '/path?query=value&foo=bar',
        };

        const state = await createOAuthState(params);
        const verified = await verifyOAuthState(state);

        expect(verified.returnUrl).toBe('/path?query=value&foo=bar');
    });
});

describe('OAuth State - Expiration', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should include expiration timestamp', async () =>
    {
        const state = await createOAuthState({
            provider: 'google',
            returnUrl: '/',
            publicKey: 'key',
            keyId: 'id',
            fingerprint: 'fp',
            algorithm: 'ES256',
        });

        const verified = await verifyOAuthState(state);

        // Should expire in ~10 minutes
        const tenMinutes = 10 * 60 * 1000;
        expect(verified.expiresAt).toBeGreaterThan(Date.now());
        expect(verified.expiresAt).toBeLessThan(Date.now() + tenMinutes + 5000);
    });
});

describe('Google OAuth Config', () =>
{
    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should return false when Google OAuth is not configured', () =>
    {
        vi.unstubAllEnvs();

        expect(isGoogleOAuthEnabled()).toBe(false);
    });

    it('should return true when Google OAuth is configured', () =>
    {
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_SECRET', 'GOCSPX-test-secret');

        expect(isGoogleOAuthEnabled()).toBe(true);
    });

    it('should throw when getting config without credentials', () =>
    {
        vi.unstubAllEnvs();

        expect(() => getGoogleOAuthConfig()).toThrow('Google OAuth is not configured');
    });

    it('should return config when credentials are set', () =>
    {
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_SECRET', 'GOCSPX-test-secret');
        vi.stubEnv('SPFN_API_URL', 'http://localhost:8790');

        const config = getGoogleOAuthConfig();

        expect(config.clientId).toBe('test-client-id.apps.googleusercontent.com');
        expect(config.clientSecret).toBe('GOCSPX-test-secret');
        expect(config.redirectUri).toBe('http://localhost:8790/_auth/oauth/google/callback');
    });

    it('should use custom redirect URI when provided', () =>
    {
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_ID', 'test-client-id');
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_SECRET', 'test-secret');
        vi.stubEnv('SPFN_AUTH_GOOGLE_REDIRECT_URI', 'https://custom.example.com/callback');

        const config = getGoogleOAuthConfig();

        expect(config.redirectUri).toBe('https://custom.example.com/callback');
    });
});

describe('Google Auth URL', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_SECRET', 'GOCSPX-test-secret');
        vi.stubEnv('SPFN_API_URL', 'http://localhost:8790');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should generate valid Google OAuth URL', () =>
    {
        const state = 'encrypted-state-value';
        const authUrl = getGoogleAuthUrl(state);

        expect(authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
        expect(authUrl).toContain('client_id=test-client-id.apps.googleusercontent.com');
        expect(authUrl).toContain('response_type=code');
        expect(authUrl).toContain('scope=email+profile');
        expect(authUrl).toContain('state=encrypted-state-value');
        expect(authUrl).toContain('access_type=offline');
    });

    it('should include redirect URI', () =>
    {
        const authUrl = getGoogleAuthUrl('state');

        expect(authUrl).toContain(encodeURIComponent('http://localhost:8790/_auth/oauth/google/callback'));
    });
});

describe('Pending Session - Seal/Unseal', () =>
{
    const mockPendingSession: PendingSessionData = {
        privateKey: 'MHcCAQEEIAbK7gT9pqxQx...',
        keyId: 'key-uuid-123',
        algorithm: 'ES256',
    };

    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('should seal and unseal pending session', async () =>
    {
        const sealed = await sealPendingSession(mockPendingSession);

        expect(sealed).toBeTruthy();
        expect(sealed.split('.')).toHaveLength(5); // JWE format

        const unsealed = await unsealPendingSession(sealed);

        expect(unsealed.privateKey).toBe(mockPendingSession.privateKey);
        expect(unsealed.keyId).toBe('key-uuid-123');
        expect(unsealed.algorithm).toBe('ES256');
    });

    it('should produce different output for same data (different IV)', async () =>
    {
        const sealed1 = await sealPendingSession(mockPendingSession);
        const sealed2 = await sealPendingSession(mockPendingSession);

        expect(sealed1).not.toBe(sealed2);

        // But both decrypt to same data
        const unsealed1 = await unsealPendingSession(sealed1);
        const unsealed2 = await unsealPendingSession(sealed2);

        expect(unsealed1).toEqual(unsealed2);
    });

    it('should reject tampered pending session', async () =>
    {
        const sealed = await sealPendingSession(mockPendingSession);

        const parts = sealed.split('.');
        parts[3] = parts[3].slice(0, -10) + 'TAMPERED!!';
        const tampered = parts.join('.');

        await expect(unsealPendingSession(tampered)).rejects.toThrow();
    });

    it('should use short TTL by default (10 minutes)', async () =>
    {
        const sealed = await sealPendingSession(mockPendingSession);

        // Verify unsealing works immediately
        const unsealed = await unsealPendingSession(sealed);
        expect(unsealed).toEqual(mockPendingSession);
    });

    it('should reject expired pending session', async () =>
    {
        // Create with very short TTL
        const sealed = await sealPendingSession(mockPendingSession, 1);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1500));

        await expect(unsealPendingSession(sealed)).rejects.toThrow();
    });
});

describe('OAuth Interceptor Logic', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_SESSION_SECRET', 'test-secret-with-at-least-32-characters-for-security-testing');
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_ID', 'test-client-id');
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_SECRET', 'test-secret');
        vi.stubEnv('SPFN_API_URL', 'http://localhost:8790');
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('oauthUrlInterceptor pathPattern should match OAuth URL paths', () =>
    {
        const pattern = /^\/_auth\/oauth\/\w+\/url$/;

        expect(pattern.test('/_auth/oauth/google/url')).toBe(true);
        expect(pattern.test('/_auth/oauth/github/url')).toBe(true);
        expect(pattern.test('/_auth/oauth/facebook/url')).toBe(true);
        expect(pattern.test('/_auth/oauth/url')).toBe(false);
        expect(pattern.test('/_auth/oauth/google/callback')).toBe(false);
        expect(pattern.test('/api/oauth/google/url')).toBe(false);
    });

    it('oauthFinalizeInterceptor pathPattern should match finalize path', () =>
    {
        const pattern = /^\/_auth\/oauth\/finalize$/;

        expect(pattern.test('/_auth/oauth/finalize')).toBe(true);
        expect(pattern.test('/_auth/oauth/finalize/')).toBe(false);
        expect(pattern.test('/_auth/oauth/google/finalize')).toBe(false);
        expect(pattern.test('/api/oauth/finalize')).toBe(false);
    });

    it('should generate valid state with publicKey included', async () =>
    {
        const stateParams = {
            provider: 'google',
            returnUrl: '/dashboard',
            publicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
            keyId: 'test-key-id',
            fingerprint: 'test-fingerprint',
            algorithm: 'ES256' as const,
        };

        const state = await createOAuthState(stateParams);
        const verified = await verifyOAuthState(state);

        // State should contain all key info for later session creation
        expect(verified.publicKey).toBe(stateParams.publicKey);
        expect(verified.keyId).toBe(stateParams.keyId);
        expect(verified.fingerprint).toBe(stateParams.fingerprint);
        expect(verified.algorithm).toBe('ES256');
    });

    it('pending session should preserve key info for finalization', async () =>
    {
        const pendingData: PendingSessionData = {
            privateKey: 'private-key-pem-content',
            keyId: 'matched-key-id',
            algorithm: 'ES256',
        };

        const sealed = await sealPendingSession(pendingData);
        const unsealed = await unsealPendingSession(sealed);

        // These values are used to create the final session
        expect(unsealed.privateKey).toBe(pendingData.privateKey);
        expect(unsealed.keyId).toBe(pendingData.keyId);
        expect(unsealed.algorithm).toBe(pendingData.algorithm);
    });
});
