/**
 * @spfn/notification - Environment Schema
 */

import { defineEnvSchema, envString } from '@spfn/core/env';

export const notificationEnvSchema = defineEnvSchema({
    // Email
    SPFN_NOTIFICATION_EMAIL_PROVIDER: {
        ...envString({
            description: 'Email provider (aws-ses, sendgrid, smtp)',
            default: 'aws-ses',
            required: false,
            examples: ['aws-ses', 'sendgrid', 'smtp'],
        }),
    },

    SPFN_NOTIFICATION_EMAIL_FROM: {
        ...envString({
            description: 'Default sender email address',
            required: false,
            examples: ['noreply@example.com'],
        }),
    },

    // SMS
    SPFN_NOTIFICATION_SMS_PROVIDER: {
        ...envString({
            description: 'SMS provider (aws-sns, twilio)',
            default: 'aws-sns',
            required: false,
            examples: ['aws-sns', 'twilio'],
        }),
    },

    // Slack
    SPFN_NOTIFICATION_SLACK_WEBHOOK_URL: {
        ...envString({
            description: 'Slack webhook URL',
            required: false,
            examples: ['https://hooks.slack.com/services/xxx/xxx/xxx'],
        }),
    },

    // AWS (shared with other AWS services)
    AWS_REGION: {
        ...envString({
            description: 'AWS region',
            default: 'ap-northeast-2',
            required: false,
            examples: ['ap-northeast-2', 'us-east-1'],
        }),
    },

    AWS_ACCESS_KEY_ID: {
        ...envString({
            description: 'AWS access key ID',
            required: false,
            sensitive: true,
        }),
    },

    AWS_SECRET_ACCESS_KEY: {
        ...envString({
            description: 'AWS secret access key',
            required: false,
            sensitive: true,
        }),
    },
});
