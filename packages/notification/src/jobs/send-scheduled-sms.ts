/**
 * @spfn/notification - Scheduled SMS Job
 */

import { job } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';
import { sendSMS } from '../channels/sms';
import {
    markNotificationPending,
    markNotificationSent,
    markNotificationFailed,
} from '../services/notification.service';

/**
 * Job input schema
 */
const SendScheduledSmsInput = Type.Object({
    notificationId: Type.Number(),
    to: Type.Union([Type.String(), Type.Array(Type.String())]),
    message: Type.Optional(Type.String()),
    template: Type.Optional(Type.String()),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

/**
 * Scheduled SMS sending job
 */
export const sendScheduledSmsJob = job('notification.send-scheduled-sms')
    .input(SendScheduledSmsInput)
    .options({
        retryLimit: 3,
        retryDelay: 5000,
    })
    .handler(async (input) =>
    {
        const { notificationId, ...smsParams } = input;

        // Mark as pending (processing started)
        await markNotificationPending(notificationId);

        // Send SMS
        const result = await sendSMS(smsParams);

        // Update notification record
        if (result.success)
        {
            await markNotificationSent(notificationId, result.messageId);
        }
        else
        {
            await markNotificationFailed(notificationId, result.error || 'Unknown error');
            throw new Error(result.error || 'Failed to send SMS');
        }
    });
