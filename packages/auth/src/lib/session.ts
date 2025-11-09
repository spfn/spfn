/**
 * @spfn/auth - Client Session Management
 *
 * Uses Jose JWE (JSON Web Encryption) to securely store session data in cookies
 * More efficient than Iron Session with better Edge Runtime support
 */

import * as jose from 'jose';

export interface SessionData
{
    userId: string;
    privateKey: string;     // Base64 encoded DER
    keyId: string;
    algorithm: 'ES256' | 'RS256';
}

/**
 * Calculate Shannon entropy of a string
 * Returns entropy in bits per character
 *
 * @param str - String to calculate entropy for
 * @returns Entropy value (0 to ~6.6 bits for printable ASCII)
 */
function calculateEntropy(str: string): number
{
    const len = str.length;
    const frequencies = new Map<string, number>();

    // Count character frequencies
    for (const char of str)
    {
        frequencies.set(char, (frequencies.get(char) || 0) + 1);
    }

    // Calculate Shannon entropy
    let entropy = 0;
    for (const count of frequencies.values())
    {
        const probability = count / len;
        entropy -= probability * Math.log2(probability);
    }

    return entropy;
}

/**
 * Get session secret from environment
 * Must be at least 32 characters (256-bit)
 *
 * Derives a 32-byte key using SHA-256 to ensure compatibility with Jose A256GCM
 */
function getSessionSecret(): Uint8Array
{
    const secret =
        process.env.SPFN_AUTH_SESSION_SECRET ||  // New prefixed version (recommended)
        process.env.SESSION_SECRET;               // Legacy fallback

    if (!secret)
    {
        throw new Error('SPFN_AUTH_SESSION_SECRET environment variable is not set');
    }

    if (secret.length < 32)
    {
        throw new Error('SPFN_AUTH_SESSION_SECRET must be at least 32 characters long');
    }

    // Derive a 32-byte key using SHA-256 for A256GCM compatibility
    const crypto = require('crypto');
    return new Uint8Array(crypto.createHash('sha256').update(secret).digest());
}

/**
 * Seal session data into encrypted JWT (JWE)
 *
 * @param data - Session data to encrypt
 * @param ttl - Time to live in seconds (default: 7 days)
 * @returns Encrypted JWT string
 */
export async function sealSession(
    data: SessionData,
    ttl: number = 60 * 60 * 24 * 7 // 7 days
): Promise<string>
{
    const secret = getSessionSecret();

    return await new jose.EncryptJWT({ data })
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuedAt()
        .setExpirationTime(`${ttl}s`)
        .setIssuer('spfn-auth')
        .setAudience('spfn-client')
        .encrypt(secret);
}

/**
 * Unseal encrypted JWT (JWE) to session data
 *
 * @param jwt - Encrypted JWT string
 * @returns Session data
 * @throws Error if session is invalid or expired
 */
export async function unsealSession(jwt: string): Promise<SessionData>
{
    const secret = getSessionSecret();

    try
    {
        const { payload } = await jose.jwtDecrypt(jwt, secret, {
            issuer: 'spfn-auth',
            audience: 'spfn-client',
        });

        return payload.data as SessionData;
    }
    catch (err)
    {
        if (err instanceof jose.errors.JWTExpired)
        {
            throw new Error('Session expired');
        }
        if (err instanceof jose.errors.JWEDecryptionFailed)
        {
            throw new Error('Invalid session');
        }
        if (err instanceof jose.errors.JWTClaimValidationFailed)
        {
            throw new Error('Session validation failed');
        }
        throw new Error('Failed to unseal session');
    }
}

/**
 * Get session metadata without decrypting
 *
 * @param jwt - Encrypted JWT string
 * @returns Session metadata or null if invalid
 */
export async function getSessionInfo(jwt: string): Promise<{
    issuedAt: Date;
    expiresAt: Date;
    issuer: string;
    audience: string;
} | null>
{
    const secret = getSessionSecret();

    try
    {
        const { payload } = await jose.jwtDecrypt(jwt, secret);

        return {
            issuedAt: new Date(payload.iat! * 1000),
            expiresAt: new Date(payload.exp! * 1000),
            issuer: payload.iss || '',
            audience: Array.isArray(payload.aud) ? payload.aud[0] : payload.aud || '',
        };
    }
    catch (err)
    {
        // Log error for debugging but return null for graceful handling
        if (process.env.NODE_ENV !== 'production')
        {
            console.warn('[Session] Failed to get session info:', err instanceof Error ? err.message : 'Unknown error');
        }
        return null;
    }
}

/**
 * Check if session is about to expire (within threshold)
 *
 * @param jwt - Encrypted JWT string
 * @param thresholdHours - Hours before expiry to trigger refresh (default: 24)
 * @returns True if session should be refreshed
 */
export async function shouldRefreshSession(
    jwt: string,
    thresholdHours: number = 24
): Promise<boolean>
{
    const info = await getSessionInfo(jwt);

    if (!info)
    {
        return true;
    }

    const hoursRemaining = (info.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);

    return hoursRemaining < thresholdHours;
}

/**
 * Validate session secret strength
 * Call this at startup to ensure proper configuration
 *
 * Validation criteria:
 * - Minimum 32 characters (256-bit)
 * - Minimum 16 unique characters
 * - Minimum 3.5 bits/char Shannon entropy (good randomness)
 */
export function validateSessionSecret(): {
    valid: boolean;
    error?: string;
    details?: {
        length: number;
        uniqueChars: number;
        entropy: number;
    };
}
{
    try
    {
        const secret =
            process.env.SPFN_AUTH_SESSION_SECRET ||  // New prefixed version (recommended)
            process.env.SESSION_SECRET;               // Legacy fallback

        if (!secret)
        {
            return { valid: false, error: 'SPFN_AUTH_SESSION_SECRET is not set' };
        }

        const length = secret.length;
        const uniqueChars = new Set(secret).size;
        const entropy = calculateEntropy(secret);

        // Check length (minimum 32 chars for 256-bit)
        if (length < 32)
        {
            return {
                valid: false,
                error: `SPFN_AUTH_SESSION_SECRET too short (${length} chars, minimum 32)`,
                details: { length, uniqueChars, entropy },
            };
        }

        // Check unique character diversity
        if (uniqueChars < 16)
        {
            return {
                valid: false,
                error: `SPFN_AUTH_SESSION_SECRET has low diversity (${uniqueChars} unique chars, minimum 16)`,
                details: { length, uniqueChars, entropy },
            };
        }

        // Check Shannon entropy (3.5 bits/char is good randomness)
        // For reference:
        // - Random lowercase: ~4.7 bits/char
        // - Random alphanumeric: ~5.2 bits/char
        // - Random printable ASCII: ~6.6 bits/char
        // - "aaaaaaa...": ~0 bits/char
        // - "abcabcabc...": ~1.58 bits/char
        if (entropy < 3.5)
        {
            return {
                valid: false,
                error: `SPFN_AUTH_SESSION_SECRET has low entropy (${entropy.toFixed(2)} bits/char, minimum 3.5). Use a more random secret.`,
                details: { length, uniqueChars, entropy },
            };
        }

        return {
            valid: true,
            details: { length, uniqueChars, entropy },
        };
    }
    catch (err)
    {
        return { valid: false, error: 'Failed to validate SPFN_AUTH_SESSION_SECRET' };
    }
}