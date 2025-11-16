/**
 * CMS Label By Key Route
 *
 * - GET /cms/labels/by-key/:key - Key로 라벨 조회
 */

import { createApp } from '@spfn/core/route';
import { cmsLabelsRepository } from '@/server/repositories';
import { getLabelByKeyContract } from '@/lib/contracts/labels';
import { CMSNotFoundError } from '@/server/helpers/error';

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
        throw new CMSNotFoundError('Label', { key });
    }

    return c.success(label);
});

export default app;