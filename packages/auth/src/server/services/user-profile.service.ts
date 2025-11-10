/**
 * @spfn/auth - User Profile Service
 *
 * Service for retrieving user profile information
 * Returns full user info with profile data
 */

import { fetchFullUser } from './shared/fetch-user';
import { fetchProfile } from './shared/fetch-profile';

export interface UserProfileResult {
    userId: string;
    email?: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    lastLoginAt?: string | null;
    createdAt: string;
    updatedAt: string;
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
}

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
export async function getUserProfileService(userId: string | number | bigint): Promise<UserProfileResult> {
    // Fetch user and profile in parallel
    const [user, profile] = await Promise.all([
        fetchFullUser(userId),
        fetchProfile(userId),
    ]);

    return {
        userId: user.userId,
        email: user.email,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        profile: profile,
    };
}