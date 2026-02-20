/**
 * @spfn/notification - Slack Channel
 */

import type { SendSlackParams, SlackProvider, InternalSendSlackParams } from './types';
import type { SendResult } from '../types';
import { webhookProvider } from './providers/webhook';
import { env, isHistoryEnabled } from '../../config';
import { renderTemplate, hasTemplate } from '../../templates';
import {
    createNotificationRecord,
    markNotificationSent,
    markNotificationFailed,
} from '../../services/notification.service';
import { logger } from '@spfn/core/logger';

const log = logger.child('@spfn/notification:slack');

export type { SendSlackParams, SlackProvider, InternalSendSlackParams };

/**
 * Available Slack providers
 */
const providers: Record<string, SlackProvider> = {
    'webhook': webhookProvider,
};

/**
 * Register custom Slack provider
 */
export function registerSlackProvider(provider: SlackProvider): void
{
    providers[provider.name] = provider;
}

/**
 * Get current Slack provider
 */
function getProvider(): SlackProvider
{
    return providers['webhook'];
}

/**
 * Resolve webhook URL from params → config → env
 */
function resolveWebhookUrl(params: SendSlackParams): string | undefined
{
    return params.webhookUrl
        || env.SPFN_NOTIFICATION_SLACK_WEBHOOK_URL;
}

/**
 * Send Slack message
 */
export async function sendSlack(params: SendSlackParams): Promise<SendResult>
{
    const webhookUrl = resolveWebhookUrl(params);

    if (!webhookUrl)
    {
        log.warn('Slack webhook URL is required');
        return {
            success: false,
            error: 'Slack webhook URL is required. Set SPFN_NOTIFICATION_SLACK_WEBHOOK_URL or pass webhookUrl.',
        };
    }

    // Prepare content
    let text = params.text;
    let blocks = params.blocks;

    // Render template if specified
    if (params.template)
    {
        if (!hasTemplate(params.template))
        {
            log.warn(`Template not found: ${params.template}`);
            return {
                success: false,
                error: `Template not found: ${params.template}`,
            };
        }

        const rendered = renderTemplate(params.template, params.data || {}, 'slack');

        if (rendered.slack)
        {
            text = rendered.slack.text;
            blocks = rendered.slack.blocks;
        }
    }

    // Validate required fields
    if (!text && !blocks)
    {
        log.warn('Slack message requires text or blocks');
        return {
            success: false,
            error: 'Slack message requires text or blocks',
        };
    }

    // Build internal params
    const internalParams: InternalSendSlackParams = {
        webhookUrl,
        text,
        blocks,
    };

    // Get provider
    const provider = getProvider();

    // Create history record if enabled
    let historyId: number | undefined;
    if (isHistoryEnabled())
    {
        try
        {
            const record = await createNotificationRecord({
                channel: 'slack',
                recipient: webhookUrl,
                templateName: params.template,
                templateData: params.data,
                content: text,
                providerName: provider.name,
            });
            historyId = record.id;
        }
        catch (error)
        {
            log.warn('Failed to create notification history record', error as Error);
        }
    }

    // Send via provider
    const result = await provider.send(internalParams);

    if (result.success)
    {
        log.info('Slack message sent');
    }
    else
    {
        log.error('Slack send failed', { error: result.error });
    }

    // Update history record
    if (historyId && isHistoryEnabled())
    {
        try
        {
            if (result.success)
            {
                await markNotificationSent(historyId, result.messageId);
            }
            else
            {
                await markNotificationFailed(historyId, result.error || 'Unknown error');
            }
        }
        catch (error)
        {
            log.warn('Failed to update notification history record', error as Error);
        }
    }

    return result;
}

/**
 * Send bulk Slack messages
 */
export async function sendSlackBulk(
    items: SendSlackParams[]
): Promise<{ results: SendResult[]; successCount: number; failureCount: number }>
{
    const results: SendResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const item of items)
    {
        const result = await sendSlack(item);
        results.push(result);

        if (result.success)
        {
            successCount++;
        }
        else
        {
            failureCount++;
        }
    }

    return { results, successCount, failureCount };
}
