/**
 * CMS Label Admin Route
 *
 * 관리자용 라벨 조회 API (Draft + Published + Status)
 * - GET /labels/:id/admin - 라벨 상세 정보 조회 (final: /_cms/labels/:id/admin)
 */

import { createApp } from '@spfn/core/route';
import { getAdminLabelContract } from '@/lib/contracts/labels';
import { cmsLabelsRepository } from '@/server/repositories/cms-labels.repository';
import { cmsLabelValuesRepository } from '@/server/repositories/cms-label-values.repository';
import type { CmsLabelValue } from '@/server/entities/cms-label-values';

const app = createApp();

/**
 * Draft와 Published 값들을 비교하여 실제 변경이 있는지 확인
 *
 * @param draftValues - Draft 값 목록
 * @param publishedValues - Published 값 목록
 * @returns 변경 사항이 있으면 true, 없으면 false
 */
function compareValues(
    draftValues: CmsLabelValue[],
    publishedValues: CmsLabelValue[]
): boolean
{
    // locale + breakpoint 조합별로 값 매핑
    const draftMap = new Map(
        draftValues.map(v => [
            `${v.locale}:${v.breakpoint || 'default'}`,
            v.value
        ])
    );

    const publishedMap = new Map(
        publishedValues.map(v => [
            `${v.locale}:${v.breakpoint || 'default'}`,
            v.value
        ])
    );

    // 개수가 다르면 변경됨
    if (draftMap.size !== publishedMap.size)
    {
        return true;
    }

    // 각 값 깊은 비교 (JSON 직렬화로 비교)
    for (const [key, draftValue] of draftMap.entries())
    {
        const publishedValue = publishedMap.get(key);

        // Published에 해당 키가 없거나 값이 다르면 변경됨
        if (!publishedValue || JSON.stringify(draftValue) !== JSON.stringify(publishedValue))
        {
            return true;
        }
    }

    // 모든 값이 동일함
    return false;
}

/**
 * 라벨 상태 계산
 *
 * @param hasDraft - Draft가 있는지
 * @param hasPublished - Published가 있는지
 * @param draftValues - Draft 값 목록 (있는 경우)
 * @param publishedValues - Published 값 목록 (있는 경우)
 * @returns 상태 ('default-only' | 'unpublished' | 'published' | 'modified')
 */
function calculateStatus(
    hasDraft: boolean,
    hasPublished: boolean,
    draftValues?: CmsLabelValue[],
    publishedValues?: CmsLabelValue[]
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
    // Draft와 Published 내용을 실제로 비교하여 변경 여부 확인
    if (draftValues && publishedValues)
    {
        const hasActualChanges = compareValues(draftValues, publishedValues);
        return hasActualChanges ? 'modified' : 'published';
    }

    // 안전을 위해 기본값은 'modified'
    return 'modified';
}

/**
 * GET /labels/:id/admin
 * 관리자용 라벨 상세 조회
 */
app.bind(getAdminLabelContract, async (c) =>
{
    const { id } = c.params;

    try
    {
        // 라벨 메타데이터 조회
        const label = await cmsLabelsRepository.findById(parseInt(id));
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

        // 상태 계산 (실제 값 비교 포함)
        const status = calculateStatus(
            draftValues.length > 0,
            publishedValues.length > 0,
            draftValues,
            publishedValues
        );

        return c.json({
            label: {
                id: label.id,
                key: label.key,
                section: label.section,
                type: label.type,
                description: label.description,
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