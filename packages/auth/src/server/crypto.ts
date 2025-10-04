/**
 * Cryptographic utilities for key management
 */

import crypto from 'node:crypto';

import type { EncryptedPrivateKey } from '../shared/types.js';

import { ENCRYPTION_ALGORITHM } from '../shared/constants.js';

/**
 * Generate ECDSA key pair (P-256 curve)
 *
 * DER 포맷을 사용하여 PEM보다 작고 빠른 성능 제공
 * P-256 (secp256r1)은 256비트로 RSA-3072와 동등한 보안 수준
 *
 * @returns Public and private keys in DER format (base64 encoded)
 */
export function generateKeyPair(): { publicKey: string; privateKey: string }
{
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'der',
        },
        publicKeyEncoding: {
            type: 'spki',
            format: 'der',
        },
    });

    return {
        publicKey: publicKey.toString('base64'),
        privateKey: privateKey.toString('base64'),
    };
}

/**
 * Encrypt private key using AES-256-GCM
 *
 * @param privateKey - Private key in PEM format
 * @param secret - Encryption secret (must be 32 bytes)
 * @returns Encrypted data (JSON string)
 */
export function encryptPrivateKey(privateKey: string, secret: string): string
{
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    const data: EncryptedPrivateKey = {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
    };

    return JSON.stringify(data);
}

/**
 * Decrypt private key using AES-256-GCM
 *
 * @param encryptedData - Encrypted data (JSON string)
 * @param secret - Encryption secret (must be 32 bytes)
 * @returns Decrypted private key in PEM format
 * @throws Error if decryption fails or authentication fails
 */
export function decryptPrivateKey(encryptedData: string, secret: string): string
{
    try
    {
        const data: EncryptedPrivateKey = JSON.parse(encryptedData);
        const key = crypto.createHash('sha256').update(secret).digest();

        const decipher = crypto.createDecipheriv(
            ENCRYPTION_ALGORITHM,
            key,
            Buffer.from(data.iv, 'hex')
        );

        decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));

        let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
    catch (error)
    {
        throw new Error('Failed to decrypt private key: Invalid data or secret');
    }
}

/**
 * Validate public key format (base64 encoded DER)
 *
 * @param publicKey - Public key to validate
 * @returns True if valid base64 format
 */
export function isValidPublicKey(publicKey: string): boolean
{
    try
    {
        const buffer = Buffer.from(publicKey, 'base64');
        return buffer.length > 0;
    }
    catch
    {
        return false;
    }
}

/**
 * Validate private key format (base64 encoded DER)
 *
 * @param privateKey - Private key to validate
 * @returns True if valid base64 format
 */
export function isValidPrivateKey(privateKey: string): boolean
{
    try
    {
        const buffer = Buffer.from(privateKey, 'base64');
        return buffer.length > 0;
    }
    catch
    {
        return false;
    }
}