import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * CMS Labels Contracts
 *
 * 라벨 메타데이터 관리 API
 */

/**
 * GET /labels - 라벨 목록 조회
 * Final path: /_cms/labels (prefix added from package.json)
 */
export const getLabelsContract = {
    method: 'GET' as const,
    path: '/labels',
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
 * POST /labels - 새 라벨 생성
 */
export const createLabelContract = {
    method: 'POST' as const,
    path: '/labels',
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

/**
 * GET /labels/:id - 라벨 단건 조회
 */
export const getLabelContract = {
    method: 'GET' as const,
    path: '/labels/:id',
    params: Type.Object({
        id: Type.String({ description: '라벨 ID' })
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
            error: Type.String()
        })
    ])
} as const satisfies RouteContract;

/**
 * PATCH /labels/:id - 라벨 메타데이터 수정
 */
export const updateLabelContract = {
    method: 'PATCH' as const,
    path: '/labels/:id',
    params: Type.Object({
        id: Type.String({ description: '라벨 ID' })
    }),
    body: Type.Object({
        section: Type.Optional(Type.String({ description: '섹션 변경' })),
        type: Type.Optional(Type.Union([
            Type.Literal('text'),
            Type.Literal('image'),
            Type.Literal('video'),
            Type.Literal('file'),
            Type.Literal('object')
        ]))
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
            error: Type.String()
        })
    ])
} as const satisfies RouteContract;

/**
 * DELETE /labels/:id - 라벨 삭제
 */
export const deleteLabelContract = {
    method: 'DELETE' as const,
    path: '/labels/:id',
    params: Type.Object({
        id: Type.String({ description: '라벨 ID' })
    }),
    response: Type.Union([
        Type.Object({
            success: Type.Boolean(),
            id: Type.Number()
        }),
        Type.Object({
            error: Type.String()
        })
    ])
} as const satisfies RouteContract;

/**
 * GET /labels/by-key/:key - Key로 라벨 조회
 */
export const getLabelByKeyContract = {
    method: 'GET' as const,
    path: '/labels/by-key/:key',
    params: Type.Object({
        key: Type.String({ description: '라벨 Key (예: home.hero.title)' })
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