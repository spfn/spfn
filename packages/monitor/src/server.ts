/**
 * @spfn/monitor/server
 *
 * Server-side Only Module
 *
 * Includes:
 * - Router (admin endpoints)
 * - Repositories (error groups, events, logs)
 * - Services (error tracking, logging, stats)
 * - Integrations (error handler, lifecycle)
 * - Entities
 *
 * @example
 * ```typescript
 * import {
 *     createMonitorErrorHandler,
 *     createMonitorLifecycle,
 *     monitorRouter,
 *     writeLog,
 * } from '@spfn/monitor/server';
 *
 * export default defineServerConfig()
 *     .middleware({ onError: createMonitorErrorHandler() })
 *     .routes(mergeRouters(appRouter, monitorRouter))
 *     .lifecycle(createMonitorLifecycle())
 *     .build();
 * ```
 */

// ============================================================================
// Configuration (side-effect: validates env)
// ============================================================================
import '@spfn/monitor/config';

// ============================================================================
// Router
// ============================================================================
export { monitorRouter } from './server/routes';

// ============================================================================
// Integration
// ============================================================================
export { createMonitorErrorHandler } from './server/integrations/error-handler';
export { createMonitorLifecycle } from './server/lifecycle';

// ============================================================================
// Services (Business Logic)
// ============================================================================
export {
    trackError,
    updateErrorGroupStatus,
    generateFingerprint,
    writeLog,
    queryLogs,
    setLogStore,
    getLogStore,
    getMonitorStats,
} from './server/services';

// ============================================================================
// Repositories
// ============================================================================
export {
    errorGroupsRepository,
    errorEventsRepository,
    logsRepository,
} from './server/repositories';

// ============================================================================
// Entities
// ============================================================================
export * from './server/entities';

// ============================================================================
// Types
// ============================================================================
export type * from './server/types';

// ============================================================================
// Logger
// ============================================================================
export { monitorLogger } from './server/logger';

// ============================================================================
// Convenience: monitor namespace
// ============================================================================
import { writeLog } from './server/services';

/**
 * Convenience namespace for quick logging
 *
 * @example
 * ```typescript
 * import { monitor } from '@spfn/monitor/server';
 *
 * await monitor.log({
 *     level: 'info',
 *     message: 'User signed up',
 *     source: 'auth',
 *     metadata: { userId: 123 },
 * });
 * ```
 */
export const monitor = {
    log: writeLog,
};
