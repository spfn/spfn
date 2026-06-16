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

import bcrypt from 'bcryptjs';
import { env } from '@spfn/auth/config';
import { createPasswordParser } from '@spfn/core/env';

/**
 * Hash a plain text password using bcrypt
 *
 * Algorithm:
 * 1. Generate random salt (128-bit)
 * 2. Apply bcrypt key derivation (2^rounds iterations)
 * 3. Return $2b$rounds$[salt][hash] (60 chars)
 *
 * Salt rounds are configured via SPFN_AUTH_BCRYPT_SALT_ROUNDS:
 * - 10 rounds: ~100ms (default, balanced)
 * - 12 rounds: ~400ms (more secure, slower)
 * - 14 rounds: ~1600ms (very secure, too slow for most apps)
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

    return bcrypt.hash(password, env.SPFN_AUTH_BCRYPT_SALT_ROUNDS);
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
 * Password strength validator (uses core validator internally)
 *
 * Uses @spfn/core/env/validator for consistent validation logic.
 */
const passwordValidator = createPasswordParser({
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: true,
});

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
    try
    {
        passwordValidator(password);

        return {
            valid: true,
            errors: [],
        };
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);

        // Parse error message from validator
        // Format: "Password validation failed: error1, error2, error3"
        const errorMatch = message.match(/Password validation failed: (.+)/);

        if (errorMatch)
        {
            const errors = errorMatch[1].split(', ').map((err) =>
            {
                // Convert core validator messages to legacy format
                return err
                    .replace(/^Must be at least (\d+) characters$/, 'Password must be at least $1 characters')
                    .replace(/^Must contain at least one uppercase letter$/, 'Password must contain at least one uppercase letter')
                    .replace(/^Must contain at least one lowercase letter$/, 'Password must contain at least one lowercase letter')
                    .replace(/^Must contain at least one number$/, 'Password must contain at least one number')
                    .replace(/^Must contain at least one special character$/, 'Password must contain at least one special character');
            });

            return {
                valid: false,
                errors,
            };
        }

        // Fallback for unexpected error format
        return {
            valid: false,
            errors: [message],
        };
    }
}
