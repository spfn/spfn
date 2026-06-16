/**
 * Social Accounts Repository
 *
 * OAuth 소셜 계정 데이터 관리를 위한 Repository
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { eq, and } from 'drizzle-orm';
import { BaseRepository } from '@spfn/core/db';

import { userSocialAccounts, NewUserSocialAccount, UserSocialAccount } from '../entities';
import { type SocialProvider } from '../types';
import { encryptToken, decryptToken, isEncrypted } from '../lib/oauth/token-cipher';

/**
 * Social Accounts Repository 클래스
 */
export class SocialAccountsRepository extends BaseRepository
{
    /**
     * 저장 row 의 토큰을 평문으로 복호화해 반환한다.
     *
     * 레거시 평문(마커 없음)이 감지되면 즉시 재암호화해 저장하는
     * self-healing 마이그레이션을 수행한다. 호출자에게는 항상 평문이 반환되어
     * 외부 API 계약(평문 토큰)이 유지된다.
     */
    private async decryptAccount(account: UserSocialAccount | null)
    {
        if (!account)
        {
            return account;
        }

        const heal: { accessToken?: string; refreshToken?: string } = {};

        if (account.accessToken && !isEncrypted(account.accessToken))
        {
            heal.accessToken = encryptToken(account.accessToken);
        }

        if (account.refreshToken && !isEncrypted(account.refreshToken))
        {
            heal.refreshToken = encryptToken(account.refreshToken);
        }

        // self-healing 재암호화는 best-effort 다. OAuth 콜백은 Transactional 안에서
        // 돌기 때문에(readDb 가 tx=primary 로 귀결), 이 write 가 throw 하면 로그인
        // 트랜잭션 전체가 롤백된다. heal 실패가 read 흐름을 깨지 않도록 격리한다.
        // 전환을 놓쳐도 다음 updateTokens(토큰 refresh) 시 암호화되므로 결국 전환된다.
        if (heal.accessToken || heal.refreshToken)
        {
            try
            {
                await this.db
                    .update(userSocialAccounts)
                    .set(heal)
                    .where(eq(userSocialAccounts.id, account.id));
            }
            catch
            {
                // best-effort: 무시하고 read 결과 반환 진행
            }
        }

        return {
            ...account,
            accessToken: account.accessToken ? decryptToken(account.accessToken) : account.accessToken,
            refreshToken: account.refreshToken ? decryptToken(account.refreshToken) : account.refreshToken,
        };
    }

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
                    eq(userSocialAccounts.providerUserId, providerUserId),
                ),
            )
            .limit(1);

        return this.decryptAccount(result[0] ?? null);
    }

    /**
     * userId로 모든 소셜 계정 조회
     * Read replica 사용
     */
    async findByUserId(userId: number)
    {
        const result = await this.readDb
            .select()
            .from(userSocialAccounts)
            .where(eq(userSocialAccounts.userId, userId));

        return Promise.all(result.map(account => this.decryptAccount(account)));
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
                    eq(userSocialAccounts.provider, provider),
                ),
            )
            .limit(1);

        return this.decryptAccount(result[0] ?? null);
    }

    /**
     * 소셜 계정 생성
     * Write primary 사용
     */
    async create(data: NewUserSocialAccount)
    {
        const created = await this._create(userSocialAccounts, {
            ...data,
            accessToken: data.accessToken ? encryptToken(data.accessToken) : data.accessToken,
            refreshToken: data.refreshToken ? encryptToken(data.refreshToken) : data.refreshToken,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // repo 외부 계약을 "토큰은 항상 평문"으로 통일 (read/update 경로와 일관)
        return this.decryptAccount(created);
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
        },
    )
    {
        const result = await this.db
            .update(userSocialAccounts)
            .set({
                ...data,
                accessToken: data.accessToken ? encryptToken(data.accessToken) : data.accessToken,
                refreshToken: data.refreshToken ? encryptToken(data.refreshToken) : data.refreshToken,
                updatedAt: new Date(),
            })
            .where(eq(userSocialAccounts.id, id))
            .returning();

        return this.decryptAccount(result[0] ?? null);
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
                    eq(userSocialAccounts.provider, provider),
                ),
            )
            .returning();

        return result[0] ?? null;
    }
}

// Default instance export
export const socialAccountsRepository = new SocialAccountsRepository();
