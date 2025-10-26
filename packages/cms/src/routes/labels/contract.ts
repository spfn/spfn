import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * CMS Labels Contracts
 *
 * 라벨 메타데이터 관리 API
 */

/**
 * GET /cms/labels - 라벨 목록 조회
 */
export const getLabelsContract = {
    method: 'GET' as const,
    path: '/',
    query: Type.Object({
        section: Type.Optional(Type.String({ description: '섹션으로 필터링 (예: home, why-futureplay)' })),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20, description: '페이지당 항목 수' })),
        offset: Type.Optional(Type.Number({ minimum: 0, default: 0, description: '시작 오프셋' }))
    }),
    response: Type.Object({
        labels: Type.Array(Type.Object({
            id: Type.Number(),
            key: Type.String(),
            section: Type.String(),
            type: Type.String(),
            publishedVersion: Type.Union([Type.Number(), Type.Null()]),
            createdBy: Type.Union([Type.String(), Type.Null()]),
            createdAt: Type.String(),
            updatedAt: Type.String()
        })),
        total: Type.Number(),
        limit: Type.Number(),
        offset: Type.Number()
    })
} as const satisfies RouteContract;

/**
 * POST /cms/labels - 새 라벨 생성
 */
export const createLabelContract = {
    method: 'POST' as const,
    path: '/',
    body: Type.Object({
        key: Type.String({
            description: '고유 키 (예: home.hero.title)',
            pattern: '^[a-z0-9-]+\\.[a-z0-9-]+\\.[a-z0-9-]+$'
        }),
        section: Type.String({
            description: '섹션 이름 (예: home, why-futureplay)',
            pattern: '^[a-z0-9-]+$'
        }),
        type: Type.Union([
            Type.Literal('text'),
            Type.Literal('image'),
            Type.Literal('video'),
            Type.Literal('file'),
            Type.Literal('object')
        ], { description: '값 타입' }),
        createdBy: Type.Optional(Type.String({ description: '생성자 ID' }))
    }),
    response: Type.Union([
        Type.Object({
            id: Type.Number(),
            key: Type.String(),
            section: Type.String(),
            type: Type.String(),
            publishedVersion: Type.Union([Type.Number(), Type.Null()]),
            createdBy: Type.Union([Type.String(), Type.Null()]),
            createdAt: Type.String(),
            updatedAt: Type.String()
        }),
        Type.Object({
            error: Type.String(),
            key: Type.Optional(Type.String())
        })
    ])
} as const satisfies RouteContract;