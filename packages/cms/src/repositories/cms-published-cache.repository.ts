/**
 * CMS Published Cache Repository
 *
 * 발행된 콘텐츠 캐시 관리 (초고속 조회)
 */

import { findOne, findMany, deleteOne, deleteMany, upsert as upsertHelper } from '@spfn/core/db';
import { eq, and, sql } from 'drizzle-orm';
import { cmsPublishedCache, type NewCmsPublishedCache } from '../entities';

/**
 * 섹션 + 언어로 발행된 캐시 조회
 */
export async function findBySection(section: string, locale: string = 'ko')
{
    return findOne(
        cmsPublishedCache,
        and(
            eq(cmsPublishedCache.section, section),
            eq(cmsPublishedCache.locale, locale)
        )
    );
}

/**
 * 캐시 생성 또는 업데이트 (UPSERT)
 */
export async function upsert(data: NewCmsPublishedCache)
{
    return upsertHelper(cmsPublishedCache, data, {
        target: [cmsPublishedCache.section, cmsPublishedCache.locale],
        set: {
            content: data.content,
            publishedAt: data.publishedAt,
            publishedBy: data.publishedBy,
            version: sql`${cmsPublishedCache.version} + 1`, // 버전 증가로 클라이언트 캐시 무효화
        }
    });
}

/**
 * 섹션별 모든 언어 캐시 조회
 */
export async function findAllLanguages(section: string)
{
    return findMany(cmsPublishedCache, {
        where: eq(cmsPublishedCache.section, section)
    });
}

/**
 * 캐시 삭제
 */
export async function deleteBySection(section: string, locale?: string)
{
    if (locale)
    {
        await deleteOne(
            cmsPublishedCache,
            and(
                eq(cmsPublishedCache.section, section),
                eq(cmsPublishedCache.locale, locale)
            )
        );
    }
    else
    {
        await deleteMany(
            cmsPublishedCache,
            eq(cmsPublishedCache.section, section)
        );
    }
}

export const cmsPublishedCacheRepository = {
    findBySection,
    upsert,
    findAllLanguages,
    deleteBySection,
};