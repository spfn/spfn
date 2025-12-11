/**
 * Job Router
 *
 * Combines all job definitions for server registration
 */

import { defineJobRouter } from '@spfn/core/job';
import {
    onExampleCreated,
    onExampleUpdated,
    onExampleDeleted,
    sendNotification,
    cleanupOldData,
    initializeCache,
} from './example.jobs';

/**
 * Main job router
 *
 * Register with server config:
 * ```typescript
 * defineServerConfig()
 *     .routes(appRouter)
 *     .jobs(jobRouter)
 *     .build();
 * ```
 */
export const jobRouter = defineJobRouter({
    // Event-triggered jobs
    onExampleCreated,
    onExampleUpdated,
    onExampleDeleted,

    // Standard jobs
    sendNotification,

    // Scheduled jobs
    cleanupOldData,

    // Run-once jobs
    initializeCache,
});

export type JobRouter = typeof jobRouter;
