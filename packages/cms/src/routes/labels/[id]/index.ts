/**
 * CMS Label Detail Routes
 *
 * - GET /cms/labels/:id - 라벨 단건 조회
 * - PATCH /cms/labels/:id - 라벨 메타데이터 수정
 * - DELETE /cms/labels/:id - 라벨 삭제
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { cmsLabelsRepository } from '../../../repositories';
import {
    getLabelContract,
    updateLabelContract,
    deleteLabelContract,
} from './contract.js';

const app = createApp();

/**
 * GET /cms/labels/:id
 * 라벨 단건 조회
 */
app.bind(getLabelContract, async (c) =>
{
    const { id } = c.params;
    const labelId = parseInt(id, 10);

    if (isNaN(labelId))
    {
        return c.json({ error: 'Invalid label ID' }, 400);
    }

    const label = await cmsLabelsRepository.findById(labelId);

    if (!label)
    {
        return c.json({ error: 'Label not found' }, 404);
    }

    return c.json({
        id: label.id,
        key: label.key,
        section: label.section,
        type: label.type,
        publishedVersion: label.publishedVersion,
        createdBy: label.createdBy,
        createdAt: label.createdAt.toISOString(),
        updatedAt: label.updatedAt.toISOString(),
    });
});

/**
 * PATCH /cms/labels/:id
 * 라벨 메타데이터 수정
 */
app.bind(updateLabelContract, [Transactional()], async (c) =>
{
    const { id } = c.params;
    const labelId = parseInt(id, 10);

    if (isNaN(labelId))
    {
        return c.json({ error: 'Invalid label ID' }, 400);
    }

    const body = await c.data();

    // 라벨 존재 확인
    const existing = await cmsLabelsRepository.findById(labelId);
    if (!existing)
    {
        return c.json({ error: 'Label not found' }, 404);
    }

    // 라벨 수정
    const updated = await cmsLabelsRepository.updateById(labelId, body);

    if (!updated)
    {
        return c.json({ error: 'Failed to update label' }, 500);
    }

    return c.json({
        id: updated.id,
        key: updated.key,
        section: updated.section,
        type: updated.type,
        publishedVersion: updated.publishedVersion,
        createdBy: updated.createdBy,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
    });
});

/**
 * DELETE /cms/labels/:id
 * 라벨 삭제
 */
app.bind(deleteLabelContract, [Transactional()], async (c) =>
{
    const { id } = c.params;
    const labelId = parseInt(id, 10);

    if (isNaN(labelId))
    {
        return c.json({ error: 'Invalid label ID' }, 400);
    }

    // 라벨 존재 확인
    const existing = await cmsLabelsRepository.findById(labelId);
    if (!existing)
    {
        return c.json({ error: 'Label not found' }, 404);
    }

    // 라벨 삭제 (CASCADE로 values도 함께 삭제됨)
    const deleted = await cmsLabelsRepository.deleteById(labelId);

    if (!deleted)
    {
        return c.json({ error: 'Failed to delete label' }, 500);
    }

    return c.json({
        success: true,
        id: deleted.id,
    });
});

export default app;