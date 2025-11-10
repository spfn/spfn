/**
 * @spfn/auth - Fetch Role & Permissions Utility
 *
 * Common utility for fetching role and permissions data
 */

import { getDatabase } from '@spfn/core/db';
import { users, roles, permissions, rolePermissions } from '@/server/entities';
import { eq, and } from 'drizzle-orm';

export interface RoleData {
    id: number;
    name: string;
    displayName: string;
    priority: number;
}

export interface PermissionData {
    id: number;
    name: string;
    displayName: string;
    category?: string;
}

export interface RoleAndPermissions {
    role: RoleData;
    permissions: PermissionData[];
}

/**
 * Fetch role and permissions for a user
 */
export async function fetchRoleAndPermissions(userId: string | number | bigint): Promise<RoleAndPermissions>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    // 1. Get user's role
    const [userWithRole] = await db
        .select({
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
        throw new Error('[Auth] User or role not found');
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

    return {
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