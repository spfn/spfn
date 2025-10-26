/**
 * CMS Published Cache Routes
 *
 * - GET /cms/published-cache - 발행된 콘텐츠 캐시 조회 (단일 또는 배치)
 */

import { createApp } from '@spfn/core/route';
import { cmsPublishedCacheRepository } from '../../repositories';
import { getPublishedCacheContract } from './contract.js';

const app = createApp();

/**
 * GET /cms/published-cache
 * 발행된 섹션 콘텐츠 조회 (단일 또는 여러 섹션)
 */
app.bind(getPublishedCacheContract, async (c) =>
{
    const { sections: sectionsParam, locale = 'ko' } = c.query;

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
            content: cache.content as Record<string, any>,
            version: cache.version,
            publishedAt: cache.publishedAt?.toISOString() || null,
        }));

    return c.json(found);
});

export default app;