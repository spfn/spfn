/**
 * @spfn/auth - Permission Middleware
 *
 * Middleware functions for permission-based access control
 */

import type { Context, Next } from 'hono';
import { getAuth } from '@/server/helpers/context';
import { hasAllPermissions, hasAnyPermission } from '@/server/services/permission.service';
import { ForbiddenError } from '@spfn/core/errors';

/**
 * Require user to have all specified permissions
 *
 * Must be used after authenticate middleware
 *
 * @param permissionNames - Permission names (e.g., 'user:delete', 'post:publish')
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * app.bind(
 *   deleteUserContract,
 *   [authenticate, requirePermissions('user:delete')],
 *   async (c) => {
 *     // Only users with user:delete permission
 *   }
 * );
 *
 * // Multiple permissions (all required)
 * app.bind(
 *   publishPostContract,
 *   [authenticate, requirePermissions('post:write', 'post:publish')],
 *   async (c) => {
 *     // Needs both permissions
 *   }
 * );
 * ```
 */
export function requirePermissions(...permissionNames: string[])
{
    return async (c: Context, next: Next): Promise<void> =>
    {
        const auth = getAuth(c);

        if (!auth)
        {
            throw new ForbiddenError('Authentication required');
        }

        const { userId } = auth;

        const allowed = await hasAllPermissions(userId, permissionNames);

        if (!allowed)
        {
            throw new ForbiddenError(
                `Missing required permissions: ${permissionNames.join(', ')}`
            );
        }

        await next();
    };
}

/**
 * Require user to have at least one of the specified permissions
 *
 * Must be used after authenticate middleware
 *
 * @param permissionNames - Permission names
 * @returns Middleware function
 *
 * @example
 * ```typescript
 * app.bind(
 *   viewContentContract,
 *   [authenticate, requireAnyPermission('content:read', 'admin:access')],
 *   async (c) => {
 *     // User has either content:read OR admin:access
 *   }
 * );
 * ```
 */
export function requireAnyPermission(...permissionNames: string[])
{
    return async (c: Context, next: Next): Promise<void> =>
    {
        const auth = getAuth(c);

        if (!auth)
        {
            throw new ForbiddenError('Authentication required');
        }

        const { userId } = auth;

        const allowed = await hasAnyPermission(userId, permissionNames);

        if (!allowed)
        {
            throw new ForbiddenError(
                `Requires one of: ${permissionNames.join(', ')}`
            );
        }

        await next();
    };
}