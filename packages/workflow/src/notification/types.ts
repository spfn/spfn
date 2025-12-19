/**
 * Notification System Types
 */

import type { WorkflowEvent } from '../builder/types';

/**
 * Notification provider interface
 *
 * @example
 * ```typescript
 * const slackProvider: NotificationProvider = {
 *     name: 'slack',
 *     notify: async (event) => {
 *         await slack.send({
 *             channel: '#alerts',
 *             text: `Workflow ${event.workflowName} ${event.type}`,
 *         });
 *     },
 * };
 * ```
 */
export interface NotificationProvider
{
    /**
     * Provider name (for logging)
     */
    name: string;

    /**
     * Send notification
     */
    notify(event: WorkflowEvent): Promise<void>;
}

/**
 * Notification configuration for workflow
 */
export interface NotifyConfig
{
    /**
     * Event types to notify on
     */
    on: WorkflowEventType[];

    /**
     * Conditional notification (optional)
     */
    when?: (event: WorkflowEvent) => boolean;

    /**
     * Notification providers
     */
    providers: NotificationProvider[];
}

/**
 * Workflow event types for notification
 */
export type WorkflowEventType =
    | 'started'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'step.started'
    | 'step.completed'
    | 'step.failed';
