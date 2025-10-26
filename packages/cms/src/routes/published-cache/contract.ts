/**
 * CMS Published Cache API Contract
 */

import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

const SectionData = Type.Object({
    section: Type.String(),
    locale: Type.String(),
    content: Type.Record(Type.String(), Type.Any()),
    version: Type.Number(),
    publishedAt: Type.Union([Type.String(), Type.Null()]),
});

/**
 * GET /cms/published-cache
 * 발행된 콘텐츠 캐시 조회 (단일 또는 여러 섹션)
 */
export const getPublishedCacheContract = {
    method: 'GET' as const,
    path: '/',
    query: Type.Object({
        sections: Type.Union([
            Type.String({ description: '단일 섹션 이름 (예: home)' }),
            Type.Array(Type.String(), { description: '여러 섹션 이름 (예: ["home", "footer"])' })
        ]),
        locale: Type.Optional(Type.String({ default: 'ko', description: '언어 코드' })),
    }),
    response: Type.Union([
        // 성공: 항상 배열로 반환
        Type.Array(SectionData),
        // 에러
        Type.Object({
            error: Type.String()
        })
    ])
} as const satisfies RouteContract;