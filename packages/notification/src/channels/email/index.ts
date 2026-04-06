/**
 * @spfn/notification - Email Channel
 */

import type { SendEmailParams, EmailProvider, InternalSendEmailParams } from './types';
import type { SendResult } from '../types';
import type { Notification } from '../../entities';
import { awsSesProvider } from './providers/aws-ses';
import { getEmailFrom, getEmailReplyTo, env, isHistoryEnabled, isTrackingEnabled, getTrackingBaseUrl } from '../../config';
import { processTrackingHtml } from '../../tracking/processor';
import { renderTemplate, hasTemplate } from '../../templates';
import {
    createNotificationRecord,
    createNotificationRecords,
    markNotificationSent,
    markNotificationFailed,
} from '../../services/notification.service';
import { runWithConcurrency } from '../concurrency';
import { sendBulkEmailItemJob } from '../../jobs/send-bulk-email-item';
import { logger } from '@spfn/core/logger';

const log = logger.child('@spfn/notification:email');

export type { SendEmailParams, EmailProvider, InternalSendEmailParams };

/**
 * Available email providers
 */
const providers: Record<string, EmailProvider> = {
    'aws-ses': awsSesProvider,
};

/**
 * Register custom email provider
 */
export function registerEmailProvider(provider: EmailProvider): void
{
    providers[provider.name] = provider;
}

/**
 * Get current email provider
 */
function getProvider(): EmailProvider
{
    const providerName = env.SPFN_NOTIFICATION_EMAIL_PROVIDER || 'aws-ses';
    const provider = providers[providerName];

    if (!provider)
    {
        throw new Error(`Email provider not found: ${providerName}`);
    }

    return provider;
}

/**
 * Send email
 */
export async function sendEmail(params: SendEmailParams): Promise<SendResult>
{
    // Prepare recipients
    const recipients = Array.isArray(params.to) ? params.to : [params.to];

    // Prepare content
    let subject = params.subject;
    let text = params.text;
    let html = params.html;

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

        const rendered = renderTemplate(params.template, params.data || {}, 'email');

        if (rendered.email)
        {
            subject = rendered.email.subject;
            text = rendered.email.text;
            html = rendered.email.html;
        }
    }

    // Validate required fields
    if (!subject)
    {
        log.warn('Email subject is required', { to: recipients });
        return {
            success: false,
            error: 'Email subject is required',
        };
    }

    if (!text && !html)
    {
        log.warn('Email content (text or html) is required', { to: recipients, subject });
        return {
            success: false,
            error: 'Email content (text or html) is required',
        };
    }

    // Build internal params
    const internalParams: InternalSendEmailParams = {
        to: recipients,
        from: params.from || getEmailFrom(),
        replyTo: params.replyTo || getEmailReplyTo(),
        subject,
        text,
        html,
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
                channel: 'email',
                recipient: recipients.join(','),
                templateName: params.template,
                templateData: params.data,
                subject,
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

    // Apply tracking if enabled
    const shouldTrack = params.tracking ?? isTrackingEnabled();
    const trackingBaseUrl = getTrackingBaseUrl();

    if (shouldTrack && historyId && internalParams.html && trackingBaseUrl)
    {
        try
        {
            const { html: trackedHtml } = processTrackingHtml(internalParams.html, {
                notificationId: historyId,
                baseUrl: trackingBaseUrl,
            });
            internalParams.html = trackedHtml;
        }
        catch (error)
        {
            log.warn('Failed to apply tracking to email HTML', error as Error);
        }
    }

    // Send via provider
    const result = await provider.send(internalParams);

    if (result.success)
    {
        log.info('Email sent', { to: recipients, subject, messageId: result.messageId });
    }
    else
    {
        log.error('Email send failed', { to: recipients, subject, error: result.error });
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
 * Bulk email result
 */
export interface BulkEmailResult
{
    results: SendResult[];
    successCount: number;
    failureCount: number;
    batchId: string;
}

/**
 * Prepared email item (after template rendering + validation)
 */
interface PreparedEmail
{
    index: number;
    params: InternalSendEmailParams;
    recipients: string[];
    template?: string;
    data?: Record<string, unknown>;
    subject: string;
    text?: string;
    tracking?: boolean;
}

/**
 * Bulk email options
 */
export interface BulkEmailOptions
{
    /**
     * Max parallel sends when processing in-process (default: 10)
     */
    concurrency?: number;

    /**
     * When true, enqueue to pg-boss for distributed processing across instances.
     * Returns immediately with pending results — actual sending happens in background.
     * Requires notificationJobRouter to be registered.
     * @default false
     */
    distributed?: boolean;
}

/**
 * Validate and prepare all email items.
 * Shared between in-process and distributed modes.
 */
function prepareEmailItems(items: SendEmailParams[]): {
    prepared: PreparedEmail[];
    earlyFailures: { index: number; result: SendResult }[];
}
{
    const prepared: PreparedEmail[] = [];
    const earlyFailures: { index: number; result: SendResult }[] = [];

    for (let i = 0; i < items.length; i++)
    {
        const item = items[i];
        const recipients = Array.isArray(item.to) ? item.to : [item.to];

        let subject = item.subject;
        let text = item.text;
        let html = item.html;

        if (item.template)
        {
            if (!hasTemplate(item.template))
            {
                earlyFailures.push({ index: i, result: { success: false, error: `Template not found: ${item.template}` } });
                continue;
            }

            const rendered = renderTemplate(item.template, item.data || {}, 'email');

            if (rendered.email)
            {
                subject = rendered.email.subject;
                text = rendered.email.text;
                html = rendered.email.html;
            }
        }

        if (!subject)
        {
            earlyFailures.push({ index: i, result: { success: false, error: 'Email subject is required' } });
            continue;
        }

        if (!text && !html)
        {
            earlyFailures.push({ index: i, result: { success: false, error: 'Email content (text or html) is required' } });
            continue;
        }

        prepared.push({
            index: i,
            params: {
                to: recipients,
                from: item.from || getEmailFrom(),
                replyTo: item.replyTo || getEmailReplyTo(),
                subject,
                text,
                html,
            },
            recipients,
            template: item.template,
            data: item.data,
            subject,
            text,
            tracking: item.tracking,
        });
    }

    return { prepared, earlyFailures };
}

/**
 * Send bulk emails with batch DB insert and concurrent sending.
 *
 * @param items - Email items to send
 * @param options - concurrency, distributed
 */
export async function sendEmailBulk(
    items: SendEmailParams[],
    options?: BulkEmailOptions
): Promise<BulkEmailResult>
{
    if (items.length === 0)
    {
        return { results: [], successCount: 0, failureCount: 0, batchId: '' };
    }

    const batchId = crypto.randomUUID();
    const provider = getProvider();

    // 1. Validate and prepare all items
    const { prepared, earlyFailures } = prepareEmailItems(items);

    // 2. Batch create notification records
    let historyRecords: Notification[] = [];

    if (isHistoryEnabled() && prepared.length > 0)
    {
        try
        {
            historyRecords = await createNotificationRecords(
                prepared.map((p) => ({
                    channel: 'email' as const,
                    recipient: p.recipients.join(','),
                    templateName: p.template,
                    templateData: p.data,
                    subject: p.subject,
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

    // 3. Apply tracking per email
    const shouldTrackGlobal = isTrackingEnabled();
    const trackingBaseUrl = getTrackingBaseUrl();

    for (let i = 0; i < prepared.length; i++)
    {
        const p = prepared[i];
        const historyId = historyRecords[i]?.id;
        const shouldTrack = p.tracking ?? shouldTrackGlobal;

        if (shouldTrack && historyId && p.params.html && trackingBaseUrl)
        {
            try
            {
                const { html } = processTrackingHtml(p.params.html, {
                    notificationId: historyId,
                    baseUrl: trackingBaseUrl,
                });
                p.params.html = html;
            }
            catch (error)
            {
                log.warn('Failed to apply tracking to email HTML', error as Error);
            }
        }
    }

    // 4. Distributed mode: enqueue to pg-boss and return immediately
    if (options?.distributed)
    {
        const jobInputs = prepared.map((p, i) => ({
            notificationId: historyRecords[i]?.id ?? 0,
            to: p.params.to,
            from: p.params.from,
            replyTo: p.params.replyTo,
            subject: p.params.subject,
            text: p.params.text,
            html: p.params.html,
        }));

        await sendBulkEmailItemJob.sendBatch(jobInputs);

        log.info('Bulk email enqueued for distributed processing', {
            batchId,
            total: items.length,
            enqueued: prepared.length,
            earlyFailures: earlyFailures.length,
        });

        // Return pending results — actual send happens via pg-boss workers
        const results: SendResult[] = new Array(items.length);

        for (const { index, result } of earlyFailures)
        {
            results[index] = result;
        }

        for (const p of prepared)
        {
            results[p.index] = { success: true, messageId: `pending:${batchId}` };
        }

        return {
            results,
            successCount: prepared.length,
            failureCount: earlyFailures.length,
            batchId,
        };
    }

    // 5. In-process mode: send with concurrency control
    const concurrency = options?.concurrency ?? 10;

    const sendResults = await runWithConcurrency(
        prepared,
        (p) => provider.send(p.params),
        concurrency
    );

    // 6. Build results + update history records
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
        const { index, recipients, subject } = prepared[i];
        const result = sendResults[i];
        results[index] = result;

        if (result.success)
        {
            successCount++;
            log.info('Email sent', { to: recipients, subject, messageId: result.messageId });
        }
        else
        {
            failureCount++;
            log.error('Email send failed', { to: recipients, subject, error: result.error });
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
