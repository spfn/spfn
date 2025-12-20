/**
 * Built-in Notification Providers
 */

import type { WorkflowEvent, WorkflowEventType } from '../builder/types';
import type { NotificationProvider } from './types';

/**
 * Console notification provider
 *
 * Logs workflow events to console
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
 * Email provider configuration
 */
export interface EmailProviderConfig
{
    /**
     * Recipient email addresses
     */
    to: string[];

    /**
     * Sender email address
     */
    from: string;

    /**
     * Email subject template (optional)
     * Supports placeholders: {workflowName}, {type}, {executionId}
     */
    subject?: string;

    /**
     * Send function (integrate with your email service)
     */
    send: (options: {
        to: string[];
        from: string;
        subject: string;
        body: string;
    }) => Promise<void>;
}

/**
 * Create an email notification provider
 *
 * @example
 * ```typescript
 * import { sendEmail } from '@spfn/auth';
 *
 * const emailNotifier = emailProvider({
 *     to: ['admin@example.com'],
 *     from: 'noreply@example.com',
 *     send: async ({ to, from, subject, body }) => {
 *         await sendEmail({ to: to[0], from, subject, body });
 *     },
 * });
 *
 * workflow('provision')
 *     .notify({
 *         on: ['failed'],
 *         providers: [emailNotifier],
 *     });
 * ```
 */
export function emailProvider(config: EmailProviderConfig): NotificationProvider
{
    return {
        name: 'email',
        async notify(event: WorkflowEvent): Promise<void>
        {
            const subject = (config.subject ?? 'Workflow {workflowName}: {type}')
                .replace('{workflowName}', event.workflowName)
                .replace('{type}', event.type)
                .replace('{executionId}', event.executionId);

            const body = formatEventBody(event);

            await config.send({
                to: config.to,
                from: config.from,
                subject,
                body,
            });
        },
    };
}

/**
 * Slack webhook provider configuration
 */
export interface SlackProviderConfig
{
    /**
     * Slack webhook URL
     */
    webhookUrl: string;

    /**
     * Channel to post to (optional, uses webhook default)
     */
    channel?: string;

    /**
     * Username for the bot (optional)
     */
    username?: string;

    /**
     * Icon emoji (optional)
     */
    iconEmoji?: string;
}

/**
 * Create a Slack notification provider
 *
 * @example
 * ```typescript
 * const slackNotifier = slackProvider({
 *     webhookUrl: process.env.SLACK_WEBHOOK_URL!,
 *     channel: '#alerts',
 * });
 *
 * workflow('provision')
 *     .notify({
 *         on: ['failed', 'completed'],
 *         providers: [slackNotifier],
 *     });
 * ```
 */
export function slackProvider(config: SlackProviderConfig): NotificationProvider
{
    return {
        name: 'slack',
        async notify(event: WorkflowEvent): Promise<void>
        {
            const color = getEventColor(event.type);
            const text = formatEventText(event);

            const payload: Record<string, unknown> = {
                attachments: [
                    {
                        color,
                        title: `Workflow: ${event.workflowName}`,
                        text,
                        fields: [
                            {
                                title: 'Event',
                                value: event.type,
                                short: true,
                            },
                            {
                                title: 'Execution ID',
                                value: event.executionId,
                                short: true,
                            },
                        ],
                        ts: Math.floor(event.timestamp.getTime() / 1000),
                    },
                ],
            };

            if (config.channel)
            {
                payload.channel = config.channel;
            }
            if (config.username)
            {
                payload.username = config.username;
            }
            if (config.iconEmoji)
            {
                payload.icon_emoji = config.iconEmoji;
            }

            await fetch(config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        },
    };
}

/**
 * Get color for event type (Slack attachment)
 */
function getEventColor(type: WorkflowEventType): string
{
    switch (type)
    {
        case 'completed':
        case 'step.completed':
            return 'good'; // green
        case 'failed':
        case 'step.failed':
            return 'danger'; // red
        case 'cancelled':
            return 'warning'; // yellow
        case 'started':
        case 'step.started':
            return '#439FE0'; // blue
    }
}

/**
 * Format event as text
 */
function formatEventText(event: WorkflowEvent): string
{
    switch (event.type)
    {
        case 'started':
            return `Workflow started`;
        case 'completed':
            return `Workflow completed successfully`;
        case 'failed':
            return `Workflow failed: ${event.error}`;
        case 'cancelled':
            return `Workflow was cancelled`;
        case 'step.started':
            return `Step '${event.stepName}' started`;
        case 'step.completed':
            return `Step '${event.stepName}' completed`;
        case 'step.failed':
            return `Step '${event.stepName}' failed: ${event.error}`;
    }
}

/**
 * Format event as email body
 */
function formatEventBody(event: WorkflowEvent): string
{
    const lines = [
        `Workflow: ${event.workflowName}`,
        `Event: ${event.type}`,
        `Execution ID: ${event.executionId}`,
        `Timestamp: ${event.timestamp.toISOString()}`,
    ];

    if ('stepName' in event && event.stepName)
    {
        lines.push(`Step: ${event.stepName}`);
    }
    if ('error' in event && event.error)
    {
        lines.push(`Error: ${event.error}`);
    }

    return lines.join('\n');
}
