/**
 * CMS Label Admin Route
 *
 * 관리자용 라벨 조회 API (Draft + Published + Status)
 * - GET /labels/:labelId/admin - 라벨 상세 정보 조회 (final: /_cms/labels/:labelId/admin)
 */

import { createApp } from '@spfn/core/route';
import { getAdminLabelContract } from '@/lib/contracts/labels';
import { cmsLabelsRepository } from '@/server/repositories/cms-labels.repository';
import { cmsLabelValuesRepository } from '@/server/repositories/cms-label-values.repository';

const app = createApp();

/**
 * 라벨 상태 계산
 *
 * @param hasDraft - Draft가 있는지
 * @param hasPublished - Published가 있는지
 * @returns 상태 ('default-only' | 'unpublished' | 'published' | 'modified')
 */
function calculateStatus(
    hasDraft: boolean,
    hasPublished: boolean
): 'default-only' | 'unpublished' | 'published' | 'modified'
{
    if (!hasPublished && !hasDraft)
    {
        return 'default-only';
    }

    if (!hasPublished && hasDraft)
    {
        return 'unpublished';
    }

    if (hasPublished && !hasDraft)
    {
        return 'published';
    }

    // hasPublished && hasDraft
    // TODO: Draft와 Published 내용 비교하여 실제 변경 여부 확인
    // 현재는 단순히 Draft가 있으면 'modified'로 표시
    return 'modified';
}

/**
 * GET /labels/:labelId/admin
 * 관리자용 라벨 상세 조회
 */
app.bind(getAdminLabelContract, async (c) =>
{
    const { labelId } = c.params;

    try
    {
        // 라벨 메타데이터 조회
        const label = await cmsLabelsRepository.findById(parseInt(labelId));
        if (!label)
        {
            return c.json(
                { error: 'Label not found' },
                404
            );
        }

        // Draft 값들 조회 (version = null)
        const draftValues = await cmsLabelValuesRepository.findDraftsByLabelId(label.id);

        // Published 값들 조회 (publishedVersion이 있는 경우)
        let publishedValues: any[] = [];
        if (label.publishedVersion !== null)
        {
            publishedValues = await cmsLabelValuesRepository.findByLabelIdAndVersion(
                label.id,
                label.publishedVersion
            );
        }

        // 상태 계산
        const status = calculateStatus(
            draftValues.length > 0,
            publishedValues.length > 0
        );

        return c.json({
            label: {
                id: label.id,
                key: label.key,
                section: label.section,
                type: label.type,
                publishedVersion: label.publishedVersion,
                createdBy: label.createdBy,
                createdAt: label.createdAt.toISOString(),
                updatedAt: label.updatedAt.toISOString()
            },
            draft: draftValues.map(v => ({
                id: v.id,
                labelId: v.labelId,
                version: null,
                locale: v.locale,
                breakpoint: v.breakpoint,
                value: v.value,
                createdAt: v.createdAt.toISOString()
            })),
            published: publishedValues.map(v => ({
                id: v.id,
                labelId: v.labelId,
                version: v.version as number,
                locale: v.locale,
                breakpoint: v.breakpoint,
                value: v.value,
                createdAt: v.createdAt.toISOString()
            })),
            status
        });
    }
    catch (error)
    {
        const err = error as Error;
        return c.json(
            { error: err.message },
            500
        );
    }
});

export default app;