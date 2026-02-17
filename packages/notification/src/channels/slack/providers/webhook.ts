/**
 * @spfn/notification - Slack Webhook Provider
 */

import type { SlackProvider, InternalSendSlackParams } from '../types';
import type { SendResult } from '../../types';

/**
 * Slack Webhook Provider
 *
 * Sends messages via Slack Incoming Webhooks (simple HTTP POST).
 */
export const webhookProvider: SlackProvider = {
    name: 'webhook',

    async send(params: InternalSendSlackParams): Promise<SendResult>
    {
        try
        {
            const res = await fetch(params.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: params.text,
                    blocks: params.blocks,
                }),
            });

            return {
                success: res.ok,
                error: res.ok ? undefined : await res.text(),
            };
        }
        catch (error)
        {
            const err = error as Error;
            return {
                success: false,
                error: err.message,
            };
        }
    },
};
