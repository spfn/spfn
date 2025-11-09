/**
 * Authentication Interceptor
 *
 * Automatically adds JWT token and headers for authenticated requests
 */

import type { InterceptorRule } from '@spfn/core/client/nextjs';
import { unsealSession } from '@/lib/session';
import { generateClientToken } from '@/lib/crypto';

/**
 * Authentication Interceptor
 *
 * Request: Reads session cookie and adds JWT token to headers
 * Response: Handles logout (clears session)
 */
export const authenticationInterceptor: InterceptorRule =
{
    pathPattern: /^\/_auth\/(logout|keys\/rotate|password)/,
    method: ['POST', 'PUT'],

    request: async (ctx, next) =>
    {
        const sessionCookie = ctx.cookies.get('spfn_session');

        if (!sessionCookie)
        {
            // No session - let request proceed (will be rejected by server)
            await next();
            return;
        }

        try
        {
            // Decrypt session
            const session = await unsealSession(sessionCookie);

            // Generate JWT token
            const token = await generateClientToken(
                {
                    userId: session.userId,
                    keyId: session.keyId,
                    timestamp: Date.now(),
                },
                session.privateKey,
                session.algorithm,
                { expiresIn: '15m' }
            );

            // Add authentication headers
            ctx.headers['Authorization'] = `Bearer ${token}`;
            ctx.headers['X-Key-Id'] = session.keyId;

            // Store userId in metadata for response interceptor
            ctx.metadata.userId = session.userId;
        }
        catch (error)
        {
            const err = error as Error;
            console.error('[Auth Interceptor] Failed to read session:', err);
        }

        await next();
    },

    response: async (ctx, next) =>
    {
        // Clear session cookie on logout
        if (ctx.path === '/_auth/logout' && ctx.response.status === 200)
        {
            ctx.setCookies.push({
                name: 'spfn_session',
                value: '',
                options: {
                    maxAge: 0,
                    path: '/',
                },
            });

            ctx.setCookies.push({
                name: 'spfn_session_key_id',
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