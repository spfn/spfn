/**
 * CMS Published Cache Routes
 *
 * 발행된 콘텐츠 캐시 관리 API
 * 얇은 컨트롤러 레이어 - 비즈니스 로직은 서비스 레이어에서 처리
 */

import { route } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import {
    getPublishedCacheBySections,
    upsertPublishedCache,
} from '../../services';
import { SectionsQuerySchema, UpsertCacheBodySchema } from './schema';

/**
 * GET /_cms/published-cache
 * 발행된 섹션 콘텐츠 조회 (단일 또는 여러 섹션)
 */
export const getPublishedCache = route.get('/_cms/published-cache')
    .input({
        query: SectionsQuerySchema
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { query } = await c.data();

        // Normalize to array
        const sections = Array.isArray(query.sections)
            ? query.sections
            : [query.sections];

        return await getPublishedCacheBySections({
            sections,
            locale: query.locale
        });
    });

/**
 * POST /_cms/published-cache
 * 발행된 콘텐츠 캐시 업데이트/생성 (upsert)
 */
export const upsertCache = route.post('/_cms/published-cache')
    .input({
        body: UpsertCacheBodySchema
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        return await upsertPublishedCache(body);
    });