/**
 * Tracking Test Routes
 *
 * Test routes for verifying email tracking functionality.
 * These routes demonstrate how tracking works without actually sending emails.
 */

import { route } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';
import {
    configureNotification,
    isTrackingEnabled,
    getTrackingBaseUrl,
    getTrackingStats,
    getEngagementStats,
    getClickDetails,
} from '@spfn/notification/server';
import { processTrackingHtml } from '@spfn/notification/server';

/**
 * Preview tracking-injected HTML
 *
 * Simulates what happens to an email's HTML when tracking is enabled.
 * Returns the processed HTML with pixel + wrapped links.
 */
export const previewTrackedEmail = route.post('/_test/tracking/preview')
    .input({
        body: Type.Object({
            html: Type.String(),
            notificationId: Type.Number({ default: 1 }),
        }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { body } = await c.data();
        const baseUrl = getTrackingBaseUrl() || 'http://localhost:8790';

        const result = processTrackingHtml(body.html, {
            notificationId: body.notificationId,
            baseUrl,
        });

        return {
            trackingEnabled: isTrackingEnabled(),
            baseUrl,
            originalLength: body.html.length,
            processedLength: result.html.length,
            trackedLinks: result.trackedLinks,
            html: result.html,
        };
    });

/**
 * Get tracking stats for a notification
 */
export const getTrackingStatsRoute = route.get('/_test/tracking/stats/:notificationId')
    .input({
        params: Type.Object({
            notificationId: Type.String(),
        }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { params } = await c.data();
        const notificationId = Number(params.notificationId);

        const [stats, clicks] = await Promise.all([
            getTrackingStats(notificationId),
            getClickDetails(notificationId),
        ]);

        return { notificationId, stats, clicks };
    });

/**
 * Get overall engagement stats
 */
export const getEngagementStatsRoute = route.get('/_test/tracking/engagement')
    .input({
        query: Type.Object({
            channel: Type.Optional(Type.String()),
        }),
    })
    .skip(['auth'])
    .handler(async (c) =>
    {
        const { query } = await c.data();
        const stats = await getEngagementStats({
            channel: query.channel as 'email' | undefined,
        });
        return stats;
    });
