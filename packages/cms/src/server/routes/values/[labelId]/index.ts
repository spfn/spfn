/**
 * CMS Label Values Routes
 *
 * - POST /cms/values/:labelId - 라벨 값 저장
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '@/server/repositories';
import { saveValuesContract } from '@/lib/contracts/values';
import { CMSNotFoundError } from '@/server/helpers/error';

const app = createApp();

/**
 * POST /cms/values/:labelId
 * 라벨 값 저장 (upsert)
 */
app.bind(saveValuesContract, [Transactional()], async (c) =>
{
    const { labelId } = c.params;
    const body = await c.data();

    // 라벨 존재 확인
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label)
    {
        throw new CMSNotFoundError('Label', labelId);
    }

    // 값 저장
    const savedValues = await cmsLabelValuesRepository.upsertMany(
        body.values.map((v) => ({
            labelId,
            version: body.version,
            locale: v.locale,
            breakpoint: v.breakpoint ?? null,
            value: v.value,
        }))
    );

    return c.success({
        saved: savedValues.length,
        version: body.version,
    });
});

export default app;