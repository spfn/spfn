/**
 * @spfn/auth - Authentication Middleware
 *
 * Verify client-signed JWT token with public key
 *
 * Flow:
 * 1. Extract Authorization header
 * 2. Decode JWT to extract keyId
 * 3. Fetch public key from database
 * 4. Check key expiration
 * 5. Verify JWT signature with public key
 * 6. Validate user status
 * 7. Update last used timestamp
 * 8. Attach user to context
 *
 * Security Checks:
 * - Token signature verification
 * - Key expiration check
 * - User status check (active/inactive/suspended)
 * - Key revocation check (isActive flag)
 */

import type { Context, Next } from 'hono';
import { KeyAlgorithmType, verifyClientToken } from '@/server/helpers/jwt';
import type { User } from '@/server/entities/users';
import {
    InvalidTokenError,
    TokenExpiredError,
    KeyExpiredError,
    AccountDisabledError,
} from '@/server/errors';
import { UnauthorizedError } from '@spfn/core/errors';
import { keysRepository, usersRepository } from '@/server/repositories';

// Auth context type
export interface AuthContext
{
    user: User;
    userId: string;
    keyId: string;
}

// Extend Hono context with auth
declare module 'hono'
{
    interface ContextVariableMap
    {
        auth: AuthContext;
    }
}

/**
 * Authentication middleware
 *
 * Verifies client-signed JWT token using stored public key
 * Must be applied to routes that require authentication
 *
 * @example
 * ```typescript
 * // In route file
 * app.bind(logoutContract, [authenticate], async (c) => {
 *     const auth = c.raw.get('auth');  // Get auth context
 *     const { user, userId, keyId } = auth;
 *     // Or access directly: c.raw.get('auth').user
 * });
 * ```
 */
export async function authenticate(c: Context, next: Next): Promise<Response | void>
{
    // Extract Authorization header
    const authHeader = c.req.header('Authorization');

    // Validate Authorization header format
    if (!authHeader || !authHeader.startsWith('Bearer '))
    {
        throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // 1. Decode JWT to extract keyId (without verification)
    // We need keyId to fetch the public key for verification
    const { decodeToken } = await import('@/server/helpers/jwt');
    const decoded = decodeToken(token);

    if (!decoded || !decoded.keyId)
    {
        throw new UnauthorizedError('Invalid token: missing keyId');
    }

    const keyId = decoded.keyId as string;

    // 2. Get public key from database
    // Query conditions:
    // - keyId matches (UUID)
    // - isActive = true (not revoked)
    const keyRecord = await keysRepository.findActiveByKeyId(keyId);

    if (!keyRecord)
    {
        throw new UnauthorizedError('Invalid or revoked key');
    }

    // 3. Check key expiration
    // Keys expire after 90 days by default
    if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt)
    {
        throw new KeyExpiredError();
    }

    // 4. Verify JWT signature with public key
    // This validates:
    // - Signature matches (client signed with private key)
    // - Token not expired (15min default)
    // - Issuer is 'spfn-client'
    try
    {
        verifyClientToken(
            token,
            keyRecord.publicKey,
            keyRecord.algorithm as KeyAlgorithmType // entity.algorithm is always defined
        );
    }
    catch (err)
    {
        // Handle JWT verification errors
        if (err instanceof Error)
        {
            // Token expired (15min TTL)
            if (err.name === 'TokenExpiredError')
            {
                throw new TokenExpiredError();
            }

            // Invalid signature
            if (err.name === 'JsonWebTokenError')
            {
                throw new InvalidTokenError('Invalid token signature');
            }
        }

        // Generic authentication failure
        throw new UnauthorizedError('Authentication failed');
    }

    // 5. Get user from database
    const user = await usersRepository.findById(keyRecord.userId);
    if (!user)
    {
        throw new UnauthorizedError('User not found');
    }

    // 6. Check if user account is active
    // Status can be: active, inactive, suspended
    if (user.status !== 'active')
    {
        throw new AccountDisabledError(user.status);
    }

    // 7. Update last used timestamp (fire-and-forget)
    // Don't await to avoid blocking the request
    // Useful for:
    // - Security audits
    // - Detecting inactive keys
    // - Key rotation reminders
    keysRepository.updateLastUsedById(keyRecord.id)
        .catch((err: unknown) => console.error('Failed to update lastUsedAt:', err));

    // 8. Attach auth data to context
    // Available in downstream route handlers via c.get('auth')
    c.set('auth', {
        user,
        userId: String(user.id),
        keyId,
    });

    // Log API access
    const method = c.req.method;
    const path = c.req.path;
    console.log('[Auth] API access', {
        userId: user.id,
        email: user.email,
        keyId,
        method,
        path,
        ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
        userAgent: c.req.header('user-agent'),
    });

    // Continue to route handler
    await next();
}