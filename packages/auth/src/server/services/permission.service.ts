/**
 * @spfn/auth - Permission Service
 *
 * Permission checking and validation logic
 */

import { getDatabase } from '@spfn/core/db';
import { users, roles, permissions, rolePermissions, userPermissions } from '@/server/entities';
import { eq, and } from 'drizzle-orm';

/**
 * Get all permissions for a user
 *
 * Combines role-based permissions with user-specific overrides
 * Handles expiration of temporary permissions
 *
 * @param userId - User ID (string or bigint)
 * @returns Array of permission names
 *
 * @example
 * ```typescript
 * const perms = await getUserPermissions('123');
 * // ['auth:self:manage', 'user:read', 'post:create']
 * ```
 */
export async function getUserPermissions(userId: string | bigint): Promise<string[]>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    // 1. Get user's role
    const [user] = await db
        .select({ roleId: users.roleId })
        .from(users)
        .where(eq(users.id, userIdNum))
        .limit(1);

    if (!user || !user.roleId)
    {
        return [];
    }

    const permSet = new Set<string>();

    // 2. Get role-based permissions
    const rolePerms = await db
        .select({ name: permissions.name })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(
            and(
                eq(rolePermissions.roleId, user.roleId),
                eq(permissions.isActive, true)
            )
        );

    for (const perm of rolePerms)
    {
        permSet.add(perm.name);
    }

    // 3. Apply user-specific permission overrides
    const userPerms = await db
        .select({
            name: permissions.name,
            granted: userPermissions.granted,
            expiresAt: userPermissions.expiresAt,
        })
        .from(userPermissions)
        .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
        .where(eq(userPermissions.userId, userIdNum));

    const now = new Date();
    for (const userPerm of userPerms)
    {
        // Skip expired permissions
        if (userPerm.expiresAt && userPerm.expiresAt < now)
        {
            continue;
        }

        if (userPerm.granted)
        {
            // Grant permission (add even if not in role)
            permSet.add(userPerm.name);
        }
        else
        {
            // Revoke permission (remove even if in role)
            permSet.delete(userPerm.name);
        }
    }

    return Array.from(permSet);
}

/**
 * Check if user has a specific permission
 *
 * @param userId - User ID
 * @param permissionName - Permission name (e.g., 'user:delete')
 * @returns true if user has permission
 *
 * @example
 * ```typescript
 * if (await hasPermission('123', 'user:delete')) {
 *   // User can delete users
 * }
 * ```
 */
export async function hasPermission(
    userId: string | bigint,
    permissionName: string
): Promise<boolean>
{
    const perms = await getUserPermissions(userId);
    return perms.includes(permissionName);
}

/**
 * Check if user has any of the specified permissions
 *
 * @param userId - User ID
 * @param permissionNames - Array of permission names
 * @returns true if user has at least one permission
 *
 * @example
 * ```typescript
 * if (await hasAnyPermission('123', ['post:read', 'admin:access'])) {
 *   // User can access content
 * }
 * ```
 */
export async function hasAnyPermission(
    userId: string | bigint,
    permissionNames: string[]
): Promise<boolean>
{
    const perms = await getUserPermissions(userId);
    return permissionNames.some(p => perms.includes(p));
}

/**
 * Check if user has all of the specified permissions
 *
 * @param userId - User ID
 * @param permissionNames - Array of permission names
 * @returns true if user has all permissions
 *
 * @example
 * ```typescript
 * if (await hasAllPermissions('123', ['post:write', 'post:publish'])) {
 *   // User can write AND publish
 * }
 * ```
 */
export async function hasAllPermissions(
    userId: string | bigint,
    permissionNames: string[]
): Promise<boolean>
{
    const perms = await getUserPermissions(userId);
    return permissionNames.every(p => perms.includes(p));
}

/**
 * Check if user has a specific role
 *
 * @param userId - User ID
 * @param roleName - Role name (e.g., 'admin', 'superadmin')
 * @returns true if user has role
 *
 * @example
 * ```typescript
 * if (await hasRole('123', 'admin')) {
 *   // User is admin
 * }
 * ```
 */
export async function hasRole(userId: string | bigint, roleName: string): Promise<boolean>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    const [user] = await db
        .select({ roleId: users.roleId })
        .from(users)
        .where(eq(users.id, userIdNum))
        .limit(1);

    if (!user || !user.roleId)
    {
        return false;
    }

    const [role] = await db
        .select({ name: roles.name })
        .from(roles)
        .where(eq(roles.id, user.roleId))
        .limit(1);

    return role?.name === roleName;
}

/**
 * Check if user has any of the specified roles
 *
 * @param userId - User ID
 * @param roleNames - Array of role names
 * @returns true if user has at least one role
 */
export async function hasAnyRole(userId: string | bigint, roleNames: string[]): Promise<boolean>
{
    for (const roleName of roleNames)
    {
        if (await hasRole(userId, roleName))
        {
            return true;
        }
    }

    return false;
}