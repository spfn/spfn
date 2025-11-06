/**
 * @spfn/auth - Password Helpers
 *
 * Password hashing and verification using bcrypt
 *
 * Security:
 * - Adaptive hashing (configurable rounds)
 * - Automatic salt generation (per-password)
 * - Constant-time comparison (timing attack protection)
 * - Rainbow table protection
 */

import bcrypt from 'bcrypt';

/**
 * Bcrypt salt rounds (cost factor)
 *
 * Determines computational cost: 2^rounds iterations
 * - 10 rounds: ~100ms (default, balanced)
 * - 12 rounds: ~400ms (more secure, slower)
 * - 14 rounds: ~1600ms (very secure, too slow for most apps)
 *
 * Can be configured via SPFN_AUTH_BCRYPT_SALT_ROUNDS environment variable
 */
const SALT_ROUNDS = parseInt(
    process.env.SPFN_AUTH_BCRYPT_SALT_ROUNDS ||  // New prefixed version (recommended)
    process.env.BCRYPT_SALT_ROUNDS ||             // Legacy fallback
    '10',
    10
);

/**
 * Hash a plain text password using bcrypt
 *
 * Algorithm:
 * 1. Generate random salt (128-bit)
 * 2. Apply bcrypt key derivation (2^rounds iterations)
 * 3. Return $2b$rounds$[salt][hash] (60 chars)
 *
 * @param password - Plain text password to hash
 * @returns Bcrypt hash string (includes salt)
 * @throws Error if password is empty or invalid
 *
 * @example
 * ```typescript
 * const hash = await hashPassword('mySecurePassword123');
 * // Returns: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
 * ```
 */
export async function hashPassword(password: string): Promise<string>
{
    if (!password || password.length === 0)
    {
        throw new Error('Password cannot be empty');
    }

    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash
 *
 * Uses constant-time comparison to prevent timing attacks
 * Automatically extracts salt from hash for verification
 *
 * @param password - Plain text password to verify
 * @param hash - Bcrypt hash string (from hashPassword)
 * @returns True if password matches hash
 * @throws Error if inputs are invalid
 *
 * @example
 * ```typescript
 * const isValid = await verifyPassword(
 *     'mySecurePassword123',
 *     '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
 * );
 * // Returns: true
 * ```
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean>
{
    if (!password || password.length === 0)
    {
        throw new Error('Password cannot be empty');
    }

    if (!hash || hash.length === 0)
    {
        throw new Error('Hash cannot be empty');
    }

    return bcrypt.compare(password, hash);
}

/**
 * Validate password strength
 *
 * Requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 *
 * @param password - Password to validate
 * @returns Validation result with error messages
 *
 * @example
 * ```typescript
 * const result = validatePasswordStrength('weak');
 * // Returns: { valid: false, errors: ['Too short', 'Missing uppercase', ...] }
 *
 * const result = validatePasswordStrength('SecurePass123!');
 * // Returns: { valid: true, errors: [] }
 * ```
 */
export function validatePasswordStrength(password: string): {
    valid: boolean;
    errors: string[];
}
{
    const errors: string[] = [];

    if (password.length < 8)
    {
        errors.push('Password must be at least 8 characters');
    }

    if (!/[A-Z]/.test(password))
    {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password))
    {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password))
    {
        errors.push('Password must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(password))
    {
        errors.push('Password must contain at least one special character');
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}