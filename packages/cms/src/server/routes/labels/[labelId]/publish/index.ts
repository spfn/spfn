/**
 * CMS Label Publish Route
 *
 * 라벨 발행 API (Draft → Published)
 * - POST /labels/:labelId/publish - Draft를 Published로 발행 (final: /_cms/labels/:labelId/publish)
 */

import { createApp } from '@spfn/core/route';
import { publishLabelContract } from '@/lib/contracts/labels';
import { publishLabel } from '@/server/helpers/publish';

const app = createApp();

/**
 * POST /labels/:labelId/publish
 * Draft → Published 발행
 */
app.bind(publishLabelContract, async (c) =>
{
    const { labelId } = c.params;
    const body = await c.data();

    try
    {
        const result = await publishLabel(parseInt(labelId), {
            notes: body.notes,
            publishedBy: body.publishedBy
        });

        return c.json({
            success: true,
            labelId: parseInt(labelId),
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