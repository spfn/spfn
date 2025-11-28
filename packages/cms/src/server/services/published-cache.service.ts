/**
 * CMS Published Cache Service
 *
 * 발행된 콘텐츠 캐시 관리 비즈니스 로직을 담당하는 서비스 레이어
 */

import { cmsPublishedCacheRepository } from '../repositories';
import { CMSOperationFailedError } from '@spfn/cms/errors';
import { ValidationError } from '@spfn/core/errors';

/**
 * 발행된 캐시 응답 타입
 */
export interface PublishedCacheResponse
{
    section: string;
    locale: string;
    content: Record<string, any>;
    version: number;
    publishedAt: string | null;
}

/**
 * 섹션별 캐시 조회 입력 타입
 */
export interface GetPublishedCacheBySectionsInput
{
    sections: string[];
    locale: string;
}

/**
 * 캐시 업데이트/생성 입력 타입
 */
export interface UpsertPublishedCacheInput
{
    section: string;
    locale: string;
    content: Record<string, any>;
    version: number;
}

/**
 * 섹션별 발행된 캐시 조회 (배치 조회 지원)
 */
export async function getPublishedCacheBySections(
    options: GetPublishedCacheBySectionsInput
): Promise<PublishedCacheResponse[]>
{
    const { sections, locale } = options;

    // Validate sections
    if (!sections || sections.length === 0)
    {
        throw new ValidationError({
            message: 'Sections parameter is required',
            details: { sections }
        });
    }

    // Fetch all sections in parallel
    const results = await Promise.all(
        sections.map(section => cmsPublishedCacheRepository.findBySection(section, locale))
    );

    // Map to response format (only include found sections)
    return results
        .filter((cache) => cache !== null)
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
export async function upsertPublishedCache(
    data: UpsertPublishedCacheInput
): Promise<PublishedCacheResponse>
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
        throw new CMSOperationFailedError({
            operation: 'upsert',
            resource: 'published cache',
            details: { section, locale, version }
        });
    }

    return {
        section: result.section,
        locale: result.locale,
        content: result.content,
        version: result.version,
        publishedAt: result.publishedAt?.toISOString() || null,
    };
}