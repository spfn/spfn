/**
 * Server-side auth utilities for guards
 *
 * Uses authApi to check permissions in real-time
 */

import { authApi } from '@spfn/auth';
import { authLogger } from '@spfn/auth/server';

/**
 * Get current auth session with roles and permissions via API
 */
export async function getAuthSessionData()
{
    try
    {
        const session = await authApi.getAuthSession.call();
        authLogger.middleware.debug('Auth session retrieved', { name: session.role?.name });

        return session;
    }
    catch (error)
    {
        authLogger.middleware.error('Failed to get auth session', { error });
        return null;
    }
}

/**
 * Get user role
 */
export async function getUserRole(): Promise<string | null>
{
    const session = await getAuthSessionData();
    return session?.role?.name || null;
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

    return session.permissions?.map((p: any) => p.name) || [];
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

    return requiredRoles.includes(session.role?.name);
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

    const userPermissionNames = session.permissions?.map((p: any) => p.name) || [];
    return requiredPermissions.some(permission => userPermissionNames.includes(permission));
}
