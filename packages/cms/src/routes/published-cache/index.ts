/**
 * CMS Published Cache Routes
 *
 * - GET /cms/published-cache - 발행된 콘텐츠 캐시 조회
 */

import { createApp } from '@spfn/core/route';
import { cmsPublishedCacheRepository } from '../../repositories';
import { getPublishedCacheContract } from './contract.js';

const app = createApp();

/**
 * GET /cms/published-cache
 * 발행된 섹션 콘텐츠 조회 (초고속 5ms)
 */
app.bind(getPublishedCacheContract, async (c) =>
{
    const { section, locale = 'ko' } = c.query;

    const cache = await cmsPublishedCacheRepository.findBySection(section, locale);

    if (!cache)
    {
        return c.json(
            { error: `No published content found for section: ${section} (${locale})` },
            404
        );
    }

    return c.json({
        section: cache.section,
        locale: cache.locale,
        content: cache.content as Record<string, any>,
        version: cache.version,
        publishedAt: cache.publishedAt?.toISOString() || null,
    });
});

export default app;