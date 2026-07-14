/**
 * OAuth token keyring encryption tests.
 * Token and key material must never be printed by these tests.
 */

import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    decryptToken,
    encryptToken,
    isEncrypted,
    type OAuthTokenContext,
} from '@/server/lib/oauth/token-cipher';

const LEGACY_SECRET = 'test-secret-with-at-least-32-characters-for-security-testing';
const ACTIVE_KEY = Buffer.alloc(32, 1).toString('base64');
const PREVIOUS_KEY = Buffer.alloc(32, 2).toString('base64');
const SAMPLE = 'sample-access-token-value';
const CONTEXT: OAuthTokenContext = {
    provider: 'google',
    providerUserId: 'provider-user-123',
    tokenType: 'access',
};

function encryptLegacyV1(value: string): string
{
    const key = crypto.createHash('sha256').update(`social-token:${LEGACY_SECRET}`).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);

    return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`;
}

describe('OAuth token cipher - rotating AES-256-GCM keyring', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_SESSION_SECRET', LEGACY_SECRET);
        vi.stubEnv('SPFN_AUTH_TOKEN_ENCRYPTION_KEYS', `v2:${ACTIVE_KEY},v1:${PREVIOUS_KEY}`);
    });

    afterEach(() =>
    {
        vi.unstubAllEnvs();
    });

    it('encrypts with the active key ID and restores the value', async () =>
    {
        const encrypted = await encryptToken(SAMPLE, CONTEXT);
        const decrypted = await decryptToken(encrypted, CONTEXT);

        expect(isEncrypted(encrypted)).toBe(true);
        expect(encrypted.startsWith('enc:v2:v2:')).toBe(true);
        expect(encrypted).not.toContain(SAMPLE);
        expect(decrypted).toEqual({ value: SAMPLE, needsRotation: false });
    });

    it('uses a random IV for each encryption', async () =>
    {
        expect(await encryptToken(SAMPLE, CONTEXT)).not.toBe(await encryptToken(SAMPLE, CONTEXT));
    });

    it('binds ciphertext to provider account and token type with AAD', async () =>
    {
        const encrypted = await encryptToken(SAMPLE, CONTEXT);

        await expect(decryptToken(encrypted, { ...CONTEXT, providerUserId: 'different-user' }))
            .rejects.toThrow();
        await expect(decryptToken(encrypted, { ...CONTEXT, tokenType: 'refresh' }))
            .rejects.toThrow();
    });

    it('decrypts a previous key and marks it for rotation', async () =>
    {
        vi.stubEnv('SPFN_AUTH_TOKEN_ENCRYPTION_KEYS', `v1:${PREVIOUS_KEY}`);
        const encrypted = await encryptToken(SAMPLE, CONTEXT);

        vi.stubEnv('SPFN_AUTH_TOKEN_ENCRYPTION_KEYS', `v2:${ACTIVE_KEY},v1:${PREVIOUS_KEY}`);
        await expect(decryptToken(encrypted, CONTEXT)).resolves.toEqual({
            value: SAMPLE,
            needsRotation: true,
        });
    });

    it('decrypts legacy v1 ciphertext and marks it for rotation', async () =>
    {
        await expect(decryptToken(encryptLegacyV1(SAMPLE), CONTEXT)).resolves.toEqual({
            value: SAMPLE,
            needsRotation: true,
        });
    });

    it('returns legacy plaintext and marks it for rotation', async () =>
    {
        expect(isEncrypted(SAMPLE)).toBe(false);
        await expect(decryptToken(SAMPLE, CONTEXT)).resolves.toEqual({
            value: SAMPLE,
            needsRotation: true,
        });
    });

    it('rejects ciphertext tampering', async () =>
    {
        const encrypted = await encryptToken(SAMPLE, CONTEXT);
        const tampered = `${encrypted.slice(0, -4)}AAAA`;

        await expect(decryptToken(tampered, CONTEXT)).rejects.toThrow();
    });

    it('rejects an unavailable key ID', async () =>
    {
        const encrypted = await encryptToken(SAMPLE, CONTEXT);
        vi.stubEnv('SPFN_AUTH_TOKEN_ENCRYPTION_KEYS', `v3:${PREVIOUS_KEY}`);

        await expect(decryptToken(encrypted, CONTEXT)).rejects.toThrow(/unavailable key ID/);
    });

    it('fails closed for new encryption when the dedicated keyring is missing', async () =>
    {
        vi.stubEnv('SPFN_AUTH_TOKEN_ENCRYPTION_KEYS', '');

        await expect(encryptToken(SAMPLE, CONTEXT)).rejects.toThrow(/not configured/);
    });

    it('rejects malformed or non-32-byte key material', async () =>
    {
        vi.stubEnv('SPFN_AUTH_TOKEN_ENCRYPTION_KEYS', 'bad-key');
        await expect(encryptToken(SAMPLE, CONTEXT)).rejects.toThrow(/expected <keyId>/);

        vi.stubEnv('SPFN_AUTH_TOKEN_ENCRYPTION_KEYS', `v2:${Buffer.alloc(16).toString('base64')}`);
        await expect(encryptToken(SAMPLE, CONTEXT)).rejects.toThrow(/exactly 32 bytes/);
    });

    it('rejects unknown encrypted formats instead of treating them as plaintext', async () =>
    {
        await expect(decryptToken('enc:v99:not-supported', CONTEXT)).rejects.toThrow(/Unsupported/);
    });
});
