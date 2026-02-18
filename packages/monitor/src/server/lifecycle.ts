/**
 * @spfn/monitor - Server Lifecycle Hooks
 *
 * Provides lifecycle hooks for SPFN server initialization
 */

import { monitorLogger } from './logger';

const logger = monitorLogger.lifecycle;

/**
 * Monitor lifecycle configuration
 */
export interface MonitorLifecycleConfig
{
    afterInfrastructure?: () => Promise<void>;
}

/**
 * Create monitor lifecycle hooks for server configuration
 *
 * @example
 * ```typescript
 * import { defineServerConfig } from '@spfn/core/server';
 * import { createMonitorLifecycle, monitorRouter } from '@spfn/monitor/server';
 *
 * export default defineServerConfig()
 *     .routes(appRouter)
 *     .lifecycle(createMonitorLifecycle())
 *     .build();
 * ```
 */
export function createMonitorLifecycle(): MonitorLifecycleConfig
{
    return {
        afterInfrastructure: async () =>
        {
            logger.info('@spfn/monitor initialized — error tracking and logging active');
        },
    };
}
