/**
 * @spfn/auth - Auth Session Service
 *
 * Service for retrieving authentication session information
 * Returns minimal user info with role and permissions
 */

import { fetchMinimalUser } from './shared/fetch-user';
import { fetchRoleAndPermissions } from '@/server/services/shared';

export interface AuthSessionResult {
    userId: string;
    email?: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    role: {
        id: number;
        name: string;
        displayName: string;
        priority: number;
    };
    permissions: Array<{
        id: number;
        name: string;
        displayName: string;
        category?: string;
    }>;
}

/**
 * Get authentication session information
 *
 * @param userId - User ID (string, number, or bigint)
 * @returns Auth session data (minimal user info + role + permissions)
 *
 * @example
 * ```typescript
 * const session = await getAuthSessionService('123');
 * console.log(session.userId); // '123'
 * console.log(session.role.name); // 'admin'
 * console.log(session.permissions.length); // 15
 * ```
 */
export async function getAuthSessionService(userId: string | number | bigint): Promise<AuthSessionResult>
{
    // Fetch user and role/permissions in parallel
    const [user, roleAndPerms] = await Promise.all([
        fetchMinimalUser(userId),
        fetchRoleAndPermissions(userId),
    ]);

    return {
        userId: user.userId,
        email: user.email,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        role: roleAndPerms.role,
        permissions: roleAndPerms.permissions,
    };
}