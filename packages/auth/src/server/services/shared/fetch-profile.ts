/**
 * @spfn/auth - Fetch Profile Utility
 *
 * Common utility for fetching user profile data
 */

import { getDatabase } from '@spfn/core/db';
import { userProfiles } from '@/server/entities';
import { eq } from 'drizzle-orm';

export interface ProfileData {
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
}

/**
 * Fetch user profile data
 * Returns null if profile doesn't exist
 */
export async function fetchProfile(userId: string | number | bigint): Promise<ProfileData | null>
{
    const db = getDatabase('read');

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    const [profile] = await db
        .select({
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
            createdAt: userProfiles.createdAt,
            updatedAt: userProfiles.updatedAt,
        })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userIdNum))
        .limit(1);

    if (!profile) {
        return null;
    }

    return {
        profileId: profile.profileId.toString(),
        displayName: profile.displayName,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatarUrl: profile.avatarUrl,
        bio: profile.bio,
        locale: profile.locale || 'en',
        timezone: profile.timezone || 'UTC',
        website: profile.website,
        location: profile.location,
        company: profile.company,
        jobTitle: profile.jobTitle,
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
    };
}