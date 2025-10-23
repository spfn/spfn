import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * CMS Label Sync Contract
 *
 * 라벨 정의 파일을 DB와 동기화
 */

/**
 * POST /cms/sync - 라벨 동기화 실행
 */
export const syncLabelsContract = {
    method: 'POST' as const,
    path: '/',
    body: Type.Object({
        dryRun: Type.Optional(Type.Boolean({ description: 'Dry run - 변경사항만 확인', default: false })),
        updateExisting: Type.Optional(Type.Boolean({ description: '기존 라벨 defaultValue 업데이트', default: false })),
        removeUnused: Type.Optional(Type.Boolean({ description: '사용되지 않는 라벨 삭제', default: false })),
        verbose: Type.Optional(Type.Boolean({ description: '상세 로그 출력', default: false })),
    }),
    response: Type.Object({
        success: Type.Boolean({ description: '성공 여부' }),
        results: Type.Array(Type.Object({
            section: Type.String({ description: '섹션 이름' }),
            created: Type.Number({ description: '생성된 라벨 수' }),
            updated: Type.Number({ description: '업데이트된 라벨 수' }),
            deleted: Type.Number({ description: '삭제된 라벨 수' }),
            unchanged: Type.Number({ description: '변경되지 않은 라벨 수' }),
            errors: Type.Array(Type.Object({
                key: Type.String({ description: '에러가 발생한 라벨 키' }),
                error: Type.String({ description: '에러 메시지' }),
            })),
        })),
    }),
} as const satisfies RouteContract;