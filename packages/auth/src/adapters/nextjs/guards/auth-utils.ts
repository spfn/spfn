/**
 * Server-side auth utilities for guards
 *
 * Uses API to check permissions in real-time
 */

import { getAuthSession } from '@/lib/api/auth-session';

/**
 * Get current auth session with roles and permissions via API
 */
async function getAuthSessionData()
{
    try
    {
        const result = await getAuthSession();
        if (!result.success)
        {
            return null;
        }

        return result.data;
    }
    catch (error)
    {
        console.error('[Auth Utils] Failed to get auth session:', error);
        return null;
    }
}

/**
 * Get user role
 */
export async function getUserRole(): Promise<string | null>
{
    const session = await getAuthSessionData();
    return session?.role.name || null;
}

/**
 * Get user permissions
 */
export async function getUserPermissions(): Promise<string[]>
{
    const session = await getAuthSessionData();

    if (!session)
    {
        return [];
    }

    return session.permissions.map(p => p.name);
}

/**
 * Check if user has any of the specified roles
 */
export async function hasAnyRole(requiredRoles: string[]): Promise<boolean>
{
    const session = await getAuthSessionData();

    if (!session)
    {
        return false;
    }

    return requiredRoles.includes(session.role.name);
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(requiredPermissions: string[]): Promise<boolean>
{
    const session = await getAuthSessionData();

    if (!session)
    {
        return false;
    }

    const userPermissionNames = session.permissions.map(p => p.name);
    return requiredPermissions.some(permission => userPermissionNames.includes(permission));
}