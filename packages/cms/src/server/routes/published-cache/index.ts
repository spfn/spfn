/**
 * CMS Published Cache Routes
 *
 * - GET /cms/published-cache - 발행된 콘텐츠 캐시 조회 (단일 또는 배치)
 * - POST /cms/published-cache - 발행된 콘텐츠 캐시 업데이트/생성 (upsert)
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { cmsPublishedCacheRepository } from '@/server/repositories';
import { getPublishedCacheContract, upsertPublishedCacheContract } from '@/lib/contracts/published-cache';
import { CMSOperationError, CMSInvalidRequestError } from '@/server/helpers/error';

const app = createApp();

/**
 * GET /cms/published-cache
 * 발행된 섹션 콘텐츠 조회 (단일 또는 여러 섹션)
 */
app.bind(getPublishedCacheContract, async (c) =>
{
    const { sections: sectionsParam, locale } = c.query;

    // Validate sections parameter
    if (!sectionsParam || (Array.isArray(sectionsParam) && sectionsParam.length === 0))
    {
        throw new CMSInvalidRequestError('Sections parameter is required', { sections: sectionsParam });
    }

    // Normalize to array
    const sections = Array.isArray(sectionsParam) ? sectionsParam : [sectionsParam];

    // Fetch all sections in parallel
    const results = await Promise.all(
        sections.map(section => cmsPublishedCacheRepository.findBySection(section, locale))
    );

    // Map to response format (only include found sections)
    const found = results
        .filter((cache): cache is NonNullable<typeof cache> => cache !== null)
        .map(cache => ({
            section: cache.section,
            locale: cache.locale,
            content: cache.content, // ✅ No type assertion needed!
            version: cache.version,
            publishedAt: cache.publishedAt?.toISOString() || null,
        }));

    return c.success(found);
});

/**
 * POST /cms/published-cache
 * 발행된 콘텐츠 캐시 업데이트/생성 (upsert)
 */
app.bind(upsertPublishedCacheContract, [Transactional()], async (c) =>
{
    const { section, locale, content, version } = await c.data();

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

    return c.success({
        section: result.section,
        locale: result.locale,
        content: result.content, // ✅ No type assertion needed!
        version: result.version,
        publishedAt: result.publishedAt?.toISOString() || null,
    });
});

export default app;