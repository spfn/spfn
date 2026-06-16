/**
 * @spfn/notification - Schedule Service
 *
 * Schedule notifications for later delivery
 */

import type { SendEmailParams } from '../channels/email/types';
import type { SendSMSParams } from '../channels/sms/types';
import { hasTemplate, renderTemplate } from '../templates';
import {
    createScheduledNotification,
    updateNotificationJobId,
} from './notification.service';
import { sendScheduledEmailJob } from '../jobs/send-scheduled-email';
import { sendScheduledSmsJob } from '../jobs/send-scheduled-sms';
import { normalizePhoneNumber } from '../channels/sms/utils';

/**
 * Schedule options
 */
export interface ScheduleOptions
{
    /**
     * When to send
     */
    scheduledAt: Date;

    /**
     * Reference to related entity
     */
    referenceType?: string;
    referenceId?: string;
}

/**
 * Result of scheduling
 */
export interface ScheduleResult
{
    success: boolean;
    notificationId?: number;
    jobId?: string;
    error?: string;
}

/**
 * Schedule email for later delivery
 */
export async function scheduleEmail(
    params: SendEmailParams,
    options: ScheduleOptions,
): Promise<ScheduleResult>
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
        return {
            success: false,
            error: 'Email subject is required',
        };
    }

    if (!text && !html)
    {
        return {
            success: false,
            error: 'Email content (text or html) is required',
        };
    }

    try
    {
        // Create scheduled notification record
        const notification = await createScheduledNotification({
            channel: 'email',
            recipient: recipients.join(','),
            templateName: params.template,
            templateData: params.data,
            subject,
            content: text,
            providerName: 'pending', // Will be set when job runs
            scheduledAt: options.scheduledAt,
            referenceType: options.referenceType,
            referenceId: options.referenceId,
        });

        // Schedule job with pg-boss
        const jobId = await sendScheduledEmailJob.send(
            {
                notificationId: notification.id,
                to: params.to,
                subject: params.subject,
                template: params.template,
                data: params.data,
                text: params.text,
                html: params.html,
                from: params.from,
                replyTo: params.replyTo,
            },
            { startAfter: options.scheduledAt },
        );

        // Update notification with job ID
        if (jobId)
        {
            await updateNotificationJobId(notification.id, jobId);
        }

        return {
            success: true,
            notificationId: notification.id,
            jobId: jobId || undefined,
        };
    }
    catch (error)
    {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to schedule email',
        };
    }
}

/**
 * Schedule SMS for later delivery
 */
export async function scheduleSMS(
    params: SendSMSParams,
    options: ScheduleOptions,
): Promise<ScheduleResult>
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

    try
    {
        // Normalize phone numbers
        const normalizedRecipients = recipients.map(r => normalizePhoneNumber(r));

        // Create scheduled notification record
        const notification = await createScheduledNotification({
            channel: 'sms',
            recipient: normalizedRecipients.join(','),
            templateName: params.template,
            templateData: params.data,
            content: message,
            providerName: 'pending', // Will be set when job runs
            scheduledAt: options.scheduledAt,
            referenceType: options.referenceType,
            referenceId: options.referenceId,
        });

        // Schedule job with pg-boss
        const jobId = await sendScheduledSmsJob.send(
            {
                notificationId: notification.id,
                to: params.to,
                message: params.message,
                template: params.template,
                data: params.data,
            },
            { startAfter: options.scheduledAt },
        );

        // Update notification with job ID
        if (jobId)
        {
            await updateNotificationJobId(notification.id, jobId);
        }

        return {
            success: true,
            notificationId: notification.id,
            jobId: jobId || undefined,
        };
    }
    catch (error)
    {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to schedule SMS',
        };
    }
}
