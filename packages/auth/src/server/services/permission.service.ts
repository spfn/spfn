/**
 * @spfn/auth - Permission Service
 *
 * Permission checking and validation logic
 */

import {
    usersRepository,
    rolesRepository,
    permissionsRepository,
    rolePermissionsRepository,
    userPermissionsRepository,
} from '../repositories';

/**
 * Get all permissions for a user
 *
 * Combines role-based permissions with user-specific overrides
 * Handles expiration of temporary permissions
 *
 * @param userId - User ID (string, number, or bigint)
 * @returns Array of permission names
 *
 * @example
 * ```typescript
 * const perms = await getUserPermissions('123');
 * // ['auth:self:manage', 'user:read', 'post:create']
 * ```
 */
export async function getUserPermissions(userId: string | number | bigint): Promise<string[]>
{
    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    // 1. Get user's role
    const user = await usersRepository.findById(userIdNum);

    if (!user || !user.roleId)
    {
        return [];
    }

    const permSet = new Set<string>();

    // 2. Get role-based permissions
    const rolePermMappings = await rolePermissionsRepository.findByRoleId(user.roleId);
    const permIds = rolePermMappings.map(rp => rp.permissionId);

    if (permIds.length > 0)
    {
        const rolePerms = await Promise.all(
            permIds.map(id => permissionsRepository.findById(id))
        );

        for (const perm of rolePerms)
        {
            if (perm && perm.isActive)
            {
                permSet.add(perm.name);
            }
        }
    }

    // 3. Apply user-specific permission overrides
    const userPermMappings = await userPermissionsRepository.findValidByUserId(userIdNum);

    for (const userPermMapping of userPermMappings)
    {
        const perm = await permissionsRepository.findById(userPermMapping.permissionId);
        if (!perm) continue;

        if (userPermMapping.granted)
        {
            // Grant permission (add even if not in role)
            permSet.add(perm.name);
        }
        else
        {
            // Revoke permission (remove even if in role)
            permSet.delete(perm.name);
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
    userId: string | number | bigint,
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
    userId: string | number | bigint,
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
    userId: string | number | bigint,
    permissionNames: string[]
): Promise<boolean>
{
    const perms = await getUserPermissions(userId);
    return permissionNames.every(p => perms.includes(p));
}

/**
 * Get user's role name
 *
 * @param userId - User ID
 * @returns Role name or null if user has no role
 *
 * @example
 * ```typescript
 * const role = await getUserRole('123');
 * // 'admin' or null
 * ```
 */
export async function getUserRole(userId: string | number | bigint): Promise<string | null>
{
    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    const user = await usersRepository.findById(userIdNum);

    if (!user || !user.roleId)
    {
        return null;
    }

    const role = await rolesRepository.findById(user.roleId);

    return role?.name || null;
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
export async function hasRole(userId: string | number | bigint, roleName: string): Promise<boolean>
{
    const role = await getUserRole(userId);
    return role === roleName;
}

/**
 * Check if user has any of the specified roles
 *
 * @param userId - User ID
 * @param roleNames - Array of role names
 * @returns true if user has at least one role
 */
export async function hasAnyRole(userId: string | number | bigint, roleNames: string[]): Promise<boolean>
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