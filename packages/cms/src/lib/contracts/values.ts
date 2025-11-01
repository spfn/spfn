import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * Label Value 타입 정의
 */
const LabelValueSchema = Type.Object({
    type: Type.Union([
        Type.Literal('text'),
        Type.Literal('image'),
        Type.Literal('video'),
        Type.Literal('file'),
        Type.Literal('object')
    ]),
    content: Type.Optional(Type.String()), // text type
    url: Type.Optional(Type.String()), // image, video, file types
    alt: Type.Optional(Type.String()), // image type
    width: Type.Optional(Type.Number()), // image type
    height: Type.Optional(Type.Number()), // image type
    thumbnail: Type.Optional(Type.String()), // video type
    duration: Type.Optional(Type.Number()), // video type
    filename: Type.Optional(Type.String()), // file type
    size: Type.Optional(Type.Number()), // file type
    fields: Type.Optional(Type.Any()) // object type - recursive structure
});

/**
 * POST /values/:labelId - 라벨 값 저장
 * Final path: /_cms/values/:labelId (prefix added from package.json)
 */
export const saveValuesContract = {
    method: 'POST' as const,
    path: '/values/:labelId',
    params: Type.Object({
        labelId: Type.String({ description: '라벨 ID' })
    }),
    body: Type.Object({
        version: Type.Number({ description: '버전 번호', minimum: 1 }),
        values: Type.Array(
            Type.Object({
                locale: Type.String({ description: '언어 코드 (ko, en, ja)', default: 'ko' }),
                breakpoint: Type.Optional(Type.Union([
                    Type.Literal('sm'),
                    Type.Literal('md'),
                    Type.Literal('lg'),
                    Type.Literal('xl'),
                    Type.Literal('2xl'),
                    Type.Null()
                ], { description: '반응형 브레이크포인트' })),
                value: LabelValueSchema
            })
        )
    }),
    response: Type.Union([
        Type.Object({
            success: Type.Boolean(),
            saved: Type.Number(),
            version: Type.Number()
        }),
        Type.Object({
            error: Type.String()
        })
    ])
} as const satisfies RouteContract;

/**
 * GET /values/:labelId/:version - 특정 버전의 값 조회
 * Final path: /_cms/values/:labelId/:version (prefix added from package.json)
 */
export const getValuesContract = {
    method: 'GET' as const,
    path: '/values/:labelId/:version',
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