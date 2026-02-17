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
} from './email';

// SMS
export {
    sendSMS,
    sendSMSBulk,
    registerSMSProvider,
    type SendSMSParams,
    type SMSProvider,
} from './sms';

// Slack
export {
    sendSlack,
    sendSlackBulk,
    registerSlackProvider,
    type SendSlackParams,
    type SlackProvider,
} from './slack';
