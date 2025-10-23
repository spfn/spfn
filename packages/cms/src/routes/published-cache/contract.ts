/**
 * CMS Published Cache API Contract
 */

import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * GET /cms/published-cache
 * 발행된 콘텐츠 캐시 조회
 */
export const getPublishedCacheContract = {
    method: 'GET' as const,
    path: '/',
    query: Type.Object({
        section: Type.String({ description: '섹션 이름 (예: home, why-futureplay)' }),
        locale: Type.Optional(Type.String({ default: 'ko', description: '언어 코드' })),
    }),
    response: Type.Union([
        Type.Object({
            section: Type.String(),
            locale: Type.String(),
            content: Type.Record(Type.String(), Type.Any()),
            version: Type.Number(),
            publishedAt: Type.Union([Type.String(), Type.Null()]),
        }),
        Type.Object({
            error: Type.String()
        })
    ])
} as const satisfies RouteContract;