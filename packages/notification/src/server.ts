/**
 * @spfn/notification - Server Exports
 *
 * Use this for server-side notification sending
 *
 * @example
 * ```typescript
 * import {
 *     sendEmail,
 *     sendSMS,
 *     registerTemplate,
 *     configureNotification
 * } from '@spfn/notification/server';
 *
 * // Configure
 * configureNotification({
 *     email: { from: 'noreply@example.com' },
 *     defaults: { appName: 'MyApp' }
 * });
 *
 * // Send
 * await sendEmail({
 *     to: 'user@example.com',
 *     template: 'verification-code',
 *     data: { code: '123456' }
 * });
 * ```
 */

// Configuration
export {
    configureNotification,
    getNotificationConfig,
    getEmailFrom,
    getEmailReplyTo,
    getSmsDefaultCountryCode,
    getAppName,
    type NotificationConfig,
} from './config';

// Channels
export {
    sendEmail,
    sendEmailBulk,
    registerEmailProvider,
    sendSMS,
    sendSMSBulk,
    registerSMSProvider,
    type NotificationChannel,
    type SendResult,
    type SendEmailParams,
    type EmailProvider,
    type SendSMSParams,
    type SMSProvider,
} from './channels';

// Scheduling
export {
    scheduleEmail,
    scheduleSMS,
    type ScheduleOptions,
    type ScheduleResult,
} from './services/schedule.service';

// Templates
export {
    registerTemplate,
    getTemplate,
    hasTemplate,
    renderTemplate,
    getTemplateNames,
    registerFilter,
    registerBuiltinTemplates,
    type TemplateDefinition,
    type TemplateData,
    type EmailTemplateContent,
    type SmsTemplateContent,
    type SlackTemplateContent,
} from './templates';

// Entities
export {
    notifications,
    NOTIFICATION_CHANNELS,
    NOTIFICATION_STATUSES,
    type Notification,
    type NewNotification,
    type NotificationStatus,
} from './entities';

// Services
export {
    createNotificationRecord,
    createScheduledNotification,
    updateNotificationJobId,
    markNotificationSent,
    markNotificationFailed,
    markNotificationPending,
    cancelScheduledNotification,
    findNotificationByJobId,
    findNotifications,
    findScheduledNotifications,
    countNotifications,
    getNotificationStats,
    type FindNotificationsOptions,
    type NotificationStats,
} from './services/notification.service';

export {
    cancelNotification,
    cancelNotificationsByReference,
    type CancelResult,
} from './services/cancel.service';

// Jobs
export {
    sendScheduledEmailJob,
    sendScheduledSmsJob,
    notificationJobRouter,
} from './jobs';

// Auto-register built-in templates
import { registerBuiltinTemplates } from './templates';
registerBuiltinTemplates();
