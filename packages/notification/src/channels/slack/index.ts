/**
 * @spfn/notification - Slack Channel
 */

import type { SendSlackParams, SlackProvider, InternalSendSlackParams } from './types';
import type { SendResult } from '../types';
import type { Notification } from '../../entities';
import { webhookProvider } from './providers/webhook';
import { env, isHistoryEnabled } from '../../config';
import { renderTemplate, hasTemplate } from '../../templates';
import {
    createNotificationRecord,
    createNotificationRecords,
    markNotificationSent,
    markNotificationFailed,
} from '../../services/notification.service';
import { runWithConcurrency } from '../concurrency';
import { sendBulkSlackItemJob } from '../../jobs/send-bulk-slack-item';
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
 * Bulk Slack result
 */
export interface BulkSlackResult
{
    results: SendResult[];
    successCount: number;
    failureCount: number;
    batchId: string;
}

/**
 * Prepared Slack item (after template rendering + validation)
 */
interface PreparedSlack
{
    index: number;
    params: InternalSendSlackParams;
    webhookUrl: string;
    template?: string;
    data?: Record<string, unknown>;
    text?: string;
}

/**
 * Bulk Slack options
 */
export interface BulkSlackOptions
{
    concurrency?: number;
    distributed?: boolean;
}

/**
 * Send bulk Slack messages with batch DB insert and concurrent sending.
 *
 * @param items - Slack items to send
 * @param options - concurrency, distributed
 */
export async function sendSlackBulk(
    items: SendSlackParams[],
    options?: BulkSlackOptions
): Promise<BulkSlackResult>
{
    if (items.length === 0)
    {
        return { results: [], successCount: 0, failureCount: 0, batchId: '' };
    }

    const batchId = crypto.randomUUID();
    const provider = getProvider();

    // 1. Validate and prepare all items
    const prepared: PreparedSlack[] = [];
    const earlyFailures: { index: number; result: SendResult }[] = [];

    for (let i = 0; i < items.length; i++)
    {
        const item = items[i];
        const webhookUrl = resolveWebhookUrl(item);

        if (!webhookUrl)
        {
            earlyFailures.push({ index: i, result: { success: false, error: 'Slack webhook URL is required. Set SPFN_NOTIFICATION_SLACK_WEBHOOK_URL or pass webhookUrl.' } });
            continue;
        }

        let text = item.text;
        let blocks = item.blocks;

        if (item.template)
        {
            if (!hasTemplate(item.template))
            {
                earlyFailures.push({ index: i, result: { success: false, error: `Template not found: ${item.template}` } });
                continue;
            }

            const rendered = renderTemplate(item.template, item.data || {}, 'slack');

            if (rendered.slack)
            {
                text = rendered.slack.text;
                blocks = rendered.slack.blocks;
            }
        }

        if (!text && !blocks)
        {
            earlyFailures.push({ index: i, result: { success: false, error: 'Slack message requires text or blocks' } });
            continue;
        }

        prepared.push({
            index: i,
            params: { webhookUrl, text, blocks },
            webhookUrl,
            template: item.template,
            data: item.data,
            text,
        });
    }

    // 2. Batch create notification records
    let historyRecords: Notification[] = [];

    if (isHistoryEnabled() && prepared.length > 0)
    {
        try
        {
            historyRecords = await createNotificationRecords(
                prepared.map((p) => ({
                    channel: 'slack' as const,
                    recipient: p.webhookUrl,
                    templateName: p.template,
                    templateData: p.data,
                    content: p.text,
                    providerName: provider.name,
                    batchId,
                }))
            );
        }
        catch (error)
        {
            log.warn('Failed to batch create notification history records', error as Error);
        }
    }

    // 3. Distributed mode: enqueue to pg-boss
    if (options?.distributed)
    {
        const jobInputs = prepared.map((p, i) => ({
            notificationId: historyRecords[i]?.id ?? 0,
            webhookUrl: p.webhookUrl,
            text: p.text,
            blocks: p.params.blocks,
        }));

        await sendBulkSlackItemJob.sendBatch(jobInputs);

        log.info('Bulk Slack enqueued for distributed processing', {
            batchId,
            total: items.length,
            enqueued: prepared.length,
            earlyFailures: earlyFailures.length,
        });

        const results: SendResult[] = new Array(items.length);

        for (const { index, result } of earlyFailures)
        {
            results[index] = result;
        }

        for (const p of prepared)
        {
            if (!results[p.index])
            {
                results[p.index] = { success: true, messageId: `pending:${batchId}` };
            }
        }

        return {
            results,
            successCount: prepared.length,
            failureCount: earlyFailures.length,
            batchId,
        };
    }

    // 4. In-process mode: send with concurrency control
    const concurrency = options?.concurrency ?? 10;

    const sendResults = await runWithConcurrency(
        prepared,
        (p) => provider.send(p.params),
        concurrency
    );

    // 5. Build results + update history records
    const results: SendResult[] = new Array(items.length);
    let successCount = 0;
    let failureCount = earlyFailures.length;

    for (const { index, result } of earlyFailures)
    {
        results[index] = result;
    }

    const historyUpdates: Promise<unknown>[] = [];

    for (let i = 0; i < prepared.length; i++)
    {
        const { index } = prepared[i];
        const result = sendResults[i];
        results[index] = result;

        if (result.success)
        {
            successCount++;
            log.info('Slack message sent');
        }
        else
        {
            failureCount++;
            log.error('Slack send failed', { error: result.error });
        }

        const historyId = historyRecords[i]?.id;

        if (historyId && isHistoryEnabled())
        {
            const promise = result.success
                ? markNotificationSent(historyId, result.messageId)
                : markNotificationFailed(historyId, result.error || 'Unknown error');

            historyUpdates.push(
                promise.catch((err) => log.warn('Failed to update notification history', err))
            );
        }
    }

    await Promise.all(historyUpdates);

    return { results, successCount, failureCount, batchId };
}
