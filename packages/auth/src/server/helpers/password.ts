/**
 * @spfn/auth - Password Helpers
 *
 * Password hashing and verification using bcrypt (@node-rs/bcrypt).
 *
 * Uses the native (Rust/napi) implementation, which runs the CPU-bound key
 * derivation on the libuv threadpool instead of the main event loop — so
 * concurrent logins run in parallel and don't head-of-line-block other requests.
 * Hashes are standard bcrypt ($2*$) and verify against existing bcryptjs hashes.
 * For very high concurrent-login load, raise UV_THREADPOOL_SIZE toward the core
 * count (default pool is 4).
 *
 * Security:
 * - Adaptive hashing (configurable rounds, default 12)
 * - Automatic salt generation (per-password)
 * - Constant-time comparison (timing attack protection)
 * - Rainbow table protection
 */

import * as bcrypt from '@node-rs/bcrypt';
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
 * Salt rounds are configured via SPFN_AUTH_BCRYPT_SALT_ROUNDS (native timings):
 * - 12 rounds: ~200ms (default — OWASP-aligned, off the event loop)
 * - 10 rounds: ~55ms (faster, lower work factor)
 * - 14 rounds: ~800ms (very secure, heavy)
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

    return bcrypt.verify(password, hash);
}

/**
 * Dummy bcrypt hash for timing equalization.
 *
 * A credential check for a non-existent account (or one with no passwordHash to
 * compare against) should still spend roughly the same time as a real bcrypt
 * verify — otherwise skipping the hash leaks account existence/state via
 * response timing (user enumeration). Callers verify the supplied password
 * against this dummy hash on the "no real hash to check" branch. Computed once
 * at the configured cost (matches real users' hashes) and reused.
 *
 * Shared by `loginService` (auth.service.ts) and `cancelAccountDeletionService`
 * (account-deletion.service.ts) — kept here rather than in either service to
 * avoid a circular import between the two (they already import from each other
 * for `getPendingDeletionInfo`).
 */
let dummyHashPromise: Promise<string> | null = null;
export function getDummyPasswordHash(): Promise<string>
{
    if (!dummyHashPromise)
    {
        dummyHashPromise = hashPassword('spfn-nonexistent-account-timing-equalizer');
    }

    return dummyHashPromise;
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
