/**
 * @spfn/auth - Auth Session Service
 *
 * Service for retrieving authentication session information
 * Returns minimal user info with role and permissions
 */
import { usersRepository } from '../repositories';

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
export async function getAuthSessionService(userId: string | number | bigint)
{
    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    // Fetch user and role/permissions in parallel
    const [user, roleAndPerms] = await Promise.all([
        usersRepository.fetchMinimalUserData(userIdNum),
        usersRepository.fetchUserRoleAndPermissions(userIdNum),
    ]);

    return {
        userId: user.userId,
        publicId: user.publicId,
        email: user.email,
        emailVerified: user.isEmailVerified,
        phoneVerified: user.isPhoneVerified,
        ...roleAndPerms,
    };
}