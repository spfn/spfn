/**
 * @spfn/notification - Bulk SMS Item Job
 *
 * Processes a single SMS item from a distributed bulk send.
 */

import { job } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';
import { awsSnsProvider } from '../channels/sms/providers/aws-sns';
import {
    markNotificationSent,
    markNotificationFailed,
} from '../services/notification.service';

const SendBulkSmsItemInput = Type.Object({
    notificationId: Type.Number(),
    to: Type.String(),
    message: Type.String(),
});

export const sendBulkSmsItemJob = job('notification.send-bulk-sms-item')
    .input(SendBulkSmsItemInput)
    .options({
        retryLimit: 3,
        retryDelay: 5000,
        batchSize: 50,
    })
    .handler(async (input) =>
    {
        const { notificationId, ...smsParams } = input;

        const result = await awsSnsProvider.send(smsParams);

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
