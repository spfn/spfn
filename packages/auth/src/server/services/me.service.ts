/**
 * @spfn/auth - Me Service
 *
 * Service for retrieving current user account information
 */

import { getDatabase } from '@spfn/core/db';
import { users, userProfiles, roles, permissions, rolePermissions } from '@/server/entities';
import { eq, and } from 'drizzle-orm';

export interface GetMeResult
{
    user: {
        userId: string;
        email?: string | null;
        emailVerified: boolean;
        phoneVerified: boolean;
        lastLoginAt?: string | null;
        createdAt: string;
        updatedAt: string;
    };
    profile?: {
        profileId: string;
        displayName: string;
        firstName?: string | null;
        lastName?: string | null;
        avatarUrl?: string | null;
        bio?: string | null;
        locale: string;
        timezone: string;
        website?: string | null;
        location?: string | null;
        company?: string | null;
        jobTitle?: string | null;
        createdAt: string;
        updatedAt: string;
    } | null;
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
 * Get current user account information including profile, role and permissions
 *
 * @param userId - User ID (string, number, or bigint)
 * @returns Complete account info (User + Profile + Role + Permissions)
 *
 * @example
 * ```typescript
 * const account = await getMeService('123');
 * console.log(account.user.email); // 'user@example.com'
 * console.log(account.profile?.displayName); // 'John Doe'
 * console.log(account.role.name); // 'admin'
 * console.log(account.permissions.length); // 15
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

    // 1. Get user with role and profile information
    const [result] = await db
        .select({
            // User fields (excluding sensitive info: phone, status, passwordChangeRequired, roleId)
            userId: users.id,
            email: users.email,
            emailVerifiedAt: users.emailVerifiedAt,
            phoneVerifiedAt: users.phoneVerifiedAt,
            lastLoginAt: users.lastLoginAt,
            userCreatedAt: users.createdAt,
            userUpdatedAt: users.updatedAt,
            // Role fields
            roleId: roles.id,
            roleName: roles.name,
            roleDisplayName: roles.displayName,
            rolePriority: roles.priority,
            // Profile fields (excluding sensitive info: dateOfBirth, gender)
            profileId: userProfiles.id,
            displayName: userProfiles.displayName,
            firstName: userProfiles.firstName,
            lastName: userProfiles.lastName,
            avatarUrl: userProfiles.avatarUrl,
            bio: userProfiles.bio,
            locale: userProfiles.locale,
            timezone: userProfiles.timezone,
            website: userProfiles.website,
            location: userProfiles.location,
            company: userProfiles.company,
            jobTitle: userProfiles.jobTitle,
            profileCreatedAt: userProfiles.createdAt,
            profileUpdatedAt: userProfiles.updatedAt,
        })
        .from(users)
        .innerJoin(roles, eq(users.roleId, roles.id))
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(eq(users.id, userIdNum))
        .limit(1);

    if (!result)
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
                eq(rolePermissions.roleId, result.roleId),
                eq(permissions.isActive, true)
            )
        );

    // 3. Build Account response
    return {
        user: {
            userId: result.userId.toString(),
            email: result.email,
            emailVerified: !!result.emailVerifiedAt,
            phoneVerified: !!result.phoneVerifiedAt,
            lastLoginAt: result.lastLoginAt?.toISOString() ?? null,
            createdAt: result.userCreatedAt.toISOString(),
            updatedAt: result.userUpdatedAt.toISOString(),
        },
        profile: result.profileId ? {
            profileId: result.profileId.toString(),
            displayName: result.displayName!,
            firstName: result.firstName,
            lastName: result.lastName,
            avatarUrl: result.avatarUrl,
            bio: result.bio,
            locale: result.locale!,
            timezone: result.timezone!,
            website: result.website,
            location: result.location,
            company: result.company,
            jobTitle: result.jobTitle,
            createdAt: result.profileCreatedAt!.toISOString(),
            updatedAt: result.profileUpdatedAt!.toISOString(),
        } : null,
        role: {
            id: result.roleId,
            name: result.roleName,
            displayName: result.roleDisplayName,
            priority: result.rolePriority,
        },
        permissions: rolePerms.map(perm => ({
            id: perm.id,
            name: perm.name,
            displayName: perm.displayName,
            category: perm.category ?? undefined,
        })),
    };
}