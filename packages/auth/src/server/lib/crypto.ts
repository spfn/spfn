/**
 * @spfn/auth - Client Crypto Helpers
 *
 * ES256 (ECDSA P-256) key generation and JWT signing for Next.js
 * Keys are stored in DER format (Base64 encoded) for efficiency
 *
 * Key Sizes:
 * - ES256 (ECDSA P-256): ~91 bytes (Base64: ~120 chars)
 * - RS256 (RSA 2048):   ~294 bytes (Base64: ~392 chars)
 */

import { type KeyAlgorithmType } from '../types';
import crypto from 'crypto';
import jwt, { type Algorithm, type SignOptions } from 'jsonwebtoken';

type Unit =
    | "Years"
    | "Year"
    | "Yrs"
    | "Yr"
    | "Y"
    | "Weeks"
    | "Week"
    | "W"
    | "Days"
    | "Day"
    | "D"
    | "Hours"
    | "Hour"
    | "Hrs"
    | "Hr"
    | "H"
    | "Minutes"
    | "Minute"
    | "Mins"
    | "Min"
    | "M"
    | "Seconds"
    | "Second"
    | "Secs"
    | "Sec"
    | "s"
    | "Milliseconds"
    | "Millisecond"
    | "Msecs"
    | "Msec"
    | "Ms";

type UnitAnyCase = Unit | Uppercase<Unit> | Lowercase<Unit>;

type StringValue =
    | `${number}`
    | `${number}${UnitAnyCase}`
    | `${number} ${UnitAnyCase}`;

export interface KeyPair
{
    privateKey: string;     // Base64 encoded DER
    publicKey: string;      // Base64 encoded DER
    keyId: string;          // UUID
    fingerprint: string;    // SHA-256 hash
    algorithm: KeyAlgorithmType;
}

/**
 * Generate ECDSA P-256 key pair (ES256)
 * Recommended for optimal size and performance
 */
export function generateKeyPairES256(): KeyPair
{
    const keyId = crypto.randomUUID();

    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'P-256', // ES256
        publicKeyEncoding: {
            type: 'spki',
            format: 'der',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'der',
        },
    });

    // Convert Buffer to Base64
    const privateKeyB64 = privateKey.toString('base64');
    const publicKeyB64 = publicKey.toString('base64');

    // Generate fingerprint (SHA-256 of public key)
    const fingerprint = crypto
        .createHash('sha256')
        .update(publicKey)
        .digest('hex');

    return {
        privateKey: privateKeyB64,
        publicKey: publicKeyB64,
        keyId,
        fingerprint,
        algorithm: 'ES256',
    };
}

/**
 * Generate RSA 2048 key pair (RS256)
 * Fallback option, larger size but wider compatibility
 */
export function generateKeyPairRS256(): KeyPair
{
    const keyId = crypto.randomUUID();

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'der',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'der',
        },
    });

    const privateKeyB64 = privateKey.toString('base64');
    const publicKeyB64 = publicKey.toString('base64');

    const fingerprint = crypto
        .createHash('sha256')
        .update(publicKey)
        .digest('hex');

    return {
        privateKey: privateKeyB64,
        publicKey: publicKeyB64,
        keyId,
        fingerprint,
        algorithm: 'RS256',
    };
}

/**
 * Generate key pair (defaults to ES256)
 */
export function generateKeyPair(
    algorithm: KeyAlgorithmType = 'ES256'
): KeyPair
{
    return algorithm === 'ES256'
        ? generateKeyPairES256()
        : generateKeyPairRS256();
}

/**
 * Generate JWT signed with client private key (DER format)
 */
export function generateClientToken(
    payload: Record<string, any>,
    privateKeyB64: string,
    algorithm: Algorithm,
    options?: {
        expiresIn?: StringValue | number;
        issuer?: string;
    }
): string
{
    try
    {
        // Convert Base64 back to Buffer
        const privateKeyDER = Buffer.from(privateKeyB64, 'base64');

        // Create key object for signing
        const privateKeyObject = crypto.createPrivateKey({
            key: privateKeyDER,
            format: 'der',
            type: 'pkcs8',
        });

        // Export as PEM for jwt.sign
        const privateKeyPEM = privateKeyObject.export({
            type: 'pkcs8',
            format: 'pem',
        });

        const signOptions: SignOptions = {
            algorithm,
            issuer: options?.issuer || 'spfn-client',
            expiresIn: options?.expiresIn ?? '15m', // Default to 15 minutes
        }

        return jwt.sign(payload, privateKeyPEM, signOptions);
    }
    catch (error)
    {
        throw new Error(
            `Failed to generate client token: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

/**
 * Get key size information
 */
export function getKeySize(publicKeyB64: string): {
    bytes: number;
    base64Length: number;
}
{
    const keyDER = Buffer.from(publicKeyB64, 'base64');

    return {
        bytes: keyDER.length,
        base64Length: publicKeyB64.length,
    };
}

/**
 * Check if key should be rotated based on creation date
 */
export function shouldRotateKey(
    createdAt: Date,
    rotationDays: number = 90
): {
    shouldRotate: boolean;
    daysRemaining: number;
}
{
    const now = new Date();
    const ageInDays = Math.floor(
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const daysRemaining = Math.max(0, rotationDays - ageInDays);

    return {
        shouldRotate: daysRemaining <= 7, // Warn 7 days before expiry
        daysRemaining,
    };
}