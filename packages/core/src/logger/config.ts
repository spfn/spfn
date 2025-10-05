/**
 * Logger Configuration
 *
 * Logger configuration by environment
 *
 * ✅ Implemented:
 * - Environment-specific log level configuration
 * - Console Transport configuration
 * - File Transport configuration (for self-hosted)
 * - File rotation configuration
 * - Slack Transport configuration (environment variable based)
 * - Email Transport configuration (environment variable based)
 *
 * 💡 Deployment scenarios:
 * - K8s: Disable file logging (Stdout only)
 * - Self-hosted: LOGGER_FILE_ENABLED=true
 *
 * 🔗 Related files:
 * - src/logger/types.ts (Type definitions)
 * - src/logger/index.ts (Main export)
 * - .env.local (Environment variables)
 */

import type {
    LogLevel,
    ConsoleTransportConfig,
    FileTransportConfig,
    SlackTransportConfig,
    EmailTransportConfig,
} from './types';

/**
 * Check if file logging is enabled (for self-hosted)
 */
export function isFileLoggingEnabled(): boolean
{
    return process.env.LOGGER_FILE_ENABLED === 'true';
}

/**
 * Get default log level by environment
 */
export function getDefaultLogLevel(): LogLevel
{
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (isDevelopment)
    {
        return 'debug';
    }

    if (isProduction)
    {
        return 'info';
    }

    // Test environment
    return 'warn';
}

/**
 * Console Transport configuration
 */
export function getConsoleConfig(): ConsoleTransportConfig
{
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'debug',
        enabled: true,
        colorize: !isProduction, // Dev: colored output, Production: plain text
    };
}

/**
 * File Transport configuration
 */
export function getFileConfig(): FileTransportConfig
{
    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'info',
        enabled: isProduction, // File logging in production only
        logDir: process.env.LOG_DIR || './logs',
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
    };
}

/**
 * Slack Transport configuration
 */
export function getSlackConfig(): SlackTransportConfig | null
{
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl)
    {
        return null; // Disabled if not configured
    }

    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'error', // Send error and above to Slack
        enabled: isProduction, // Enabled in production only
        webhookUrl,
        channel: process.env.SLACK_CHANNEL,
        username: process.env.SLACK_USERNAME || 'Logger Bot',
    };
}

/**
 * Email Transport configuration
 */
export function getEmailConfig(): EmailTransportConfig | null
{
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const emailFrom = process.env.EMAIL_FROM;
    const emailTo = process.env.EMAIL_TO;

    // Disabled if required settings are missing
    if (!smtpHost || !smtpPort || !emailFrom || !emailTo)
    {
        return null;
    }

    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'fatal', // Send fatal level only via email
        enabled: isProduction, // Enabled in production only
        from: emailFrom,
        to: emailTo.split(',').map(email => email.trim()),
        smtpHost,
        smtpPort: parseInt(smtpPort, 10),
        smtpUser: process.env.SMTP_USER,
        smtpPassword: process.env.SMTP_PASSWORD,
    };
}