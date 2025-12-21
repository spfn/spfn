/**
 * @spfn/notification - SMS Channel
 */

import type { SendSMSParams, SMSProvider, InternalSendSMSParams } from './types';
import type { SendResult } from '../types';
import { awsSnsProvider } from './providers/aws-sns';
import { env, isHistoryEnabled } from '../../config';
import { renderTemplate, hasTemplate } from '../../templates';
import {
    createNotificationRecord,
    markNotificationSent,
    markNotificationFailed,
} from '../../services/notification.service';
import { normalizePhoneNumber } from './utils';

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
            catch
            {
                // Ignore history errors - don't fail the send
            }
        }

        const result = await provider.send(internalParams);

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
            catch
            {
                // Ignore history errors
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
 * Send bulk SMS
 */
export async function sendSMSBulk(
    items: SendSMSParams[]
): Promise<{ results: SendResult[]; successCount: number; failureCount: number }>
{
    const results: SendResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const item of items)
    {
        const result = await sendSMS(item);
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