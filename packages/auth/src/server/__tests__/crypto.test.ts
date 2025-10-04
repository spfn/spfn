import { describe, expect, it } from 'vitest';

import {
    decryptPrivateKey,
    encryptPrivateKey,
    generateKeyPair,
    isValidPrivateKey,
    isValidPublicKey,
} from '../crypto';

describe('crypto', () =>
{
    describe('generateKeyPair', () =>
    {
        it('should generate ECDSA key pair', () =>
        {
            const { publicKey, privateKey } = generateKeyPair();

            expect(publicKey).toBeDefined();
            expect(privateKey).toBeDefined();
            expect(typeof publicKey).toBe('string');
            expect(typeof privateKey).toBe('string');
        });

        it('should generate different keys each time', () =>
        {
            const pair1 = generateKeyPair();
            const pair2 = generateKeyPair();

            expect(pair1.publicKey).not.toBe(pair2.publicKey);
            expect(pair1.privateKey).not.toBe(pair2.privateKey);
        });

        it('should generate valid base64 encoded keys', () =>
        {
            const { publicKey, privateKey } = generateKeyPair();

            expect(isValidPublicKey(publicKey)).toBe(true);
            expect(isValidPrivateKey(privateKey)).toBe(true);
        });
    });

    describe('encryptPrivateKey / decryptPrivateKey', () =>
    {
        it('should encrypt and decrypt private key', () =>
        {
            const { privateKey } = generateKeyPair();
            const secret = 'my-secret-key-at-least-32-bytes-long';

            const encrypted = encryptPrivateKey(privateKey, secret);
            const decrypted = decryptPrivateKey(encrypted, secret);

            expect(decrypted).toBe(privateKey);
        });

        it('should fail with wrong secret', () =>
        {
            const { privateKey } = generateKeyPair();
            const secret1 = 'my-secret-key-at-least-32-bytes-long';
            const secret2 = 'different-secret-key-32-bytes-long!!';

            const encrypted = encryptPrivateKey(privateKey, secret1);

            expect(() =>
            {
                decryptPrivateKey(encrypted, secret2);
            }).toThrow();
        });

        it('should fail with tampered data', () =>
        {
            const { privateKey } = generateKeyPair();
            const secret = 'my-secret-key-at-least-32-bytes-long';

            const encrypted = encryptPrivateKey(privateKey, secret);
            const tampered = encrypted.replace(/a/g, 'b');

            expect(() =>
            {
                decryptPrivateKey(tampered, secret);
            }).toThrow();
        });
    });

    describe('isValidPublicKey', () =>
    {
        it('should validate correct public key', () =>
        {
            const { publicKey } = generateKeyPair();
            expect(isValidPublicKey(publicKey)).toBe(true);
        });

        it('should reject invalid base64', () =>
        {
            expect(isValidPublicKey('not-base64!')).toBe(false);
        });

        it('should reject empty string', () =>
        {
            expect(isValidPublicKey('')).toBe(false);
        });
    });

    describe('isValidPrivateKey', () =>
    {
        it('should validate correct private key', () =>
        {
            const { privateKey } = generateKeyPair();
            expect(isValidPrivateKey(privateKey)).toBe(true);
        });

        it('should reject invalid base64', () =>
        {
            expect(isValidPrivateKey('not-base64!')).toBe(false);
        });

        it('should reject empty string', () =>
        {
            expect(isValidPrivateKey('')).toBe(false);
        });
    });
});