/**
 * CMS Label Detail Routes
 *
 * - GET /cms/labels/:id - 라벨 단건 조회
 * - PATCH /cms/labels/:id - 라벨 메타데이터 수정
 * - DELETE /cms/labels/:id - 라벨 삭제
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { cmsLabelsRepository } from '@/server/repositories';
import {
    getLabelContract,
    updateLabelContract,
    deleteLabelContract,
} from '@/lib/contracts/labels';
import { CMSNotFoundError, CMSOperationError } from '@/server/helpers/error';

const app = createApp();

/**
 * GET /cms/labels/:id
 * 라벨 단건 조회
 */
app.bind(getLabelContract, async (c) =>
{
    const { id: labelId } = c.params;

    const label = await cmsLabelsRepository.findById(labelId);

    if (!label)
    {
        throw new CMSNotFoundError('Label', labelId);
    }

    return c.success(label);
});

/**
 * PATCH /cms/labels/:id
 * 라벨 메타데이터 수정
 */
app.bind(updateLabelContract, [Transactional()], async (c) =>
{
    const { id: labelId } = c.params;
    const body = await c.data();

    // 라벨 존재 확인
    const existing = await cmsLabelsRepository.findById(labelId);
    if (!existing)
    {
        throw new CMSNotFoundError('Label', labelId);
    }

    // 라벨 수정
    const updated = await cmsLabelsRepository.updateById(labelId, body);

    if (!updated)
    {
        throw new CMSOperationError('update', 'label', { id: labelId });
    }

    return c.success(updated);
});

/**
 * DELETE /cms/labels/:id
 * 라벨 삭제
 */
app.bind(deleteLabelContract, [Transactional()], async (c) =>
{
    const { id: labelId } = c.params;

    // 라벨 존재 확인
    const existing = await cmsLabelsRepository.findById(labelId);
    if (!existing)
    {
        throw new CMSNotFoundError('Label', labelId);
    }

    // 라벨 삭제 (CASCADE로 values도 함께 삭제됨)
    const deleted = await cmsLabelsRepository.deleteById(labelId);

    if (!deleted)
    {
        throw new CMSOperationError('delete', 'label', { id: labelId });
    }

    return c.success({
        id: deleted.id,
    });
});

export default app;