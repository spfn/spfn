/**
 * Server-side auth utilities for guards
 *
 * Uses direct API calls to check permissions in real-time
 */

import { COOKIE_NAMES } from '@/server/lib/config';
import { generateClientToken } from '@/server/lib/crypto';
import { unsealSession } from '@/server/lib/session';
import { env } from '@/config';
import { cookies } from 'next/headers';

/**
 * Get SPFN API URL from environment
 */
function getApiUrl(): string
{
    return env.SPFN_API_URL || 'http://localhost:8790';
}

/**
 * Get current auth session with roles and permissions via API
 */
async function getAuthSessionData()
{
    try
    {
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get(COOKIE_NAMES.SESSION);

        if (!sessionCookie)
        {
            return null;
        }

        // Decrypt session to get userId and privateKey
        const session = await unsealSession(sessionCookie.value);

        // Generate JWT token for authentication
        const token = generateClientToken(
            {
                userId: session.userId,
                keyId: session.keyId,
                timestamp: Date.now(),
            },
            session.privateKey,
            session.algorithm,
            { expiresIn: '15m' }
        );

        // Call SPFN backend directly
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/_auth/session`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Key-Id': session.keyId,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok)
        {
            console.error('[Auth Utils] Failed to get auth session:', response.status);
            return null;
        }

        const result = await response.json();

        // Handle both ApiSuccessResponse format and direct data format
        return result.success ? result.data : result;
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