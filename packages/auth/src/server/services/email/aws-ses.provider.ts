/**
 * @spfn/auth - AWS SES Email Provider
 *
 * Default email provider implementation using AWS SES
 *
 * @requires @aws-sdk/client-ses (peer dependency)
 */

import { env } from '@spfn/auth/config';
import { authLogger } from '../../logger';
import type { EmailProvider, SendEmailParams, SendEmailResult } from './types';

/**
 * Validate email address format
 *
 * @param email - Email address to validate
 * @returns True if valid email format
 */
function isValidEmail(email: string): boolean
{
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Create AWS SES email provider
 *
 * Uses lazy dynamic import to support Next.js bundlers (webpack/turbopack)
 *
 * @returns EmailProvider instance
 */
export function createAWSSESProvider(): EmailProvider
{
    return {
        name: 'aws-ses',
        sendEmail: async (params: SendEmailParams): Promise<SendEmailResult> =>
        {
            const { to, subject, text, html, purpose } = params;

            // Validate email address format
            if (!isValidEmail(to))
            {
                return {
                    success: false,
                    error: 'Invalid email address format',
                };
            }

            // Check if AWS credentials are configured
            if (!env.SPFN_AUTH_AWS_SES_ACCESS_KEY_ID)
            {
                authLogger.email.warn('AWS SES credentials not configured', {
                    hint: 'Set SPFN_AUTH_AWS_SES_ACCESS_KEY_ID environment variable',
                });
                return {
                    success: false,
                    error: 'AWS SES credentials not configured. Set SPFN_AUTH_AWS_SES_ACCESS_KEY_ID environment variable.',
                };
            }

            // Check if sender email is configured
            if (!env.SPFN_AUTH_AWS_SES_FROM_EMAIL)
            {
                authLogger.email.warn('AWS SES sender email not configured', {
                    hint: 'Set SPFN_AUTH_AWS_SES_FROM_EMAIL environment variable',
                });
                return {
                    success: false,
                    error: 'AWS SES sender email not configured. Set SPFN_AUTH_AWS_SES_FROM_EMAIL environment variable.',
                };
            }

            // Lazy dynamic import for bundler compatibility (webpack/turbopack)
            let SESClient: any;
            let SendEmailCommand: any;

            try
            {
                const ses = await import('@aws-sdk/client-ses');
                SESClient = ses.SESClient;
                SendEmailCommand = ses.SendEmailCommand;
            }
            catch (error)
            {
                authLogger.email.warn('@aws-sdk/client-ses not installed', {
                    error: error instanceof Error ? error.message : String(error),
                    hint: 'Run: pnpm add @aws-sdk/client-ses',
                });
                return {
                    success: false,
                    error: '@aws-sdk/client-ses not installed. Run: pnpm add @aws-sdk/client-ses',
                };
            }

            try
            {
                // Initialize SES client
                const config: any = {
                    region: env.SPFN_AUTH_AWS_REGION || 'ap-northeast-2',
                };

                if (env.SPFN_AUTH_AWS_SES_ACCESS_KEY_ID && env.SPFN_AUTH_AWS_SES_SECRET_ACCESS_KEY)
                {
                    config.credentials = {
                        accessKeyId: env.SPFN_AUTH_AWS_SES_ACCESS_KEY_ID,
                        secretAccessKey: env.SPFN_AUTH_AWS_SES_SECRET_ACCESS_KEY,
                    };
                }

                const client = new SESClient(config);

                // Build email body
                const body: any = {};

                if (text)
                {
                    body.Text = {
                        Charset: 'UTF-8',
                        Data: text,
                    };
                }

                if (html)
                {
                    body.Html = {
                        Charset: 'UTF-8',
                        Data: html,
                    };
                }

                // Prepare SES send email command
                const command = new SendEmailCommand({
                    Source: env.SPFN_AUTH_AWS_SES_FROM_EMAIL,
                    Destination: {
                        ToAddresses: [to],
                    },
                    Message: {
                        Subject: {
                            Charset: 'UTF-8',
                            Data: subject,
                        },
                        Body: body,
                    },
                });

                // Send email
                const response = await client.send(command);

                authLogger.email.info('Email sent via AWS SES', {
                    to,
                    messageId: response.MessageId,
                    purpose: purpose || 'N/A',
                });

                return {
                    success: true,
                    messageId: response.MessageId,
                };
            }
            catch (error)
            {
                const err = error as Error;
                authLogger.email.error('Failed to send email via AWS SES', {
                    to,
                    error: err.message,
                });

                return {
                    success: false,
                    error: err.message || 'Failed to send email via AWS SES',
                };
            }
        },
    };
}

/**
 * AWS SES Provider instance
 */
export const awsSESProvider = createAWSSESProvider();
