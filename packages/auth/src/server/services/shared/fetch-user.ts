/**
 * @spfn/auth - Fetch User Utility
 *
 * Common utility for fetching user data
 */

import { getDatabase } from '@spfn/core/db';
import { users } from '@/server/entities';
import { eq } from 'drizzle-orm';

export interface MinimalUserData {
    userId: string;
    email?: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
}

export interface FullUserData extends MinimalUserData {
    lastLoginAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * Fetch minimal user data (for auth session)
 */
export async function fetchMinimalUser(userId: string | number | bigint): Promise<MinimalUserData>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    const [user] = await db
        .select({
            userId: users.id,
            email: users.email,
            emailVerifiedAt: users.emailVerifiedAt,
            phoneVerifiedAt: users.phoneVerifiedAt,
        })
        .from(users)
        .where(eq(users.id, userIdNum))
        .limit(1);

    if (!user)
    {
        throw new Error('[Auth] User not found');
    }

    return {
        userId: user.userId.toString(),
        email: user.email,
        emailVerified: !!user.emailVerifiedAt,
        phoneVerified: !!user.phoneVerifiedAt,
    };
}

/**
 * Fetch full user data (for user profile)
 */
export async function fetchFullUser(userId: string | number | bigint): Promise<FullUserData>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const userIdNum = typeof userId === 'string' ? Number(userId) : Number(userId);

    const [user] = await db
        .select({
            userId: users.id,
            email: users.email,
            emailVerifiedAt: users.emailVerifiedAt,
            phoneVerifiedAt: users.phoneVerifiedAt,
            lastLoginAt: users.lastLoginAt,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, userIdNum))
        .limit(1);

    if (!user)
    {
        throw new Error('[Auth] User not found');
    }

    return {
        userId: user.userId.toString(),
        email: user.email,
        emailVerified: !!user.emailVerifiedAt,
        phoneVerified: !!user.phoneVerifiedAt,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
    };
}