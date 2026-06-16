/**
 * @spfn/notification - SMS Channel
 */

import type { SendSMSParams, SMSProvider, InternalSendSMSParams } from './types';
import type { SendResult } from '../types';
import type { Notification } from '../../entities';
import { awsSnsProvider } from './providers/aws-sns';
import { env, isHistoryEnabled } from '../../config';
import { renderTemplate, hasTemplate } from '../../templates';
import {
    createNotificationRecord,
    createNotificationRecords,
    markNotificationSent,
    markNotificationFailed,
} from '../../services/notification.service';
import { runWithConcurrency } from '../concurrency';
import { sendBulkSmsItemJob } from '../../jobs/send-bulk-sms-item';
import { normalizePhoneNumber } from './utils';
import { logger } from '@spfn/core/logger';

const log = logger.child('@spfn/notification:sms');

export type { SendSMSParams, SMSProvider, InternalSendSMSParams };
export { normalizePhoneNumber };

/**
 * Available SMS providers
 */
const providers: Record<string, SMSProvider> = {
    'aws-sns': awsSnsProvider,
};

/**
 * Register custom SMS provider
 */
export function registerSMSProvider(provider: SMSProvider): void
{
    providers[provider.name] = provider;
}

/**
 * Get current SMS provider
 */
function getProvider(): SMSProvider
{
    const providerName = env.SPFN_NOTIFICATION_SMS_PROVIDER || 'aws-sns';
    const provider = providers[providerName];

    if (!provider)
    {
        throw new Error(`SMS provider not found: ${providerName}`);
    }

    return provider;
}

/**
 * Send SMS
 */
export async function sendSMS(params: SendSMSParams): Promise<SendResult>
{
    // Prepare recipients
    const recipients = Array.isArray(params.to) ? params.to : [params.to];

    // Prepare content
    let message = params.message;

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

        const rendered = renderTemplate(params.template, params.data || {}, 'sms');

        if (rendered.sms)
        {
            message = rendered.sms.message;
        }
    }

    // Validate required fields
    if (!message)
    {
        log.warn('SMS message is required', { to: recipients });

        return {
            success: false,
            error: 'SMS message is required',
        };
    }

    // Send to each recipient
    const provider = getProvider();
    const results: SendResult[] = [];

    for (const recipient of recipients)
    {
        const normalizedPhone = normalizePhoneNumber(recipient);

        const internalParams: InternalSendSMSParams = {
            to: normalizedPhone,
            message,
        };

        // Create history record if enabled
        let historyId: number | undefined;
        if (isHistoryEnabled())
        {
            try
            {
                const record = await createNotificationRecord({
                    channel: 'sms',
                    recipient: normalizedPhone,
                    templateName: params.template,
                    templateData: params.data,
                    content: message,
                    providerName: provider.name,
                });
                historyId = record.id;
            }
            catch (error)
            {
                log.warn('Failed to create notification history record', error as Error);
            }
        }

        const result = await provider.send(internalParams);

        if (result.success)
        {
            log.info('SMS sent', { to: normalizedPhone, messageId: result.messageId });
        }
        else
        {
            log.error('SMS send failed', { to: normalizedPhone, error: result.error });
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

        results.push(result);
    }

    // Return aggregated result
    const allSuccess = results.every(r => r.success);
    const messageIds = results
        .filter(r => r.messageId)
        .map(r => r.messageId)
        .join(',');
    const errors = results
        .filter(r => r.error)
        .map(r => r.error)
        .join('; ');

    return {
        success: allSuccess,
        messageId: messageIds || undefined,
        error: errors || undefined,
    };
}

/**
 * Bulk SMS result
 */
export interface BulkSMSResult
{
    results: SendResult[];
    successCount: number;
    failureCount: number;
    batchId: string;
}

/**
 * Prepared SMS item (after template rendering + validation + recipient expansion)
 */
interface PreparedSMS
{
    index: number;
    phone: string;
    message: string;
    template?: string;
    data?: Record<string, unknown>;
}

/**
 * Bulk SMS options
 */
export interface BulkSMSOptions
{
    concurrency?: number;
    distributed?: boolean;
}

/**
 * Send bulk SMS with batch DB insert and concurrent sending.
 *
 * @param items - SMS items to send
 * @param options - concurrency, distributed
 */
export async function sendSMSBulk(
    items: SendSMSParams[],
    options?: BulkSMSOptions,
): Promise<BulkSMSResult>
{
    if (items.length === 0)
    {
        return { results: [], successCount: 0, failureCount: 0, batchId: '' };
    }

    const batchId = crypto.randomUUID();
    const provider = getProvider();

    // 1. Validate, render templates, expand recipients
    const prepared: PreparedSMS[] = [];
    const earlyFailures: { index: number; result: SendResult }[] = [];

    for (let i = 0; i < items.length; i++)
    {
        const item = items[i];
        const recipients = Array.isArray(item.to) ? item.to : [item.to];

        let message = item.message;

        if (item.template)
        {
            if (!hasTemplate(item.template))
            {
                earlyFailures.push({ index: i, result: { success: false, error: `Template not found: ${item.template}` } });
                continue;
            }

            const rendered = renderTemplate(item.template, item.data || {}, 'sms');

            if (rendered.sms)
            {
                message = rendered.sms.message;
            }
        }

        if (!message)
        {
            earlyFailures.push({ index: i, result: { success: false, error: 'SMS message is required' } });
            continue;
        }

        for (const recipient of recipients)
        {
            prepared.push({
                index: i,
                phone: normalizePhoneNumber(recipient),
                message,
                template: item.template,
                data: item.data,
            });
        }
    }

    // 2. Batch create notification records
    let historyRecords: Notification[] = [];

    if (isHistoryEnabled() && prepared.length > 0)
    {
        try
        {
            historyRecords = await createNotificationRecords(
                prepared.map((p) => ({
                    channel: 'sms' as const,
                    recipient: p.phone,
                    templateName: p.template,
                    templateData: p.data,
                    content: p.message,
                    providerName: provider.name,
                    batchId,
                })),
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
            to: p.phone,
            message: p.message,
        }));

        await sendBulkSmsItemJob.sendBatch(jobInputs);

        log.info('Bulk SMS enqueued for distributed processing', {
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

        // Aggregate pending results per original item
        const pendingMap = new Map<number, number>();
        for (const p of prepared)
        {
            pendingMap.set(p.index, (pendingMap.get(p.index) ?? 0) + 1);
        }

        for (const [index] of pendingMap)
        {
            if (!results[index])
            {
                results[index] = { success: true, messageId: `pending:${batchId}` };
            }
        }

        return {
            results,
            successCount: pendingMap.size,
            failureCount: earlyFailures.length,
            batchId,
        };
    }

    // 4. In-process mode: send with concurrency control
    const concurrency = options?.concurrency ?? 10;

    const sendResults = await runWithConcurrency(
        prepared,
        (p) => provider.send({ to: p.phone, message: p.message }),
        concurrency,
    );

    // 5. Build per-item aggregated results + update history
    const resultsMap = new Map<number, SendResult[]>();
    const historyUpdates: Promise<unknown>[] = [];

    for (let i = 0; i < prepared.length; i++)
    {
        const { index, phone } = prepared[i];
        const result = sendResults[i];

        if (!resultsMap.has(index))
        {
            resultsMap.set(index, []);
        }
        resultsMap.get(index)!.push(result);

        if (result.success)
        {
            log.info('SMS sent', { to: phone, messageId: result.messageId });
        }
        else
        {
            log.error('SMS send failed', { to: phone, error: result.error });
        }

        const historyId = historyRecords[i]?.id;

        if (historyId && isHistoryEnabled())
        {
            const promise = result.success
                ? markNotificationSent(historyId, result.messageId)
                : markNotificationFailed(historyId, result.error || 'Unknown error');

            historyUpdates.push(
                promise.catch((err) => log.warn('Failed to update notification history', err)),
            );
        }
    }

    await Promise.all(historyUpdates);

    // 6. Aggregate results per original item
    const results: SendResult[] = new Array(items.length);
    let successCount = 0;
    let failureCount = earlyFailures.length;

    for (const { index, result } of earlyFailures)
    {
        results[index] = result;
    }

    for (const [index, itemResults] of resultsMap)
    {
        const allSuccess = itemResults.every(r => r.success);
        const messageIds = itemResults.filter(r => r.messageId).map(r => r.messageId).join(',');
        const errors = itemResults.filter(r => r.error).map(r => r.error).join('; ');

        results[index] = {
            success: allSuccess,
            messageId: messageIds || undefined,
            error: errors || undefined,
        };

        if (allSuccess)
        {
            successCount++;
        }
        else
        {
            failureCount++;
        }
    }

    return { results, successCount, failureCount, batchId };
}
