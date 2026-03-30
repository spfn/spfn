/**
 * @spfn/monitor - Error Handler Integration
 *
 * Drop-in replacement for createErrorSlackNotifier from @spfn/notification.
 * Uses DB-backed error tracking with state-based notifications instead of
 * in-memory time-based throttling.
 *
 * @example
 * ```typescript
 * import { createMonitorErrorHandler } from '@spfn/monitor/server';
 *
 * export default defineServerConfig()
 *     .middleware({ onError: createMonitorErrorHandler() })
 *     .build();
 * ```
 */

import { getMinStatusCode } from '@spfn/monitor/config';
import { trackError, type ErrorTrackingContext } from '../services';
import { monitorLogger } from '../logger';

const logger = monitorLogger.errorTracking;

export interface MonitorErrorHandlerOptions
{
    /**
     * Minimum status code to track
     * @default env.SPFN_MONITOR_MIN_STATUS_CODE or 500
     */
    minStatusCode?: number;

    /**
     * Environment label (e.g. 'production', 'staging', 'development')
     * Displayed in Slack notifications for easy identification.
     */
    environment?: string;

    /**
     * Extract custom metadata from error and context
     */
    extractMetadata?: (err: Error, ctx: ErrorTrackingContext) => Record<string, unknown>;
}

interface OnErrorContext
{
    statusCode: number;
    path: string;
    method: string;
    requestId?: string;
    timestamp: string;
    userId?: string;
    request: {
        headers: Record<string, string>;
        query: Record<string, string>;
    };
}

/**
 * Create an onError callback that tracks errors in DB and sends Slack notifications
 *
 * Returns a function matching ErrorHandler's onError signature.
 * Replaces createErrorSlackNotifier from @spfn/notification.
 */
export function createMonitorErrorHandler(options: MonitorErrorHandlerOptions = {})
{
    return async (err: Error, ctx: OnErrorContext) =>
    {
        const minStatus = options.minStatusCode ?? getMinStatusCode();

        if (ctx.statusCode < minStatus)
        {
            return;
        }

        const trackingCtx: ErrorTrackingContext = {
            statusCode: ctx.statusCode,
            path: ctx.path,
            method: ctx.method,
            requestId: ctx.requestId,
            userId: ctx.userId != null ? String(ctx.userId) : undefined,
            headers: ctx.request.headers,
            query: ctx.request.query,
            environment: options.environment,
        };

        const metadata = options.extractMetadata?.(err, trackingCtx);

        try
        {
            await trackError(err, trackingCtx, metadata);
        }
        catch (e)
        {
            logger.warn('Monitor error handler failed', e as Error);
        }
    };
}
