/**
 * CMS Label Publish Route
 *
 * 라벨 발행 API (Draft → Published)
 * - POST /labels/:id/publish - Draft를 Published로 발행 (final: /_cms/labels/:id/publish)
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { publishLabelContract } from '@/lib/contracts/labels';
import { publishLabel } from '@/server/services/publish.service';

const app = createApp();

/**
 * POST /labels/:id/publish
 * Draft → Published 발행
 */
app.bind(publishLabelContract, [Transactional()], async (c) =>
{
    const { id: labelId } = c.params;
    const body = await c.data();

    const result = await publishLabel(labelId, {
        notes: body.notes,
        publishedBy: body.publishedBy
    });

    return c.success({
        id: labelId,
        version: result.version,
        message: result.message
    });
});

export default app;