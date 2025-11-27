/**
 * CMS Published Cache Service
 *
 * 발행된 콘텐츠 캐시 관리 비즈니스 로직을 담당하는 서비스 레이어
 */

import { cmsPublishedCacheRepository } from '@/server/repositories';
import { CMSInvalidRequestError, CMSOperationError } from '@/server/helpers/error';

/**
 * 섹션별 발행된 캐시 조회 (배치 조회 지원)
 */
export async function getPublishedCacheBySections(options: {
    sections: string[];
    locale: string;
}): Promise<Array<{
    section: string;
    locale: string;
    content: Record<string, any>;
    version: number;
    publishedAt: string | null;
}>>
{
    const { sections, locale } = options;

    // Validate sections
    if (!sections || sections.length === 0)
    {
        throw new CMSInvalidRequestError('Sections parameter is required', { sections });
    }

    // Fetch all sections in parallel
    const results = await Promise.all(
        sections.map(section => cmsPublishedCacheRepository.findBySection(section, locale))
    );

    // Map to response format (only include found sections)
    return results
        .filter((cache): cache is NonNullable<typeof cache> => cache !== null)
        .map(cache => ({
            section: cache.section,
            locale: cache.locale,
            content: cache.content,
            version: cache.version,
            publishedAt: cache.publishedAt?.toISOString() || null,
        }));
}

/**
 * 발행된 캐시 업데이트/생성 (upsert)
 */
export async function upsertPublishedCache(data: {
    section: string;
    locale: string;
    content: Record<string, any>;
    version: number;
}): Promise<{
    section: string;
    locale: string;
    content: Record<string, any>;
    version: number;
    publishedAt: string | null;
}>
{
    const { section, locale, content, version } = data;

    // Upsert cache
    const result = await cmsPublishedCacheRepository.upsert({
        section,
        locale,
        content,
        version,
        publishedAt: new Date(),
    });

    if (!result)
    {
        throw new CMSOperationError('upsert', 'published cache', { section, locale, version });
    }

    return {
        section: result.section,
        locale: result.locale,
        content: result.content,
        version: result.version,
        publishedAt: result.publishedAt?.toISOString() || null,
    };
}