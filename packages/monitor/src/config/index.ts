/**
 * @spfn/monitor - Configuration
 */

import { createEnvRegistry } from '@spfn/core/env';
import { monitorEnvSchema } from './schema';

export { monitorEnvSchema };

/**
 * Environment registry
 */
const registry = createEnvRegistry(monitorEnvSchema);
export const env = registry.validate();

/**
 * Monitor configuration
 */
export interface MonitorConfig
{
    /**
     * Slack webhook URL override
     */
    slackWebhookUrl?: string;

    /**
     * Error retention days
     * @default 90
     */
    errorRetentionDays?: number;

    /**
     * Log retention days
     * @default 30
     */
    logRetentionDays?: number;

    /**
     * Minimum HTTP status code to track
     * @default 500
     */
    minStatusCode?: number;
}

let globalConfig: MonitorConfig = {};

/**
 * Configure monitor settings
 */
export function configureMonitor(config: MonitorConfig): void
{
    globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current monitor configuration
 */
export function getMonitorConfig(): MonitorConfig
{
    return { ...globalConfig };
}

/**
 * Get Slack webhook URL (config > env)
 */
export function getSlackWebhookUrl(): string | undefined
{
    return globalConfig.slackWebhookUrl || env.SPFN_MONITOR_SLACK_WEBHOOK_URL;
}

/**
 * Get error retention days
 */
export function getErrorRetentionDays(): number
{
    return globalConfig.errorRetentionDays ?? env.SPFN_MONITOR_ERROR_RETENTION_DAYS ?? 90;
}

/**
 * Get log retention days
 */
export function getLogRetentionDays(): number
{
    return globalConfig.logRetentionDays ?? env.SPFN_MONITOR_LOG_RETENTION_DAYS ?? 30;
}

/**
 * Get minimum status code for error tracking
 */
export function getMinStatusCode(): number
{
    return globalConfig.minStatusCode ?? env.SPFN_MONITOR_MIN_STATUS_CODE ?? 500;
}
