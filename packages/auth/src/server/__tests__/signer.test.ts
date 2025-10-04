import { describe, expect, it } from 'vitest';

import { generateKeyPair } from '../crypto';
import { extractSignatureHeaders, signRequest, verifySignature } from '../signer';

describe('signer', () =>
{
    describe('signRequest / verifySignature', () =>
    {
        it('should sign and verify request', async () =>
        {
            const { publicKey, privateKey } = generateKeyPair();

            const data = {
                method: 'POST',
                url: '/api/users',
                body: JSON.stringify({ name: 'test' }),
            };

            const { signature, timestamp, nonce } = await signRequest(data, privateKey);

            const isValid = await verifySignature(
                {
                    ...data,
                    signature,
                    timestamp,
                    nonce,
                },
                publicKey
            );

            expect(isValid).toBe(true);
        });

        it('should reject tampered signature', async () =>
        {
            const { publicKey, privateKey } = generateKeyPair();

            const data = {
                method: 'POST',
                url: '/api/users',
                body: JSON.stringify({ name: 'test' }),
            };

            const { signature, timestamp, nonce } = await signRequest(data, privateKey);

            const tamperedSignature = signature.replace(/a/g, 'b');

            const isValid = await verifySignature(
                {
                    ...data,
                    signature: tamperedSignature,
                    timestamp,
                    nonce,
                },
                publicKey
            );

            expect(isValid).toBe(false);
        });

        it('should reject modified body', async () =>
        {
            const { publicKey, privateKey } = generateKeyPair();

            const data = {
                method: 'POST',
                url: '/api/users',
                body: JSON.stringify({ name: 'test' }),
            };

            const { signature, timestamp, nonce } = await signRequest(data, privateKey);

            const isValid = await verifySignature(
                {
                    ...data,
                    body: JSON.stringify({ name: 'hacked' }),
                    signature,
                    timestamp,
                    nonce,
                },
                publicKey
            );

            expect(isValid).toBe(false);
        });

        it('should reject expired request', async () =>
        {
            const { publicKey, privateKey } = generateKeyPair();

            const data = {
                method: 'GET',
                url: '/api/users',
                body: null,
            };

            const { signature, nonce } = await signRequest(data, privateKey);
            const oldTimestamp = (Date.now() - 65000).toString();

            await expect(
                verifySignature(
                    {
                        ...data,
                        signature,
                        timestamp: oldTimestamp,
                        nonce,
                    },
                    publicKey
                )
            ).rejects.toThrow('Request expired');
        });

        it('should generate unique nonce each time', async () =>
        {
            const { privateKey } = generateKeyPair();

            const data = {
                method: 'GET',
                url: '/api/test',
                body: null,
            };

            const result1 = await signRequest(data, privateKey);
            const result2 = await signRequest(data, privateKey);

            expect(result1.nonce).not.toBe(result2.nonce);
        });
    });

    describe('extractSignatureHeaders', () =>
    {
        it('should extract valid headers', () =>
        {
            const headers = {
                get: (name: string) =>
                {
                    const map: Record<string, string> = {
                        'X-Signature': 'sig123',
                        'X-Timestamp': '1234567890',
                        'X-Nonce': 'nonce123',
                        'X-Key-Id': 'key123',
                    };
                    return map[name] ?? null;
                },
            };

            const result = extractSignatureHeaders(headers);

            expect(result).toEqual({
                signature: 'sig123',
                timestamp: '1234567890',
                nonce: 'nonce123',
                keyId: 'key123',
            });
        });

        it('should return null if headers missing', () =>
        {
            const headers = {
                get: () => null,
            };

            const result = extractSignatureHeaders(headers);

            expect(result).toBeNull();
        });

        it('should return null if some headers missing', () =>
        {
            const headers = {
                get: (name: string) =>
                {
                    const map: Record<string, string> = {
                        'X-Signature': 'sig123',
                        'X-Timestamp': '1234567890',
                    };
                    return map[name] ?? null;
                },
            };

            const result = extractSignatureHeaders(headers);

            expect(result).toBeNull();
        });
    });
});