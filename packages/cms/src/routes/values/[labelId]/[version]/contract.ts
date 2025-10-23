import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * GET /cms/values/:labelId/:version - 특정 버전의 값 조회
 */
export const getValuesContract = {
    method: 'GET' as const,
    path: '/:labelId/:version',
    params: Type.Object({
        labelId: Type.String({ description: '라벨 ID' }),
        version: Type.String({ description: '버전 번호' })
    }),
    query: Type.Object({
        locale: Type.Optional(Type.String({ description: '언어 코드 (ko, en, ja)' })),
        breakpoint: Type.Optional(Type.String({ description: '반응형 브레이크포인트' }))
    }),
    response: Type.Union([
        Type.Object({
            labelId: Type.Number(),
            version: Type.Number(),
            values: Type.Array(
                Type.Object({
                    id: Type.Number(),
                    locale: Type.String(),
                    breakpoint: Type.Union([Type.String(), Type.Null()]),
                    value: Type.Any(),
                    createdAt: Type.String()
                })
            )
        }),
        Type.Object({
            error: Type.String()
        })
    ])
} as const satisfies RouteContract;