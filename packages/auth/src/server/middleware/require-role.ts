/**
 * @spfn/auth - Role Middleware
 *
 * Middleware functions for role-based access control
 */

import type { Context, Next } from 'hono';
import { defineMiddleware } from '@spfn/core/server';
import { getAuth } from '@/server/helpers/context';
import { hasAnyRole } from '@/server/services/permission.service';
import { ForbiddenError } from '@spfn/core/errors';
import { InsufficientRoleError } from '@/errors';
import { authLogger } from '@/server/logger';

/**
 * Require user to have one of the specified roles
 *
 * Must be used after authenticate middleware
 *
 * @param roleNames - Role names (e.g., 'admin', 'superadmin')
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * // In route file
 * import { authenticate, requireRole } from '@spfn/auth/server/middleware';
 *
 * export const adminDashboardRoute = route.get('/admin/dashboard')
 *   .use([authenticate, requireRole('admin', 'superadmin')])
 *   .handler(async (c) => {
 *     // Only admin or superadmin
 *   });
 *
 * // Single role
 * export const systemConfigRoute = route.get('/admin/config')
 *   .use([authenticate, requireRole('superadmin')])
 *   .handler(async (c) => {
 *     // Only superadmin
 *   });
 *
 * // Skip role check for specific route
 * export const publicAdminRoute = route.get('/admin/public')
 *   .skip(['role'])  // Type-safe skip
 *   .handler(async (c) => { ... });
 * ```
 */
export const requireRole = defineMiddleware('role',
    (...roleNames: string[]) => async (c: Context, next: Next) =>
    {
        const auth = getAuth(c);

        if (!auth)
        {
            authLogger.middleware.warn('Role check failed: not authenticated', {
                roles: roleNames,
                path: c.req.path,
            });
            throw new ForbiddenError({ message: 'Authentication required' });
        }

        const { userId } = auth;

        const allowed = await hasAnyRole(userId, roleNames);

        if (!allowed)
        {
            authLogger.middleware.warn('Role check failed', {
                userId,
                requiredRoles: roleNames,
                path: c.req.path,
            });
            throw new InsufficientRoleError({ requiredRoles: roleNames });
        }

        authLogger.middleware.debug('Role check passed', {
            userId,
            roles: roleNames,
        });

        await next();
    }
);