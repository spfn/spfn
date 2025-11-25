/**
 * CMS Labels Routes
 *
 * 라벨 메타데이터 관리 API
 * 얇은 컨트롤러 레이어 - 비즈니스 로직은 서비스 레이어에서 처리
 */

import { Type } from '@sinclair/typebox';
import { defineRouter, route } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import {
    getLabelsWithDefaults,
    createLabelWithValidation,
    getLabelById,
    updateLabelById,
    deleteLabelById,
    getLabelByKey,
    publishLabelById,
    getAdminLabelData,
    getLabelVersionHistory,
} from '@/server/services';
import { LabelTypeSchema, LabelIdParamsSchema, LabelKeyParamsSchema } from './schema';

/**
 * GET /_cms/labels
 * 라벨 목록 조회 (섹션 필터)
 */
export const getLabels = route.get('/_cms/labels')
    .input({
        query: Type.Object({
            section: Type.Optional(Type.String({
                description: 'Filter by section'
            })),
            includeDefaultValues: Type.Optional(Type.Boolean({
                description: 'Include default values'
            }))
        })
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { query } = await c.data();
        return await getLabelsWithDefaults(query);
    });

/**
 * POST /_cms/labels
 * 새 라벨 생성
 */
export const createLabel = route.post('/_cms/labels')
    .input({
        body: Type.Object({
            key: Type.String({
                description: 'Unique key (e.g., home.hero.title)',
                pattern: '^[a-z0-9-]+\\.[a-z0-9-]+\\.[a-z0-9-]+$'
            }),
            section: Type.String({
                description: 'Section name (e.g., home, why-futureplay)',
                pattern: '^[a-z0-9-]+$'
            }),
            type: LabelTypeSchema,
            createdBy: Type.Optional(Type.String({
                description: 'Creator ID'
            }))
        })
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        return await createLabelWithValidation(body);
    });

/**
 * GET /_cms/labels/:id
 * 라벨 단일 조회
 */
export const getLabel = route.get('/_cms/labels/:id')
    .input({
        params: LabelIdParamsSchema
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return await getLabelById(params.id);
    });

/**
 * PATCH /_cms/labels/:id
 * 라벨 메타데이터 수정
 */
export const updateLabel = route.patch('/_cms/labels/:id')
    .input({
        params: LabelIdParamsSchema,
        body: Type.Object({
            section: Type.Optional(Type.String({
                description: 'Change section'
            })),
            type: Type.Optional(LabelTypeSchema)
        })
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params, body } = await c.data();
        return await updateLabelById(params.id, body);
    });

/**
 * DELETE /_cms/labels/:id
 * 라벨 삭제
 */
export const deleteLabel = route.delete('/_cms/labels/:id')
    .input({
        params: LabelIdParamsSchema
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return await deleteLabelById(params.id);
    });

/**
 * GET /_cms/labels/by-key/:key
 * Key로 라벨 조회
 */
export const getLabelByKeyRoute = route.get('/_cms/labels/by-key/:key')
    .input({
        params: LabelKeyParamsSchema
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return await getLabelByKey(params.key);
    });

/**
 * POST /_cms/labels/:id/publish
 * 라벨 발행 (Draft → Published)
 */
export const publishLabel = route.post('/_cms/labels/:id/publish')
    .input({
        params: LabelIdParamsSchema,
        body: Type.Object({
            notes: Type.Optional(Type.String({
                description: 'Publish notes (version description)'
            })),
            publishedBy: Type.Optional(Type.String({
                description: 'Publisher ID'
            }))
        })
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params, body } = await c.data();
        return await publishLabelById(params.id, body);
    });

/**
 * GET /_cms/labels/:id/admin
 * Admin용 라벨 상세 조회 (Draft + Published + Status)
 */
export const getAdminLabel = route.get('/_cms/labels/:id/admin')
    .input({
        params: LabelIdParamsSchema
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return await getAdminLabelData(params.id);
    });

/**
 * GET /_cms/labels/:id/versions
 * 라벨 버전 히스토리 조회
 */
export const getLabelVersions = route.get('/_cms/labels/:id/versions')
    .input({
        params: LabelIdParamsSchema
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return await getLabelVersionHistory(params.id);
    });

/**
 * Labels Router
 * 모든 라벨 관련 라우트를 포함
 */
export const labelsRouter = defineRouter({
    getLabels: getLabels,
    createLabel: createLabel,
    getLabel: getLabel,
    updateLabel: updateLabel,
    deleteLabel: deleteLabel,
    getLabelByKey: getLabelByKeyRoute,
    publishLabel: publishLabel,
    getAdminLabel: getAdminLabel,
    getLabelVersions: getLabelVersions,
});

// For backward compatibility
export default labelsRouter;