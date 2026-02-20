/**
 * @spfn/notification - AWS SES Email Provider
 */

import type { EmailProvider, InternalSendEmailParams } from '../types';
import type { SendResult } from '../../types';
import { env } from '../../../config';
import { logger } from '@spfn/core/logger';

const log = logger.child('@spfn/notification:ses');

let sesClient: any = null;

/**
 * Get or create SES client
 */
async function getSESClient()
{
    if (sesClient)
    {
        return sesClient;
    }

    try
    {
        const { SESClient } = await import('@aws-sdk/client-ses');

        sesClient = new SESClient({
            region: env.AWS_REGION,
            credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
                }
                : undefined,
        });

        log.debug('SES client created', { region: env.AWS_REGION });
        return sesClient;
    }
    catch
    {
        throw new Error(
            '@aws-sdk/client-ses is not installed. ' +
            'Please install it: pnpm add @aws-sdk/client-ses'
        );
    }
}

/**
 * AWS SES Email Provider
 */
export const awsSesProvider: EmailProvider = {
    name: 'aws-ses',

    async send(params: InternalSendEmailParams): Promise<SendResult>
    {
        try
        {
            const client = await getSESClient();
            const { SendEmailCommand } = await import('@aws-sdk/client-ses');

            const command = new SendEmailCommand({
                Source: params.from,
                Destination: {
                    ToAddresses: params.to,
                },
                ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
                Message: {
                    Subject: {
                        Charset: 'UTF-8',
                        Data: params.subject,
                    },
                    Body: {
                        ...(params.html && {
                            Html: {
                                Charset: 'UTF-8',
                                Data: params.html,
                            },
                        }),
                        ...(params.text && {
                            Text: {
                                Charset: 'UTF-8',
                                Data: params.text,
                            },
                        }),
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
            log.error('SES send failed', err, { to: params.to, from: params.from });
            return {
                success: false,
                error: err.message,
            };
        }
    },
};
