/**
 * @spfn/auth - AWS SNS SMS Provider
 *
 * Default SMS provider implementation using AWS SNS
 *
 * @requires @aws-sdk/client-sns (peer dependency)
 */

import { env } from '@spfn/auth/config';
import type { SMSProvider, SendSMSParams, SendSMSResult } from './types';

/**
 * Validate phone number format (E.164)
 *
 * @param phone - Phone number to validate
 * @returns True if valid E.164 format
 */
function isValidE164Phone(phone: string): boolean
{
    // E.164 format: +[country code][number]
    // Example: +821012345678
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
}

/**
 * Create AWS SNS SMS provider
 *
 * @returns SMSProvider instance or null if @aws-sdk/client-sns not available
 */
export function createAWSSNSProvider(): SMSProvider | null
{
    try
    {
        // Dynamic import to check if @aws-sdk/client-sns is available
        const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

        return {
            name: 'aws-sns',
            sendSMS: async (params: SendSMSParams): Promise<SendSMSResult> =>
            {
                const { phone, message, purpose } = params;

                // Validate phone number format
                if (!isValidE164Phone(phone))
                {
                    return {
                        success: false,
                        error: 'Invalid phone number format. Must be E.164 format (e.g., +821012345678)',
                    };
                }

                // Check if AWS credentials are configured
                if (!env.SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID)
                {
                    return {
                        success: false,
                        error: 'AWS SNS credentials not configured. Set SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID environment variable.',
                    };
                }

                try
                {
                    // Initialize SNS client
                    const config: any = {
                        region: env.SPFN_AUTH_AWS_REGION || 'ap-northeast-2',
                    };

                    if (env.SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID && env.SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY)
                    {
                        config.credentials = {
                            accessKeyId: env.SPFN_AUTH_AWS_SNS_ACCESS_KEY_ID,
                            secretAccessKey: env.SPFN_AUTH_AWS_SNS_SECRET_ACCESS_KEY,
                        };
                    }

                    const client = new SNSClient(config);

                    // Prepare SNS publish command
                    const command = new PublishCommand({
                        PhoneNumber: phone,
                        Message: message,
                        MessageAttributes: {
                            'AWS.SNS.SMS.SMSType': {
                                DataType: 'String',
                                StringValue: 'Transactional', // For OTP codes
                            },
                            ...(env.SPFN_AUTH_AWS_SNS_SENDER_ID && {
                                'AWS.SNS.SMS.SenderID': {
                                    DataType: 'String',
                                    StringValue: env.SPFN_AUTH_AWS_SNS_SENDER_ID,
                                },
                            }),
                        },
                    });

                    // Send SMS
                    const response = await client.send(command);

                    console.log(`[SMS - AWS SNS] To: ${phone}, MessageId: ${response.MessageId}, Purpose: ${purpose || 'N/A'}`);

                    return {
                        success: true,
                        messageId: response.MessageId,
                    };
                }
                catch (error)
                {
                    const err = error as Error;
                    console.error(`[SMS - AWS SNS] Failed to send SMS to ${phone}:`, err);

                    return {
                        success: false,
                        error: err.message || 'Failed to send SMS via AWS SNS',
                    };
                }
            },
        };
    }
    catch (error)
    {
        // @aws-sdk/client-sns not installed
        return null;
    }
}

/**
 * AWS SNS Provider instance (lazy initialization)
 */
export const awsSNSProvider = createAWSSNSProvider();