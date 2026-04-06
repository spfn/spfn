/**
 * @spfn/notification - Channels
 */

export type { NotificationChannel, SendResult, ChannelProvider } from './types';

// Email
export {
    sendEmail,
    sendEmailBulk,
    registerEmailProvider,
    type SendEmailParams,
    type EmailProvider,
    type BulkEmailResult,
    type BulkEmailOptions,
} from './email';

// SMS
export {
    sendSMS,
    sendSMSBulk,
    registerSMSProvider,
    type SendSMSParams,
    type SMSProvider,
    type BulkSMSResult,
    type BulkSMSOptions,
} from './sms';

// Slack
export {
    sendSlack,
    sendSlackBulk,
    registerSlackProvider,
    type SendSlackParams,
    type SlackProvider,
    type BulkSlackResult,
    type BulkSlackOptions,
} from './slack';
