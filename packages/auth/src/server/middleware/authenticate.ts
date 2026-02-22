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

import { defineMiddleware } from '@spfn/core/route';
import { UnauthorizedError } from '@spfn/core/errors';

import type { User, KeyAlgorithmType } from '@spfn/auth/server';
import { verifyClientToken, decodeToken, authLogger, keysRepository, usersRepository } from '@spfn/auth/server';
import {
    InvalidTokenError,
    TokenExpiredError,
    KeyExpiredError,
    AccountDisabledError,
} from '@spfn/auth/errors';

// Auth context type
export interface AuthContext
{
    user: User;
    userId: string;
    keyId: string;
    role: string | null;
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
 * // In server.config.ts
 * import { authenticate } from '@spfn/auth/server/middleware';
 *
 * export default defineServerConfig()
 *   .middlewares([authenticate])
 *   .routes(appRouter)
 *   .build();
 *
 * // In route file - skip auth for public routes
 * export const publicRoute = route.get('/health')
 *   .skip(['auth'])  // Type-safe skip
 *   .handler(async (c) => c.success({ status: 'ok' }));
 *
 * // Protected route - auth applied automatically
 * export const protectedRoute = route.get('/profile')
 *   .handler(async (c) => {
 *     const auth = c.get('auth');  // Get auth context
 *     const { user, userId, keyId } = auth;
 *     // Or access directly: c.get('auth').user
 *   });
 * ```
 */
export const authenticate = defineMiddleware('auth', async (c, next) =>
{
    // Extract Authorization header
    const authHeader = c.req.header('Authorization');

    // Validate Authorization header format
    if (!authHeader || !authHeader.startsWith('Bearer '))
    {
        authLogger.middleware.error('Missing or invalid authorization header. If using Next.js API routes, ensure you have imported \'@spfn/auth/nextjs/api\' in your API route handler (e.g., src/app/api/actions/[[...path]]/route.ts) to enable automatic authentication header forwarding from client to backend.', {
            headers: c.req.header(),
            path: c.req.path,
        });

        throw new UnauthorizedError({ message: 'Authentication header missing or invalid: Bearer {token}' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // 1. Decode JWT to extract keyId (without verification)
    // We need keyId to fetch the public key for verification
    const decoded = decodeToken(token);

    if (!decoded || !decoded.keyId)
    {
        throw new UnauthorizedError({ message: 'Invalid token: missing keyId' });
    }

    const keyId = decoded.keyId as string;

    // 2. Get public key from database
    // Query conditions:
    // - keyId matches (UUID)
    // - isActive = true (not revoked)
    const keyRecord = await keysRepository.findActiveByKeyId(keyId);

    if (!keyRecord)
    {
        throw new UnauthorizedError({ message: 'Invalid or revoked key' });
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
                throw new InvalidTokenError({ message: 'Invalid token signature' });
            }
        }

        // Generic authentication failure
        throw new UnauthorizedError({ message: 'Authentication failed' });
    }

    // 5. Get user from database (with role via leftJoin)
    const result = await usersRepository.findByIdWithRole(keyRecord.userId);
    if (!result)
    {
        throw new UnauthorizedError({ message: 'User not found' });
    }

    const { user, role } = result;

    // 6. Check if user account is active
    // Status can be: active, inactive, suspended
    if (user.status !== 'active')
    {
        throw new AccountDisabledError({ status: user.status });
    }

    // 7. Update last used timestamp (fire-and-forget)
    // Don't await to avoid blocking the request
    // Useful for:
    // - Security audits
    // - Detecting inactive keys
    // - Key rotation reminders
    keysRepository.updateLastUsedById(keyRecord.id)
        .catch((err: unknown) => authLogger.middleware.error('Failed to update lastUsedAt', err));

    // 8. Attach auth data to context
    // Available in downstream route handlers via c.get('auth')
    c.set('auth', {
        user,
        userId: String(user.id),
        keyId,
        role: role?.name ?? null,
    });

    // Log API access
    const method = c.req.method;
    const path = c.req.path;
    authLogger.middleware.info('API access', {
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
});