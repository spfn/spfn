/**
 * @spfn/auth - JWT Helpers
 *
 * JWT token generation and verification
 * Supports both server-signed (legacy) and client-signed (asymmetric) tokens
 *
 * Architecture:
 * - Legacy: Server signs/verifies with JWT_SECRET (symmetric HMAC)
 * - New: Client signs with privateKey, server verifies with publicKey (asymmetric)
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import type { SessionPayload } from '@/lib/types/api';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface TokenPayload extends SessionPayload
{
    exp?: number;
    iat?: number;
    keyId?: string;
    timestamp?: number;
}

/**
 * Generate a JWT token (legacy server-signed)
 *
 * @deprecated Use client-side signing with private keys instead
 * This method uses symmetric HMAC which requires sharing the secret
 *
 * @param payload - Token payload
 * @returns JWT token string
 */
export function generateToken(payload: SessionPayload): string
{
    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    } as SignOptions);
}

/**
 * Verify and decode a JWT token (legacy server-signed)
 *
 * @deprecated Use verifyClientToken for client-signed tokens
 * This method uses symmetric HMAC verification
 *
 * @param token - JWT token to verify
 * @returns Decoded payload
 * @throws Error if verification fails
 */
export function verifyToken(token: string): TokenPayload
{
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

/**
 * Verify client-signed JWT token with public key (DER format)
 *
 * Flow:
 * 1. Decode Base64 DER to Buffer
 * 2. Create KeyObject from DER
 * 3. Verify JWT signature with public key
 * 4. Validate issuer claim
 *
 * @param token - JWT token signed by client's private key
 * @param publicKeyB64 - Base64 encoded DER public key (SPKI format)
 * @param algorithm - Algorithm used for signing (ES256 or RS256)
 * @returns Decoded token payload
 * @throws Error if verification fails
 *
 * @example
 * ```typescript
 * const payload = verifyClientToken(
 *     token,
 *     'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...',
 *     'ES256'
 * );
 * ```
 */
export function verifyClientToken(
    token: string,
    publicKeyB64: string,
    algorithm: 'ES256' | 'RS256'
): TokenPayload
{
    try
    {
        // Convert Base64 DER to key object
        const publicKeyDER = Buffer.from(publicKeyB64, 'base64');
        const publicKeyObject = crypto.createPublicKey({
            key: publicKeyDER,
            format: 'der',
            type: 'spki',
        });

        const decoded = jwt.verify(token, publicKeyObject, {
            algorithms: [algorithm],  // Prevent algorithm confusion attacks
            issuer: 'spfn-client',    // Validate token issuer
        });

        // jwt.verify can return string, but we expect object payload
        if (typeof decoded === 'string')
        {
            throw new Error('Invalid token format: expected object payload');
        }

        return decoded as TokenPayload;
    }
    catch (error)
    {
        if (error instanceof jwt.TokenExpiredError)
        {
            throw new Error('Token has expired');
        }

        if (error instanceof jwt.JsonWebTokenError)
        {
            throw new Error('Invalid token signature');
        }

        throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Decode a JWT token without verification (for debugging)
 *
 * WARNING: Does not verify signature! Only use for debugging/logging.
 * Never trust decoded data without verification.
 *
 * @param token - JWT token to decode
 * @returns Decoded payload or null if invalid
 */
export function decodeToken(token: string): TokenPayload | null
{
    try
    {
        return jwt.decode(token) as TokenPayload | null;
    }
    catch
    {
        return null;
    }
}

/**
 * Verify public key fingerprint matches
 *
 * Used during registration/login to ensure the public key wasn't tampered with
 * during transmission.
 *
 * Security:
 * - Client sends: publicKey + fingerprint
 * - Server calculates: SHA-256(publicKey)
 * - Server compares: calculated === received
 *
 * @param publicKeyB64 - Base64 encoded DER public key
 * @param expectedFingerprint - SHA-256 hex fingerprint (64 chars)
 * @returns True if fingerprint matches
 *
 * @example
 * ```typescript
 * const isValid = verifyKeyFingerprint(
 *     publicKey,
 *     'a1b2c3d4e5f6...' // 64-char hex string
 * );
 * if (!isValid) {
 *     throw new Error('Public key fingerprint mismatch');
 * }
 * ```
 */
export function verifyKeyFingerprint(
    publicKeyB64: string,
    expectedFingerprint: string
): boolean
{
    try
    {
        const publicKeyDER = Buffer.from(publicKeyB64, 'base64');
        const fingerprint = crypto
            .createHash('sha256')
            .update(publicKeyDER)
            .digest('hex');

        return fingerprint === expectedFingerprint;
    }
    catch (error)
    {
        console.error('Failed to verify key fingerprint:', error);
        return false;
    }
}