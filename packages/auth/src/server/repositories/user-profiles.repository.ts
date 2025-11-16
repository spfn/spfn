/**
 * User Profiles Repository
 *
 * 사용자 프로필 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { BaseRepository } from '@spfn/core/db';
import { eq } from 'drizzle-orm';
import { userProfiles, type UserProfile, type NewUserProfile } from '@/server/entities';

/**
 * User Profiles Repository 클래스
 */
export class UserProfilesRepository extends BaseRepository
{
    /**
     * ID로 프로필 조회
     */
    async findById(id: number): Promise<UserProfile | null>
    {
        const result = await this.readDb
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.id, id))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * User ID로 프로필 조회
     */
    async findByUserId(userId: number): Promise<UserProfile | null>
    {
        const result = await this.readDb
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.userId, userId))
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 프로필 생성
     */
    async create(data: NewUserProfile): Promise<UserProfile>
    {
        const result = await this.db
            .insert(userProfiles)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        return result[0];
    }

    /**
     * 프로필 업데이트 (by ID)
     */
    async updateById(id: number, data: Partial<NewUserProfile>): Promise<UserProfile | null>
    {
        const result = await this.db
            .update(userProfiles)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(userProfiles.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 프로필 업데이트 (by User ID)
     */
    async updateByUserId(userId: number, data: Partial<NewUserProfile>): Promise<UserProfile | null>
    {
        const result = await this.db
            .update(userProfiles)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(userProfiles.userId, userId))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 프로필 삭제 (by ID)
     */
    async deleteById(id: number): Promise<UserProfile | null>
    {
        const result = await this.db
            .delete(userProfiles)
            .where(eq(userProfiles.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 프로필 삭제 (by User ID)
     */
    async deleteByUserId(userId: number): Promise<UserProfile | null>
    {
        const result = await this.db
            .delete(userProfiles)
            .where(eq(userProfiles.userId, userId))
            .returning();

        return result[0] ?? null;
    }

    /**
     * User ID로 프로필 데이터 조회 (formatted)
     *
     * API 응답에 최적화된 형식으로 반환
     */
    async fetchProfileData(userId: number): Promise<{
        profileId: number;
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
    } | null>
    {
        const profile = await this.readDb
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
            .where(eq(userProfiles.userId, userId))
            .limit(1)
            .then(rows => rows[0] ?? null);

        if (!profile)
        {
            return null;
        }

        return {
            profileId: profile.profileId,
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
}

// Default instance export
export const userProfilesRepository = new UserProfilesRepository();