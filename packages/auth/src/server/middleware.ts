/**
 * Authentication middleware for Hono
 */

import type { Context, MiddlewareHandler, Next } from 'hono';

import type { AuthMiddlewareOptions, AuthProvider } from '../shared/types.js';

import { ERROR_MESSAGES } from '../shared/constants.js';
import { extractSignatureHeaders } from './signer.js';

/**
 * Create RequireAuth middleware
 *
 * @param provider - Authentication provider
 * @param options - Authorization options
 * @returns Hono middleware handler
 */
export function RequireAuth<TUser = any>(
    provider: AuthProvider<TUser>,
    options?: AuthMiddlewareOptions<TUser>
): MiddlewareHandler
{
    return async (c: Context, next: Next) =>
    {
        const headers = extractSignatureHeaders({
            get: (name: string) => c.req.header(name) ?? null,
        });

        if (!headers)
        {
            throw new Error(ERROR_MESSAGES.UNAUTHORIZED);
        }

        const user = await provider.verifySignature({
            keyId: headers.keyId,
            signature: headers.signature,
            timestamp: headers.timestamp,
            nonce: headers.nonce,
            method: c.req.method,
            url: c.req.path,
            body: await c.req.text().catch(() => null),
        });

        if (options?.roles)
        {
            const userRole = (user as any).role;
            if (!options.roles.includes(userRole))
            {
                throw new Error(ERROR_MESSAGES.INSUFFICIENT_ROLE);
            }
        }

        if (options?.permissions)
        {
            const userPermissions = (user as any).permissions || [];
            const hasPermission = options.permissions.every(p =>
                userPermissions.includes(p)
            );

            if (!hasPermission)
            {
                throw new Error(ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS);
            }
        }

        if (options?.authorize)
        {
            const isAuthorized = await options.authorize(user, c);
            if (!isAuthorized)
            {
                throw new Error(ERROR_MESSAGES.FORBIDDEN);
            }
        }

        c.set('user', user);

        await next();
    };
}