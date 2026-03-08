/**
 * @spfn/notification - Email Channel
 */

import type { SendEmailParams, EmailProvider, InternalSendEmailParams } from './types';
import type { SendResult } from '../types';
import { awsSesProvider } from './providers/aws-ses';
import { getEmailFrom, getEmailReplyTo, env, isHistoryEnabled, isTrackingEnabled, getTrackingBaseUrl } from '../../config';
import { processTrackingHtml } from '../../tracking/processor';
import { renderTemplate, hasTemplate } from '../../templates';
import {
    createNotificationRecord,
    markNotificationSent,
    markNotificationFailed,
} from '../../services/notification.service';
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
 * Send bulk emails
 */
export async function sendEmailBulk(
    items: SendEmailParams[]
): Promise<{ results: SendResult[]; successCount: number; failureCount: number }>
{
    const results: SendResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const item of items)
    {
        const result = await sendEmail(item);
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
