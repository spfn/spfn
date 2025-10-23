import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * CMS Label Detail Contracts
 */

/**
 * GET /cms/labels/:id - 라벨 단건 조회
 */
export const getLabelContract = {
    method: 'GET' as const,
    path: '/:id',
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
 * PATCH /cms/labels/:id - 라벨 메타데이터 수정
 */
export const updateLabelContract = {
    method: 'PATCH' as const,
    path: '/:id',
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
 * DELETE /cms/labels/:id - 라벨 삭제
 */
export const deleteLabelContract = {
    method: 'DELETE' as const,
    path: '/:id',
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