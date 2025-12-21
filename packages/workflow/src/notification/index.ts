/**
 * Notification Module
 *
 * Only consoleProvider is provided by default.
 * Implement custom providers using @spfn/notification for email, SMS, Slack, etc.
 */

export type {
    NotificationProvider,
    NotifyConfig,
    WorkflowEventType,
} from './types';

export {
    consoleProvider,
    formatEventAsText,
} from './providers';
