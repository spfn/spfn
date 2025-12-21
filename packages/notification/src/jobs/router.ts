/**
 * @spfn/notification - Job Router
 */

import { defineJobRouter } from '@spfn/core/job';
import { sendScheduledEmailJob } from './send-scheduled-email';
import { sendScheduledSmsJob } from './send-scheduled-sms';

/**
 * Notification job router
 *
 * Register this with your server config:
 * @example
 * ```typescript
 * import { notificationJobRouter } from '@spfn/notification/server';
 *
 * defineServerConfig()
 *     .routes(appRouter)
 *     .jobs(defineJobRouter({
 *         notification: notificationJobRouter,
 *         // ... other jobs
 *     }))
 *     .build();
 * ```
 */
export const notificationJobRouter = defineJobRouter({
    sendScheduledEmail: sendScheduledEmailJob,
    sendScheduledSms: sendScheduledSmsJob,
});
