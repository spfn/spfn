/**
 * @spfn/auth - User Profile Service
 *
 * Service for retrieving user profile information
 * Returns full user info with profile data
 */

import { UserProfileResponse } from "@/lib/contracts/schemas/user-profile-response";
import { usersRepository, userProfilesRepository } from '@/server/repositories';

/**
 * Get user profile information
 *
 * @param userId - User ID (string, number, or bigint)
 * @returns User profile data with profile nested
 *
 * @example
 * ```typescript
 * const data = await getUserProfileService('123');
 * console.log(data.email); // 'user@example.com'
 * console.log(data.profile?.displayName); // 'John Doe'
 * console.log(data.lastLoginAt); // '2024-01-01T00:00:00.000Z'
 * ```
 */
export async function getUserProfileService(userId: string | number | bigint): Promise<UserProfileResponse>
{
    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    // Fetch user and profile in parallel
    const [user, profile] = await Promise.all([
        usersRepository.fetchFullUserData(userIdNum),
        userProfilesRepository.fetchProfileData(userIdNum),
    ]);

    return {
        userId: user.userId,
        email: user.email,
        emailVerified: user.isEmailVerified,
        phoneVerified: user.isPhoneVerified,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profile: profile,
    };
}