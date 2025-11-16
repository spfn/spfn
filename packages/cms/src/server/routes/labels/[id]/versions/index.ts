/**
 * CMS Label Versions Route
 *
 * 라벨 버전 히스토리 조회 API
 * - GET /labels/:id/versions - 모든 버전 히스토리 조회 (final: /_cms/labels/:id/versions)
 */

import { createApp } from '@spfn/core/route';
import { getLabelVersionsContract } from '@/lib/contracts/labels';
import { cmsLabelsRepository, cmsLabelValuesRepository } from '@/server/repositories';
import { CMSNotFoundError } from '@/server/helpers/error';

const app = createApp();

/**
 * GET /labels/:id/versions
 * 라벨의 모든 버전 히스토리 조회
 */
app.bind(getLabelVersionsContract, async (c) =>
{
    const { id: labelId } = c.params;

    // 라벨 존재 확인
    const label = await cmsLabelsRepository.findById(labelId);
    if (!label)
    {
        throw new CMSNotFoundError('Label', labelId);
    }

    // publishedVersion이 없으면 빈 배열 반환
    if (!label.publishedVersion)
    {
        return c.success({ versions: [] });
    }

    // Repository를 통해 버전 히스토리 조회 (1번의 쿼리로 모든 버전 조회)
    const versions = await cmsLabelValuesRepository.findVersionHistoryByLabelId(
        label.id,
        label.publishedVersion
    );

    return c.success({ versions });
});

export default app;