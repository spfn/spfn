/**
 * @spfn/notification - Bulk Slack Item Job
 *
 * Processes a single Slack item from a distributed bulk send.
 */

import { job } from '@spfn/core/job';
import { Type } from '@sinclair/typebox';
import { webhookProvider } from '../channels/slack/providers/webhook';
import {
    markNotificationSent,
    markNotificationFailed,
} from '../services/notification.service';
import { scrubSendResult } from '../privacy';

const SendBulkSlackItemInput = Type.Object({
    notificationId: Type.Number(),
    webhookUrl: Type.String(),
    text: Type.Optional(Type.String()),
    blocks: Type.Optional(Type.Array(Type.Unknown())),
});

export const sendBulkSlackItemJob = job('notification.send-bulk-slack-item')
    .input(SendBulkSlackItemInput)
    .options({
        retryLimit: 3,
        retryDelay: 5000,
        batchSize: 50,
    })
    .handler(async (input) =>
    {
        const { notificationId, ...slackParams } = input;

        // This job calls the provider directly, so it stands in for the channel's
        // provider boundary: the webhook returns Slack's raw response body, which
        // echoes the posted message, and the rethrow below carries it into the job
        // queue's failure record.
        const result = scrubSendResult(await webhookProvider.send(slackParams));

        if (result.success)
        {
            await markNotificationSent(notificationId, result.messageId);
        }
        else
        {
            await markNotificationFailed(notificationId, result.error || 'Unknown error');
            throw new Error(result.error || 'Failed to send Slack message');
        }
    });
