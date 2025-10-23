/**
 * CMS Label By Key Route
 *
 * - GET /cms/labels/by-key/:key - Key로 라벨 조회
 */

import { createApp } from '@spfn/core/route';
import { cmsLabelsRepository } from '../../../../repositories';
import { getLabelByKeyContract } from './contract.js';

const app = createApp();

/**
 * GET /cms/labels/by-key/:key
 * Key로 라벨 조회
 */
app.bind(getLabelByKeyContract, async (c) =>
{
    const { key } = c.params;

    const label = await cmsLabelsRepository.findByKey(key);

    if (!label)
    {
        return c.json({ error: 'Label not found', key }, 404);
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

export default app;