/**
 * CMS Draft Cache Repository
 *
 * 관리자별 초안 캐시 관리 (동시 편집 지원)
 */

import { findOne, findMany, deleteOne, deleteMany, upsert as upsertHelper } from '@spfn/core/db';
import { eq, and, lt } from 'drizzle-orm';
import { cmsDraftCache, type NewCmsDraftCache } from '../entities';

/**
 * 섹션 + 언어 + 사용자로 초안 캐시 조회
 */
export async function findByUser(section: string, locale: string, userId: string)
{
    return findOne(
        cmsDraftCache,
        and(
            eq(cmsDraftCache.section, section),
            eq(cmsDraftCache.locale, locale),
            eq(cmsDraftCache.userId, userId)
        )
    );
}

/**
 * 초안 캐시 생성 또는 업데이트 (UPSERT)
 */
export async function upsert(data: NewCmsDraftCache)
{
    return upsertHelper(cmsDraftCache, data, {
        target: [cmsDraftCache.section, cmsDraftCache.locale, cmsDraftCache.userId],
        set: {
            content: data.content,
            updatedAt: new Date(),
        }
    });
}

/**
 * 특정 사용자의 모든 초안 조회
 */
export async function findAllByUser(userId: string)
{
    return findMany(cmsDraftCache, {
        where: eq(cmsDraftCache.userId, userId)
    });
}

/**
 * 초안 삭제
 */
export async function deleteByUser(section: string, locale: string, userId: string)
{
    await deleteOne(
        cmsDraftCache,
        and(
            eq(cmsDraftCache.section, section),
            eq(cmsDraftCache.locale, locale),
            eq(cmsDraftCache.userId, userId)
        )
    );
}

/**
 * 오래된 초안 정리 (30일 이상 미사용)
 */
export async function cleanupOldDrafts(daysOld: number = 30)
{
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return deleteMany(
        cmsDraftCache,
        lt(cmsDraftCache.updatedAt, cutoffDate)
    );
}

export const cmsDraftCacheRepository = {
    findByUser,
    upsert,
    findAllByUser,
    deleteByUser,
    cleanupOldDrafts,
};