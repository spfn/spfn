import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * GET /cms/labels/by-key/:key - Key로 라벨 조회
 */
export const getLabelByKeyContract = {
    method: 'GET' as const,
    path: '/:key',
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