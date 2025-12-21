/**
 * @spfn/notification - Scheduled Email Job
 */

import { job } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';
import { sendEmail } from '../channels/email';
import {
    markNotificationPending,
    markNotificationSent,
    markNotificationFailed,
} from '../services/notification.service';

/**
 * Job input schema
 */
const SendScheduledEmailInput = Type.Object({
    notificationId: Type.Number(),
    to: Type.Union([Type.String(), Type.Array(Type.String())]),
    subject: Type.Optional(Type.String()),
    template: Type.Optional(Type.String()),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    text: Type.Optional(Type.String()),
    html: Type.Optional(Type.String()),
    from: Type.Optional(Type.String()),
    replyTo: Type.Optional(Type.String()),
});

/**
 * Scheduled email sending job
 */
export const sendScheduledEmailJob = job('notification.send-scheduled-email')
    .input(SendScheduledEmailInput)
    .options({
        retryLimit: 3,
        retryDelay: 5000,
    })
    .handler(async (input) =>
    {
        const { notificationId, ...emailParams } = input;

        // Mark as pending (processing started)
        await markNotificationPending(notificationId);

        // Send email
        const result = await sendEmail(emailParams);

        // Update notification record
        if (result.success)
        {
            await markNotificationSent(notificationId, result.messageId);
        }
        else
        {
            await markNotificationFailed(notificationId, result.error || 'Unknown error');
            throw new Error(result.error || 'Failed to send email');
        }
    });
