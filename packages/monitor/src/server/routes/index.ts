/**
 * @spfn/monitor - Main Router
 *
 * Combines all monitor-related routes into a single router
 */

import { defineRouter } from '@spfn/core/route';
import {
    listErrors,
    getErrorDetail,
    updateErrorStatus,
    listErrorEvents,
    listLogs,
    getStats,
} from './admin';

/**
 * Monitor router
 *
 * Routes:
 * - Errors: /_monitor/admin/errors (list, detail, status update, events)
 * - Logs: /_monitor/admin/logs
 * - Stats: /_monitor/admin/stats
 */
export const monitorRouter = defineRouter({
    listErrors,
    getErrorDetail,
    updateErrorStatus,
    listErrorEvents,
    listLogs,
    getStats,
});

export default monitorRouter;
