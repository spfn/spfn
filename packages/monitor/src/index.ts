/**
 * @spfn/monitor
 *
 * Error tracking, log management, and monitoring dashboard for SPFN
 *
 * @example
 * ```typescript
 * // Server-side
 * import { monitorRouter, createMonitorErrorHandler } from '@spfn/monitor/server';
 *
 * // Client-side (API calls)
 * import { monitorApi } from '@spfn/monitor';
 * const stats = await monitorApi.getStats.call({});
 * ```
 */

// ============================================================================
// API Client
// ============================================================================
import { createApi } from '@spfn/core/nextjs';
import { monitorRouter } from './server/routes';

/**
 * Type-safe API client for monitor routes
 *
 * @example
 * ```typescript
 * import { monitorApi } from '@spfn/monitor';
 *
 * // Get dashboard stats
 * const stats = await monitorApi.getStats.call({});
 *
 * // List errors
 * const errors = await monitorApi.listErrors.call({
 *     query: { status: 'active', limit: 20 }
 * });
 * ```
 */
export const monitorApi = createApi<typeof monitorRouter>({});

// Router type for external use
export type MonitorRouter = typeof monitorRouter;

// ============================================================================
// Shared Types (client-safe)
// ============================================================================
export type {
    ErrorGroupStatus,
    LogLevel,
} from './server/entities';

export type { MonitorStats } from './server/services/stats.service';

export {
    ERROR_GROUP_STATUSES,
    LOG_LEVELS,
} from './server/entities';
