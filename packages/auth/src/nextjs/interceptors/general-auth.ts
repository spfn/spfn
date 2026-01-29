/**
 * General Authentication Interceptor
 *
 * Handles authentication for all API requests except login/register
 * - Session validation and renewal
 * - JWT generation and signing
 * - Expired session cleanup
 */

import type { InterceptorRule } from '@spfn/core/nextjs/server';
import { unsealSession, sealSession, shouldRefreshSession, generateClientToken, getSessionTtl, COOKIE_NAMES, authLogger } from '@spfn/auth/server';
import { env } from '@spfn/core/config';

/**
 * Check if path requires authentication
 */
function requiresAuth(path: string): boolean
{
    // Paths that don't require auth
    const publicPaths = [
        /^\/_auth\/login$/,
        /^\/_auth\/register$/,
        /^\/_auth\/codes$/,           // Send verification code
        /^\/_auth\/codes\/verify$/,   // Verify code
        /^\/_auth\/exists$/,           // Check account exists
    ];

    return !publicPaths.some((pattern) => pattern.test(path));
}

/**
 * General Authentication Interceptor
 *
 * Applies to all paths except login/register/codes
 * - Validates session
 * - Generates JWT token
 * - Refreshes session if needed
 * - Clears expired sessions
 */
export const generalAuthInterceptor: InterceptorRule =
{
    pathPattern: '*',  // Match all paths, filter by requiresAuth()
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],

    request: async (ctx, next) =>
    {
        // Skip if path doesn't require auth
        if (!requiresAuth(ctx.path))
        {
            authLogger.interceptor.general.debug(`Public path, skipping auth: ${ctx.path}`);
            await next();
            return;
        }

        // Log available cookies
        const cookieNames = Array.from(ctx.cookies.keys());
        authLogger.interceptor.general.debug('Available cookies:', {
            cookieNames,
            totalCount: cookieNames.length,
            lookingFor: COOKIE_NAMES.SESSION,
        });

        const sessionCookie = ctx.cookies.get(COOKIE_NAMES.SESSION);

        authLogger.interceptor.general.debug('Request', {
            method: ctx.method,
            path: ctx.path,
            hasSession: !!sessionCookie,
            sessionCookieValue: sessionCookie ? '***EXISTS***' : 'NOT_FOUND',
        });

        // No session cookie
        if (!sessionCookie)
        {
            authLogger.interceptor.general.debug('No session cookie, proceeding without auth');
            // Let request proceed - server will return 401
            await next();
            return;
        }

        try
        {
            // Decrypt and validate session
            const session = await unsealSession(sessionCookie);

            authLogger.interceptor.general.debug('Session valid', {
                userId: session.userId,
                keyId: session.keyId,
            });

            // Check if session should be refreshed (within 24h of expiry)
            const needsRefresh = await shouldRefreshSession(sessionCookie, 24);

            if (needsRefresh)
            {
                authLogger.interceptor.general.debug('Session needs refresh (within 24h of expiry)');
                // Mark for session renewal in response interceptor
                ctx.metadata.refreshSession = true;
                ctx.metadata.sessionData = session;
            }

            // Generate JWT token
            const token = generateClientToken(
                {
                    userId: session.userId,
                    keyId: session.keyId,
                    timestamp: Date.now(),
                },
                session.privateKey,
                session.algorithm,
                { expiresIn: '15m' }
            );

            authLogger.interceptor.general.debug('Generated JWT token (expires in 15m)');

            // Add authentication headers
            ctx.headers['Authorization'] = `Bearer ${token}`;
            ctx.headers['X-Key-Id'] = session.keyId;

            // Store session info in metadata
            ctx.metadata.userId = session.userId;
            ctx.metadata.sessionValid = true;
        }
        catch (error)
        {
            const err = error as Error;

            // Session expired or invalid
            if (err.message.includes('expired') || err.message.includes('invalid'))
            {
                authLogger.interceptor.general.warn('Session expired or invalid', { message: err.message });
                authLogger.interceptor.general.debug('Marking session for cleanup');

                // Mark for cleanup in response interceptor
                ctx.metadata.clearSession = true;
                ctx.metadata.sessionValid = false;
            }
            else
            {
                authLogger.interceptor.general.error('Failed to process session', err);
            }
        }

        await next();
    },

    response: async (ctx, next) =>
    {
        // Clear expired/invalid session
        if (ctx.metadata.clearSession)
        {
            ctx.setCookies.push({
                name: COOKIE_NAMES.SESSION,
                value: '',
                options: {
                    maxAge: 0,
                    path: '/',
                },
            });

            ctx.setCookies.push({
                name: COOKIE_NAMES.SESSION_KEY_ID,
                value: '',
                options: {
                    maxAge: 0,
                    path: '/',
                },
            });
        }
        // Refresh session if needed and request was successful
        else if (ctx.metadata.refreshSession && ctx.response.status === 200)
        {
            try
            {
                const sessionData = ctx.metadata.sessionData;
                const ttl = getSessionTtl();

                // Re-encrypt session with new TTL
                const sealed = await sealSession(sessionData, ttl);

                // Update session cookie
                ctx.setCookies.push({
                    name: COOKIE_NAMES.SESSION,
                    value: sealed,
                    options: {
                        httpOnly: true,
                        secure: env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: ttl,
                        path: '/',
                    },
                });

                // Update keyId cookie
                ctx.setCookies.push({
                    name: COOKIE_NAMES.SESSION_KEY_ID,
                    value: sessionData.keyId,
                    options: {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'strict',
                        maxAge: ttl,
                        path: '/',
                    },
                });

                authLogger.interceptor.general.info('Session refreshed', { userId: sessionData.userId });
            }
            catch (error)
            {
                const err = error as Error;
                authLogger.interceptor.general.error('Failed to refresh session', err);
            }
        }
        // Handle logout (clear session)
        else if (ctx.path === '/_auth/logout' && ctx.response.ok)
        {
            ctx.setCookies.push({
                name: COOKIE_NAMES.SESSION,
                value: '',
                options: {
                    maxAge: 0,
                    path: '/',
                },
            });

            ctx.setCookies.push({
                name: COOKIE_NAMES.SESSION_KEY_ID,
                value: '',
                options: {
                    maxAge: 0,
                    path: '/',
                },
            });
        }

        await next();
    },
};