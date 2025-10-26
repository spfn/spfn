/**
 * CMS Label Values Detail Routes
 *
 * - GET /cms/values/:labelId/:version - 특정 버전의 값 조회
 */

import { createApp } from '@spfn/core/route';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '../../../../repositories';
import { getValuesContract } from './contract.js';

const app = createApp();

/**
 * GET /cms/values/:labelId/:version
 * 특정 버전의 값 조회
 */
app.bind(getValuesContract, async (c) =>
{
    const { labelId: labelIdStr, version: versionStr } = c.params;
    const labelId = parseInt(labelIdStr, 10);
    const version = parseInt(versionStr, 10);

    if (isNaN(labelId) || isNaN(version))
    {
        return c.json({ error: 'Invalid label ID or version' }, 400);
    }

    const { locale, breakpoint } = c.query;

    // 라벨 존재 확인
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label)
    {
        return c.json({ error: 'Label not found' }, 404);
    }

    // 값 조회
    const values = await cmsLabelValuesRepository.findByLabelIdAndVersion(
        labelId,
        version,
        {
            locale,
            breakpoint: breakpoint === 'null' ? null : breakpoint,
        }
    );

    return c.json({
        labelId,
        version,
        values: values.map((v) => ({
            id: v.id,
            locale: v.locale,
            breakpoint: v.breakpoint,
            value: v.value,
            createdAt: v.createdAt.toISOString(),
        })),
    });
});

export default app;