/**
 * @spfn/notification - Configuration
 */

import { createEnvRegistry } from '@spfn/core/env';
import { notificationEnvSchema } from './schema';

export { notificationEnvSchema };

/**
 * Environment registry
 */
const registry = createEnvRegistry(notificationEnvSchema);
export const env = registry.validate();

/**
 * Notification configuration
 */
export interface NotificationConfig
{
    email?: {
        provider?: 'aws-ses' | 'sendgrid' | 'smtp';
        from?: string;
        replyTo?: string;
    };
    sms?: {
        provider?: 'aws-sns' | 'twilio';
        defaultCountryCode?: string;
    };
    slack?: {
        webhookUrl?: string;
    };
    defaults?: {
        appName?: string;
    };
    /**
     * Enable notification history tracking (requires database)
     * @default false
     */
    enableHistory?: boolean;
    /**
     * Email engagement tracking configuration
     */
    tracking?: {
        /** Enable tracking (default: false) */
        enabled?: boolean;
        /** HMAC secret key for token signing */
        secret?: string;
        /** Base URL for tracking endpoints */
        baseUrl?: string;
    };
}

let globalConfig: NotificationConfig = {};

/**
 * Configure notification settings
 */
export function configureNotification(config: NotificationConfig): void
{
    globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current notification configuration
 */
export function getNotificationConfig(): NotificationConfig
{
    return { ...globalConfig };
}

/**
 * Get email from address
 */
export function getEmailFrom(): string
{
    return globalConfig.email?.from || env.SPFN_NOTIFICATION_EMAIL_FROM || 'noreply@example.com';
}

/**
 * Get email reply-to address
 */
export function getEmailReplyTo(): string | undefined
{
    return globalConfig.email?.replyTo;
}

/**
 * Get SMS default country code
 */
export function getSmsDefaultCountryCode(): string
{
    return globalConfig.sms?.defaultCountryCode || '+82';
}

/**
 * Get app name for templates
 */
export function getAppName(): string
{
    return globalConfig.defaults?.appName || 'SPFN';
}

/**
 * Check if history tracking is enabled
 */
export function isHistoryEnabled(): boolean
{
    return globalConfig.enableHistory ?? false;
}

/**
 * Check if tracking is enabled (config → env → false)
 */
export function isTrackingEnabled(): boolean
{
    if (globalConfig.tracking?.enabled != null)
    {
        return globalConfig.tracking.enabled;
    }
    return env.SPFN_NOTIFICATION_TRACKING_ENABLED === 'true';
}

/**
 * Get tracking HMAC secret
 */
export function getTrackingSecret(): string | undefined
{
    return globalConfig.tracking?.secret ?? env.SPFN_NOTIFICATION_TRACKING_SECRET;
}

/**
 * Get tracking base URL
 */
export function getTrackingBaseUrl(): string | undefined
{
    return globalConfig.tracking?.baseUrl ?? env.SPFN_NOTIFICATION_TRACKING_BASE_URL;
}
