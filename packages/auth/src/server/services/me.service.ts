/**
 * @spfn/auth - Me Service
 *
 * Service for retrieving current user information
 */

import { getDatabase } from '@spfn/core/db';
import { users, roles, permissions, rolePermissions } from '@/server/entities';
import { eq, and } from 'drizzle-orm';

export interface GetMeResult
{
    userId: string;
    email?: string;
    phone?: string;
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
 * Get current user information including role and permissions
 *
 * @param userId - User ID (string, number, or bigint)
 * @returns User info with role and permissions
 *
 * @example
 * ```typescript
 * const userInfo = await getMeService('123');
 * console.log(userInfo.role.name); // 'admin'
 * console.log(userInfo.permissions.length); // 15
 * ```
 */
export async function getMeService(userId: string | number | bigint): Promise<GetMeResult>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    // 1. Get user with role information
    const [userWithRole] = await db
        .select({
            userId: users.id,
            email: users.email,
            phone: users.phone,
            roleId: roles.id,
            roleName: roles.name,
            roleDisplayName: roles.displayName,
            rolePriority: roles.priority,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .where(eq(users.id, userIdNum))
        .limit(1);

    if (!userWithRole)
    {
        throw new Error('[Auth] User not found');
    }

    // 2. Get role permissions
    const rolePerms = await db
        .select({
            id: permissions.id,
            name: permissions.name,
            displayName: permissions.displayName,
            category: permissions.category,
        })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(
            and(
                eq(rolePermissions.roleId, userWithRole.roleId),
                eq(permissions.isActive, true)
            )
        );

    // 3. Build response
    return {
        userId: userWithRole.userId.toString(),
        email: userWithRole.email ?? undefined,
        phone: userWithRole.phone ?? undefined,
        role: {
            id: userWithRole.roleId,
            name: userWithRole.roleName,
            displayName: userWithRole.roleDisplayName,
            priority: userWithRole.rolePriority,
        },
        permissions: rolePerms.map(perm => ({
            id: perm.id,
            name: perm.name,
            displayName: perm.displayName,
            category: perm.category ?? undefined,
        })),
    };
}