/**
 * @spfn/monitor - Environment Schema
 */

import { defineEnvSchema, envString, envNumber } from '@spfn/core/env';

export const monitorEnvSchema = defineEnvSchema({
    SPFN_MONITOR_SLACK_WEBHOOK_URL: {
        ...envString({
            description: 'Slack webhook URL for error notifications (falls back to notification default)',
            required: false,
            examples: ['https://hooks.slack.com/services/xxx/xxx/xxx'],
        }),
    },

    SPFN_MONITOR_ERROR_RETENTION_DAYS: {
        ...envNumber({
            description: 'Number of days to retain error events before purging',
            default: 90,
            required: false,
            examples: [30, 60, 90],
        }),
    },

    SPFN_MONITOR_LOG_RETENTION_DAYS: {
        ...envNumber({
            description: 'Number of days to retain logs before purging',
            default: 30,
            required: false,
            examples: [7, 14, 30],
        }),
    },

    SPFN_MONITOR_MIN_STATUS_CODE: {
        ...envNumber({
            description: 'Minimum HTTP status code to track as error',
            default: 500,
            required: false,
            examples: [400, 500],
        }),
    },
});
