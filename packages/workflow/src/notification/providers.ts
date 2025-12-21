/**
 * Built-in Notification Providers
 *
 * Only consoleProvider is provided by default.
 * For email, SMS, Slack, etc., implement your own provider using @spfn/notification.
 *
 * @example
 * ```typescript
 * import { sendEmail } from '@spfn/notification/server';
 * import type { NotificationProvider } from '@spfn/workflow';
 *
 * const emailProvider: NotificationProvider = {
 *     name: 'email',
 *     async notify(event) {
 *         await sendEmail({
 *             to: 'admin@example.com',
 *             subject: `[Workflow] ${event.workflowName}: ${event.type}`,
 *             text: formatEventAsText(event),
 *         });
 *     },
 * };
 * ```
 */

import type { WorkflowEvent } from '../builder';
import type { NotificationProvider } from './types';

/**
 * Console notification provider
 *
 * Logs workflow events to console. This is the only built-in provider.
 *
 * @example
 * ```typescript
 * workflow('provision')
 *     .notify({
 *         on: ['failed'],
 *         providers: [consoleProvider],
 *     });
 * ```
 */
export const consoleProvider: NotificationProvider = {
    name: 'console',
    async notify(event: WorkflowEvent): Promise<void>
    {
        const timestamp = event.timestamp.toISOString();
        const prefix = `[Workflow:${event.workflowName}]`;

        switch (event.type)
        {
            case 'started':
                console.log(`${timestamp} ${prefix} Started (id: ${event.executionId})`);
                break;
            case 'completed':
                console.log(`${timestamp} ${prefix} Completed (id: ${event.executionId})`);
                break;
            case 'failed':
                console.error(`${timestamp} ${prefix} Failed: ${event.error} (id: ${event.executionId})`);
                break;
            case 'cancelled':
                console.log(`${timestamp} ${prefix} Cancelled (id: ${event.executionId})`);
                break;
            case 'step.started':
                console.log(`${timestamp} ${prefix} Step '${event.stepName}' started`);
                break;
            case 'step.completed':
                console.log(`${timestamp} ${prefix} Step '${event.stepName}' completed`);
                break;
            case 'step.failed':
                console.error(`${timestamp} ${prefix} Step '${event.stepName}' failed: ${event.error}`);
                break;
        }
    },
};

/**
 * Helper: Format workflow event as plain text
 *
 * Use this when implementing custom notification providers.
 *
 * @example
 * ```typescript
 * import { formatEventAsText } from '@spfn/workflow';
 * import { sendEmail } from '@spfn/notification/server';
 *
 * const emailProvider: NotificationProvider = {
 *     name: 'email',
 *     async notify(event) {
 *         await sendEmail({
 *             to: 'admin@example.com',
 *             subject: `[Workflow] ${event.workflowName}: ${event.type}`,
 *             text: formatEventAsText(event),
 *         });
 *     },
 * };
 * ```
 */
export function formatEventAsText(event: WorkflowEvent): string
{
    const lines = [
        `Workflow: ${event.workflowName}`,
        `Event: ${event.type}`,
        `Execution ID: ${event.executionId}`,
        `Timestamp: ${event.timestamp.toISOString()}`,
    ];

    if (event.stepName)
    {
        lines.push(`Step: ${event.stepName}`);
    }
    if (event.error)
    {
        lines.push(`Error: ${event.error}`);
    }

    return lines.join('\n');
}
