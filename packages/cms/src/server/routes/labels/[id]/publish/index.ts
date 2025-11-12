/**
 * CMS Label Publish Route
 *
 * 라벨 발행 API (Draft → Published)
 * - POST /labels/:id/publish - Draft를 Published로 발행 (final: /_cms/labels/:id/publish)
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import { publishLabelContract } from '@/lib/contracts/labels';
import { publishLabel } from '@/server/helpers/publish';

const app = createApp();

/**
 * POST /labels/:id/publish
 * Draft → Published 발행
 */
app.bind(publishLabelContract, [Transactional()], async (c) =>
{
    const { id } = c.params;
    const body = await c.data();

    try
    {
        const result = await publishLabel(parseInt(id), {
            notes: body.notes,
            publishedBy: body.publishedBy
        });

        return c.json({
            success: true,
            id: parseInt(id),
            version: result.version,
            message: result.message
        });
    }
    catch (error)
    {
        const err = error as Error;
        return c.json(
            { error: err.message },
            400
        );
    }
});

export default app;