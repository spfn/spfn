/**
 * Server-side auth utilities for guards
 *
 * Uses API to check permissions in real-time
 */

import { getMe } from '@/lib/api/auth-me';

/**
 * Get current user info with roles and permissions via API
 */
async function getCurrentUserInfo()
{
    try
    {
        const result = await getMe({ body: {} });

        if (!result.success)
        {
            return null;
        }

        return result.data;
    }
    catch (error)
    {
        console.error('[Auth Utils] Failed to get user info:', error);
        return null;
    }
}

/**
 * Get user role
 */
export async function getUserRole(): Promise<string | null>
{
    const userInfo = await getCurrentUserInfo();
    return userInfo?.role.name || null;
}

/**
 * Get user permissions
 */
export async function getUserPermissions(): Promise<string[]>
{
    const userInfo = await getCurrentUserInfo();

    if (!userInfo)
    {
        return [];
    }

    return userInfo.permissions.map(p => p.name);
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(requiredRoles: string[]): Promise<boolean>
{
    const userInfo = await getCurrentUserInfo();

    if (!userInfo)
    {
        return false;
    }

    return requiredRoles.includes(userInfo.role.name);
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(requiredPermissions: string[]): Promise<boolean>
{
    const userInfo = await getCurrentUserInfo();

    if (!userInfo)
    {
        return false;
    }

    const userPermissionNames = userInfo.permissions.map(p => p.name);
    return requiredPermissions.some(permission => userPermissionNames.includes(permission));
}