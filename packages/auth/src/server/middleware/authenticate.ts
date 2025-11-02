/**
 * @spfn/auth - Authentication Middleware
 *
 * Verify client-signed JWT token with public key
 *
 * Flow:
 * 1. Extract Authorization header + X-Key-Id header
 * 2. Fetch public key from database
 * 3. Verify JWT signature with public key
 * 4. Validate user status
 * 5. Attach user to context
 *
 * Security Checks:
 * - Token signature verification
 * - Key expiration check
 * - User status check (active/inactive/suspended)
 * - Key revocation check (isActive flag)
 */

import type { Context, Next } from 'hono';
import { verifyClientToken } from '@/server/helpers/jwt';
import { findOne } from '@spfn/core/db';
import { users, userPublicKeys } from '@/server/entities';
import type { User } from '@/server/entities/users';
import { eq, and } from 'drizzle-orm';
import { db } from '@spfn/core/db';

// Extend Hono context with user
declare module 'hono'
{
    interface ContextVariableMap
    {
        user: User;
        userId: string;
        keyId: string;
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
 *     const user = c.get('user');  // Available after authentication
 *     const userId = c.get('userId');
 *     const keyId = c.get('keyId');
 *     // ...
 * });
 * ```
 */
export async function authenticate(c: Context, next: Next)
{
    // Extract Authorization header
    const authHeader = c.req.header('Authorization');
    const keyId = c.req.header('X-Key-Id');

    // Validate Authorization header format
    if (!authHeader || !authHeader.startsWith('Bearer '))
    {
        return c.json(
            {
                success: false,
                error:
                {
                    code: 'UNAUTHORIZED',
                    message: 'Missing or invalid authorization header',
                },
            },
            401
        );
    }

    // Validate X-Key-Id header
    if (!keyId)
    {
        return c.json(
            {
                success: false,
                error:
                {
                    code: 'UNAUTHORIZED',
                    message: 'Missing X-Key-Id header',
                },
            },
            401
        );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try
    {
        // 1. Get public key from database
        // Query conditions:
        // - keyId matches (UUID)
        // - isActive = true (not revoked)
        const [keyRecord] = await db
            .select()
            .from(userPublicKeys)
            .where(
                and(
                    eq(userPublicKeys.keyId, keyId),
                    eq(userPublicKeys.isActive, true)
                )
            );

        if (!keyRecord)
        {
            return c.json(
                {
                    success: false,
                    error:
                    {
                        code: 'UNAUTHORIZED',
                        message: 'Invalid or revoked key',
                    },
                },
                401
            );
        }

        // 2. Check key expiration
        // Keys expire after 90 days by default
        if (keyRecord.expiresAt && new Date() > keyRecord.expiresAt)
        {
            return c.json(
                {
                    success: false,
                    error:
                    {
                        code: 'KEY_EXPIRED',
                        message: 'Key has expired, please rotate',
                    },
                },
                401
            );
        }

        // 3. Verify JWT signature with public key
        // This validates:
        // - Signature matches (client signed with private key)
        // - Token not expired (15min default)
        // - Issuer is 'spfn-client'
        const payload = verifyClientToken(
            token,
            keyRecord.publicKey,
            keyRecord.algorithm as 'ES256' | 'RS256'
        );

        // 4. Get user from database
        const user = await findOne(users, { id: keyRecord.userId });
        if (!user)
        {
            return c.json(
                {
                    success: false,
                    error:
                    {
                        code: 'UNAUTHORIZED',
                        message: 'User not found',
                    },
                },
                401
            );
        }

        // 5. Check if user account is active
        // Status can be: active, inactive, suspended
        if (user.status !== 'active')
        {
            return c.json(
                {
                    success: false,
                    error:
                    {
                        code: 'ACCOUNT_DISABLED',
                        message: `Account is ${user.status}`,
                    },
                },
                403  // Forbidden (not 401 Unauthorized)
            );
        }

        // 6. Update last used timestamp (fire-and-forget)
        // Don't await to avoid blocking the request
        // Useful for:
        // - Security audits
        // - Detecting inactive keys
        // - Key rotation reminders
        db.update(userPublicKeys)
            .set({ lastUsedAt: new Date() })
            .where(eq(userPublicKeys.id, keyRecord.id))
            .execute()
            .catch(err => console.error('Failed to update lastUsedAt:', err));

        // 7. Attach user data to context
        // Available in downstream route handlers
        c.set('user', user);
        c.set('userId', String(user.id));
        c.set('keyId', keyId);

        // Continue to route handler
        await next();
    }
    catch (err)
    {
        // Handle JWT verification errors
        if (err instanceof Error)
        {
            // Token expired (15min TTL)
            if (err.name === 'TokenExpiredError')
            {
                return c.json(
                    {
                        success: false,
                        error:
                        {
                            code: 'TOKEN_EXPIRED',
                            message: 'Token has expired',
                        },
                    },
                    401
                );
            }

            // Invalid signature
            if (err.name === 'JsonWebTokenError')
            {
                return c.json(
                    {
                        success: false,
                        error:
                        {
                            code: 'INVALID_TOKEN',
                            message: 'Invalid token signature',
                        },
                    },
                    401
                );
            }
        }

        // Generic authentication failure
        return c.json(
            {
                success: false,
                error:
                {
                    code: 'AUTHENTICATION_FAILED',
                    message: 'Authentication failed',
                },
            },
            401
        );
    }
}