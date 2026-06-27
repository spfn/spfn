/**
 * @spfn/auth - JWT Helpers
 *
 * JWT token generation and verification
 * Supports both server-signed (legacy) and client-signed (asymmetric) tokens
 *
 * Architecture:
 * - Legacy: Server signs/verifies with SPFN_AUTH_JWT_SECRET (symmetric HMAC)
 * - New: Client signs with privateKey, server verifies with publicKey (asymmetric)
 */

import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '@spfn/auth/config';
import { type KeyAlgorithmType } from '../types';

/**
 * Parsed public-key cache.
 *
 * `createPublicKey` re-parses the DER (ASN.1/SPKI) on every call, which would run
 * on every authenticated request. The base64 DER fully identifies the key, so we
 * cache the resulting KeyObject by it. Bounded with FIFO eviction — a miss just
 * re-parses, so a small cap is safe.
 */
const PUBLIC_KEY_CACHE_MAX = 1000;
const publicKeyCache = new Map<string, crypto.KeyObject>();

function getPublicKeyObject(publicKeyB64: string): crypto.KeyObject
{
    const cached = publicKeyCache.get(publicKeyB64);
    if (cached)
    {
        return cached;
    }

    const keyObject = crypto.createPublicKey({
        key: Buffer.from(publicKeyB64, 'base64'),
        format: 'der',
        type: 'spki',
    });

    if (publicKeyCache.size >= PUBLIC_KEY_CACHE_MAX)
    {
        const oldest = publicKeyCache.keys().next().value;
        if (oldest !== undefined)
        {
            publicKeyCache.delete(oldest);
        }
    }
    publicKeyCache.set(publicKeyB64, keyObject);

    return keyObject;
}

export interface SessionPayload
{
    userId: string;
    keyId?: string;
}

export interface TokenPayload extends SessionPayload
{
    exp?: number;
    iat?: number;
    iss?: string;
    timestamp?: number;
    [key: string]: any;
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
    return jwt.sign(payload, env.SPFN_AUTH_JWT_SECRET, {
        expiresIn: env.SPFN_AUTH_JWT_EXPIRES_IN,
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
    // Pin the algorithm to the symmetric HMAC this secret signs with — without an
    // allow-list, jsonwebtoken accepts whatever alg the token header claims
    // (algorithm-confusion risk).
    return jwt.verify(token, env.SPFN_AUTH_JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
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
    algorithm: KeyAlgorithmType,
): TokenPayload
{
    // Parse (or reuse a cached) key object from the Base64 DER
    const publicKeyObject = getPublicKeyObject(publicKeyB64);

    let decoded;

    try
    {
        decoded = jwt.verify(token, publicKeyObject, {
            algorithms: [algorithm],  // Prevent algorithm confusion attacks
            issuer: 'spfn-client',    // Validate token issuer
        });
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

    // jwt.verify can return string, but we expect object payload
    if (typeof decoded === 'string')
    {
        throw new Error('Invalid token format: expected object payload');
    }

    return decoded as TokenPayload;
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
    expectedFingerprint: string,
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
