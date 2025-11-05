/**
 * @spfn/auth - Role Middleware
 *
 * Middleware functions for role-based access control
 */

import type { Context, Next } from 'hono';
import { getAuth } from '@/server/helpers/context';
import { hasAnyRole } from '@/server/services/permission.service';
import { ForbiddenError } from '@spfn/core/errors';

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
 * app.bind(
 *   adminDashboardContract,
 *   [authenticate, requireRole('admin', 'superadmin')],
 *   async (c) => {
 *     // Only admin or superadmin
 *   }
 * );
 *
 * // Single role
 * app.bind(
 *   systemConfigContract,
 *   [authenticate, requireRole('superadmin')],
 *   async (c) => {
 *     // Only superadmin
 *   }
 * );
 * ```
 */
export function requireRole(...roleNames: string[])
{
    return async (c: Context, next: Next): Promise<void> =>
    {
        const auth = getAuth(c);

        if (!auth)
        {
            throw new ForbiddenError('Authentication required');
        }

        const { userId } = auth;

        const allowed = await hasAnyRole(userId, roleNames);

        if (!allowed)
        {
            throw new ForbiddenError(
                `Required roles: ${roleNames.join(', ')}`
            );
        }

        await next();
    };
}