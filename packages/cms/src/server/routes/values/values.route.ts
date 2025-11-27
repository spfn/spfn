/**
 * CMS Label Values Routes
 *
 * 라벨 값 관리 API
 * 얇은 컨트롤러 레이어 - 비즈니스 로직은 서비스 레이어에서 처리
 */

import { route } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import {
    saveLabelValues,
    getLabelValuesByVersion,
} from '@/server/services/values.service';
import {
    LabelIdParamsSchema,
    LabelVersionParamsSchema,
    ValuesQuerySchema,
    SaveValuesBodySchema,
} from './schema';

/**
 * POST /_cms/values/:labelId
 * 라벨 값 저장 (upsert)
 * - version: null → Save as draft (overwrite)
 * - version: number → Create published version (immutable)
 */
export const saveValues = route.post('/_cms/values/:labelId')
    .input({
        params: LabelIdParamsSchema,
        body: SaveValuesBodySchema
    })
    .use([Transactional()])
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params, body } = await c.data();
        return await saveLabelValues(params.labelId, body);
    });

/**
 * GET /_cms/values/:labelId/:version
 * 특정 버전의 값 조회
 */
export const getValues = route.get('/_cms/values/:labelId/:version')
    .input({
        params: LabelVersionParamsSchema,
        query: ValuesQuerySchema
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params, query } = await c.data();
        return await getLabelValuesByVersion(
            params.labelId,
            params.version,
            query
        );
    });