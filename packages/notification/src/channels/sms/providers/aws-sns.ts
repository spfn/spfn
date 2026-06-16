/**
 * @spfn/notification - AWS SNS SMS Provider
 */

import type { SMSProvider, InternalSendSMSParams } from '../types';
import type { SendResult } from '../../types';
import { env } from '../../../config';
import { logger } from '@spfn/core/logger';

const log = logger.child('@spfn/notification:sns');

let snsClient: any = null;

/**
 * Get or create SNS client
 */
async function getSNSClient()
{
    if (snsClient)
    {
        return snsClient;
    }

    try
    {
        const { SNSClient } = await import('@aws-sdk/client-sns');

        snsClient = new SNSClient({
            region: env.AWS_REGION,
            credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
                }
                : undefined,
        });

        log.debug('SNS client created', { region: env.AWS_REGION });

        return snsClient;
    }
    catch
    {
        throw new Error(
            '@aws-sdk/client-sns is not installed. ' +
            'Please install it: pnpm add @aws-sdk/client-sns',
        );
    }
}

/**
 * AWS SNS SMS Provider
 */
export const awsSnsProvider: SMSProvider = {
    name: 'aws-sns',

    async send(params: InternalSendSMSParams): Promise<SendResult>
    {
        try
        {
            const client = await getSNSClient();
            const { PublishCommand } = await import('@aws-sdk/client-sns');

            const command = new PublishCommand({
                PhoneNumber: params.to,
                Message: params.message,
                MessageAttributes: {
                    'AWS.SNS.SMS.SMSType': {
                        DataType: 'String',
                        StringValue: 'Transactional',
                    },
                },
            });

            const response = await client.send(command);

            return {
                success: true,
                messageId: response.MessageId,
            };
        }
        catch (error)
        {
            const err = error as Error;
            log.error('SNS send failed', err, { to: params.to });

            return {
                success: false,
                error: err.message,
            };
        }
    },
};
