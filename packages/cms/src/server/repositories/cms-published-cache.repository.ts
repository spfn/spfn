/**
 * CMS Published Cache Repository
 *
 * 발행된 콘텐츠 캐시 관리 (초고속 조회)
 * BaseRepository를 상속받아 자동 트랜잭션 컨텍스트 지원 및 Read/Write 분리
 */

import { BaseRepository } from '@spfn/core/db';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { cmsPublishedCache, type CmsPublishedCache, type NewCmsPublishedCache } from '../entities';

/**
 * CMS Published Cache Repository 클래스
 */
export class CmsPublishedCacheRepository extends BaseRepository
{
    /**
     * 섹션 + 언어로 발행된 캐시 조회
     * Read replica 사용
     */
    async findBySection(section: string, locale: string = 'en'): Promise<CmsPublishedCache | null>
    {
        const result = await this.readDb
            .select()
            .from(cmsPublishedCache)
            .where(
                and(
                    eq(cmsPublishedCache.section, section),
                    eq(cmsPublishedCache.locale, locale)
                )
            )
            .limit(1);

        return result[0] ?? null;
    }

    /**
     * 캐시 생성 또는 업데이트 (UPSERT)
     * Write primary 사용
     */
    async upsert(data: NewCmsPublishedCache): Promise<CmsPublishedCache>
    {
        const result = await this.db
            .insert(cmsPublishedCache)
            .values(data)
            .onConflictDoUpdate({
                target: [cmsPublishedCache.section, cmsPublishedCache.locale],
                set: {
                    content: data.content,
                    publishedAt: data.publishedAt,
                    publishedBy: data.publishedBy,
                    version: sql`${cmsPublishedCache.version} + 1`, // 버전 증가로 클라이언트 캐시 무효화
                }
            })
            .returning();

        return result[0];
    }

    /**
     * 여러 섹션의 캐시를 한 번에 조회 (N+1 방지)
     * Read replica 사용
     */
    async findBySections(sections: string[], locale: string = 'en'): Promise<CmsPublishedCache[]>
    {
        if (sections.length === 0)
        {
            return [];
        }

        return this.readDb
            .select()
            .from(cmsPublishedCache)
            .where(
                and(
                    inArray(cmsPublishedCache.section, sections),
                    eq(cmsPublishedCache.locale, locale)
                )
            );
    }

    /**
     * 섹션별 모든 언어 캐시 조회
     * Read replica 사용
     */
    async findAllLanguages(section: string): Promise<CmsPublishedCache[]>
    {
        return this.readDb
            .select()
            .from(cmsPublishedCache)
            .where(eq(cmsPublishedCache.section, section));
    }

    /**
     * 캐시 삭제
     * Write primary 사용
     */
    async deleteBySection(section: string, locale?: string): Promise<void>
    {
        if (locale)
        {
            await this.db
                .delete(cmsPublishedCache)
                .where(
                    and(
                        eq(cmsPublishedCache.section, section),
                        eq(cmsPublishedCache.locale, locale)
                    )
                );
        }
        else
        {
            await this.db
                .delete(cmsPublishedCache)
                .where(eq(cmsPublishedCache.section, section));
        }
    }
}

// Default instance export
export const cmsPublishedCacheRepository = new CmsPublishedCacheRepository();