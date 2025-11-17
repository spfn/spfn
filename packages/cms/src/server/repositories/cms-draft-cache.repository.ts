/**
 * CMS Draft Cache Repository
 *
 * 관리자별 초안 캐시 관리 (동시 편집 지원)
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { BaseRepository } from '@spfn/core/db';
import { eq, and, lt } from 'drizzle-orm';
import { cmsDraftCache, type CmsDraftCache, type NewCmsDraftCache } from '@/server/entities/config';

/**
 * CMS Draft Cache Repository 클래스
 */
export class CmsDraftCacheRepository extends BaseRepository
{
    /**
     * 섹션 + 언어 + 사용자로 초안 캐시 조회
     * Read replica 사용
     */
    async findByUser(section: string, locale: string, userId: string): Promise<CmsDraftCache | null>
    {
        const result = await this.readDb
            .select()
            .from(cmsDraftCache)
            .where(
                and(
                    eq(cmsDraftCache.section, section),
                    eq(cmsDraftCache.locale, locale),
                    eq(cmsDraftCache.userId, userId)
                )
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 초안 캐시 생성 또는 업데이트 (UPSERT)
     * Write primary 사용
     */
    async upsert(data: NewCmsDraftCache): Promise<CmsDraftCache>
    {
        const result = await this.db
            .insert(cmsDraftCache)
            .values(data)
            .onConflictDoUpdate({
                target: [cmsDraftCache.section, cmsDraftCache.locale, cmsDraftCache.userId],
                set: {
                    content: data.content,
                    updatedAt: new Date(),
                }
            })
            .returning();

        return result[0];
    }

    /**
     * 특정 사용자의 모든 초안 조회
     * Read replica 사용
     */
    async findAllByUser(userId: string): Promise<CmsDraftCache[]>
    {
        return this.readDb
            .select()
            .from(cmsDraftCache)
            .where(eq(cmsDraftCache.userId, userId));
    }

    /**
     * 초안 삭제
     * Write primary 사용
     */
    async deleteByUser(section: string, locale: string, userId: string): Promise<void>
    {
        await this.db
            .delete(cmsDraftCache)
            .where(
                and(
                    eq(cmsDraftCache.section, section),
                    eq(cmsDraftCache.locale, locale),
                    eq(cmsDraftCache.userId, userId)
                )
            );
    }

    /**
     * 오래된 초안 정리 (30일 이상 미사용)
     * Write primary 사용
     */
    async cleanupOldDrafts(daysOld: number = 30): Promise<CmsDraftCache[]>
    {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        return this.db
            .delete(cmsDraftCache)
            .where(lt(cmsDraftCache.updatedAt, cutoffDate))
            .returning();
    }
}

// Default instance export
export const cmsDraftCacheRepository = new CmsDraftCacheRepository();