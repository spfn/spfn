/**
 * CMS Label Values Routes
 *
 * - POST /cms/values/:labelId - 라벨 값 저장
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '../../../repositories';
import { saveValuesContract } from './contract.js';

const app = createApp();

/**
 * POST /cms/values/:labelId
 * 라벨 값 저장 (upsert)
 */
app.bind(saveValuesContract, [Transactional()], async (c) =>
{
    const { labelId: labelIdStr } = c.params;
    const labelId = parseInt(labelIdStr, 10);

    if (isNaN(labelId))
    {
        return c.json({ error: 'Invalid label ID' }, 400);
    }

    const body = await c.data();

    // 라벨 존재 확인
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label)
    {
        return c.json({ error: 'Label not found' }, 404);
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

    return c.json({
        success: true,
        saved: savedValues.length,
        version: body.version,
    });
});

export default app;