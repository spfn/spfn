/**
 * CMS Label Values Detail Routes
 *
 * - GET /cms/values/:labelId/:version - 특정 버전의 값 조회
 */

import { createApp } from '@spfn/core/route';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '@/server/repositories';
import { getValuesContract } from '@/lib/contracts/values';
import { CMSNotFoundError } from '@/server/helpers/error';

const app = createApp();

/**
 * GET /cms/values/:labelId/:version
 * 특정 버전의 값 조회
 */
app.bind(getValuesContract, async (c) =>
{
    const { labelId, version } = c.params;
    const { locale, breakpoint } = c.query;

    // 라벨 존재 확인
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label)
    {
        throw new CMSNotFoundError('Label', labelId);
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

    return c.success({
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