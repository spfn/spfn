/**
 * Social Accounts Repository
 *
 * OAuth 소셜 계정 데이터 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { eq, and } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core/db';

import { userSocialAccounts, NewUserSocialAccount } from '../entities';
import { type SocialProvider } from '../types';

/**
 * Social Accounts Repository 클래스
 */
export class SocialAccountsRepository extends BaseRepository
{
    /**
     * provider와 providerUserId로 소셜 계정 조회
     * Read replica 사용
     */
    async findByProviderAndProviderId(provider: SocialProvider, providerUserId: string)
    {
        const result = await this.readDb
            .select()
            .from(userSocialAccounts)
            .where(
                and(
                    eq(userSocialAccounts.provider, provider),
                    eq(userSocialAccounts.providerUserId, providerUserId)
                )
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * userId로 모든 소셜 계정 조회
     * Read replica 사용
     */
    async findByUserId(userId: number)
    {
        return await this.readDb
            .select()
            .from(userSocialAccounts)
            .where(eq(userSocialAccounts.userId, userId));
    }

    /**
     * userId와 provider로 소셜 계정 조회
     * Read replica 사용
     */
    async findByUserIdAndProvider(userId: number, provider: SocialProvider)
    {
        const result = await this.readDb
            .select()
            .from(userSocialAccounts)
            .where(
                and(
                    eq(userSocialAccounts.userId, userId),
                    eq(userSocialAccounts.provider, provider)
                )
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 소셜 계정 생성
     * Write primary 사용
     */
    async create(data: NewUserSocialAccount)
    {
        return await this._create(userSocialAccounts, {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    /**
     * 토큰 정보 업데이트
     * Write primary 사용
     */
    async updateTokens(
        id: number,
        data: {
            accessToken?: string | null;
            refreshToken?: string | null;
            tokenExpiresAt?: Date | null;
        }
    )
    {
        const result = await this.db
            .update(userSocialAccounts)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(userSocialAccounts.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * 소셜 계정 삭제
     * Write primary 사용
     */
    async deleteById(id: number)
    {
        const result = await this.db
            .delete(userSocialAccounts)
            .where(eq(userSocialAccounts.id, id))
            .returning();

        return result[0] ?? null;
    }

    /**
     * userId와 provider로 소셜 계정 삭제
     * Write primary 사용
     */
    async deleteByUserIdAndProvider(userId: number, provider: SocialProvider)
    {
        const result = await this.db
            .delete(userSocialAccounts)
            .where(
                and(
                    eq(userSocialAccounts.userId, userId),
                    eq(userSocialAccounts.provider, provider)
                )
            )
            .returning();

        return result[0] ?? null;
    }
}

// Default instance export
export const socialAccountsRepository = new SocialAccountsRepository();
