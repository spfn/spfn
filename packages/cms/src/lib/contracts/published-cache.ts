import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route/types';

const SectionData = Type.Object({
    section: Type.String(),
    locale: Type.String(),
    content: Type.Record(Type.String(), Type.Any()),
    version: Type.Number(),
    publishedAt: Type.Union([Type.String(), Type.Null()]),
});

/**
 * GET /_cms/published-cache
 * 발행된 콘텐츠 캐시 조회 (단일 또는 여러 섹션)
 */
export const getPublishedCacheContract = {
    method: 'GET' as const,
    path: '/_cms/published-cache',
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

/**
 * POST /_cms/published-cache
 * 발행된 콘텐츠 캐시 업데이트/생성 (upsert)
 */
export const upsertPublishedCacheContract = {
    method: 'POST' as const,
    path: '/_cms/published-cache',
    body: Type.Object({
        section: Type.String({ description: '섹션 이름 (예: home)' }),
        locale: Type.String({ description: '언어 코드 (예: ko, en, ja)' }),
        content: Type.Record(Type.String(), Type.Any(), { description: '발행할 콘텐츠 (key-value 형태)' }),
        version: Type.Number({ description: '버전 번호' })
    }),
    response: Type.Union([
        SectionData,
        Type.Object({
            error: Type.String()
        })
    ])
} as const satisfies RouteContract;