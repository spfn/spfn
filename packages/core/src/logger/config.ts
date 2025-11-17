/**
 * Logger Configuration
 *
 * Environment-based logger configuration with validation for console, Slack, and Email transports.
 */

import type {
    LogLevel,
    ConsoleTransportConfig,
    SlackTransportConfig,
    EmailTransportConfig,
} from './types';

/**
 * Get default log level by environment
 */
export function getDefaultLogLevel(): LogLevel
{
    // Allow explicit LOG_LEVEL override
    const logLevelEnv = process.env.LOG_LEVEL?.toLowerCase();
    if (logLevelEnv && ['debug', 'info', 'warn', 'error', 'fatal'].includes(logLevelEnv))
    {
        return logLevelEnv as LogLevel;
    }

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
 * Slack Transport configuration
 *
 * Returns null if SLACK_WEBHOOK_URL is not configured
 */
export function getSlackConfig(): SlackTransportConfig | null
{
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl)
    {
        return null;
    }

    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'error',
        enabled: isProduction,
        webhookUrl,
        channel: process.env.SLACK_CHANNEL,
        username: process.env.SLACK_USERNAME || 'Logger Bot',
    };
}

/**
 * Email Transport configuration
 *
 * Returns null if required environment variables are not configured
 */
export function getEmailConfig(): EmailTransportConfig | null
{
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const emailFrom = process.env.EMAIL_FROM;
    const emailTo = process.env.EMAIL_TO;

    // All required fields must be present
    if (!smtpHost || !smtpPort || !emailFrom || !emailTo)
    {
        return null;
    }

    const isProduction = process.env.NODE_ENV === 'production';

    return {
        level: 'fatal',
        enabled: isProduction,
        smtpHost,
        smtpPort: parseInt(smtpPort, 10),
        from: emailFrom,
        to: emailTo.split(',').map(email => email.trim()),
        smtpUser: process.env.SMTP_USER,
        smtpPassword: process.env.SMTP_PASSWORD,
    };
}

/**
 * Validate environment variables
 */
function validateEnvironment(): void
{
    const nodeEnv = process.env.NODE_ENV;

    if (!nodeEnv)
    {
        process.stderr.write(
            '[Logger] Warning: NODE_ENV is not set. Defaulting to test environment.\n'
        );
    }
    // Allow any NODE_ENV value (development, production, test, staging, local, etc.)
    // No validation needed - users can use custom environments
}

/**
 * Validate email address format
 */
function isValidEmail(email: string): boolean
{
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate Slack configuration
 */
function validateSlackConfig(): void
{
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl)
    {
        return; // Optional - no validation needed if not configured
    }

    // Slack webhook URLs must start with https://hooks.slack.com
    if (!webhookUrl.startsWith('https://hooks.slack.com'))
    {
        throw new Error('Invalid SLACK_WEBHOOK_URL. Must start with https://hooks.slack.com');
    }
}

/**
 * Validate Email configuration
 */
function validateEmailConfig(): void
{
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const emailFrom = process.env.EMAIL_FROM;
    const emailTo = process.env.EMAIL_TO;

    // Check if any email config is set
    const hasAnyEmailConfig = smtpHost || smtpPort || emailFrom || emailTo;

    if (!hasAnyEmailConfig)
    {
        return; // Optional - no validation needed if not configured
    }

    // If any is set, all required fields must be set
    if (!smtpHost || !smtpPort || !emailFrom || !emailTo)
    {
        throw new Error(
            'Email transport configuration incomplete. ' +
            'Required: SMTP_HOST, SMTP_PORT, EMAIL_FROM, EMAIL_TO'
        );
    }

    // Validate SMTP_PORT is a valid number
    const port = parseInt(smtpPort, 10);
    if (isNaN(port) || port <= 0 || port > 65535)
    {
        throw new Error('Invalid SMTP_PORT. Must be a valid port number (1-65535)');
    }

    // Validate EMAIL_FROM format
    if (!isValidEmail(emailFrom))
    {
        throw new Error('Invalid EMAIL_FROM format. Must be a valid email address');
    }

    // Validate EMAIL_TO format(s)
    const emailAddresses = emailTo.split(',').map(email => email.trim());
    for (const email of emailAddresses)
    {
        if (!isValidEmail(email))
        {
            throw new Error(`Invalid email address in EMAIL_TO: ${email}`);
        }
    }
}

/**
 * Validate all logger configuration
 * Throws an error if configuration is invalid
 */
export function validateConfig(): void
{
    try
    {
        validateEnvironment();
        validateSlackConfig();
        validateEmailConfig();
    }
    catch (error)
    {
        if (error instanceof Error)
        {
            throw new Error(`[Logger] Configuration validation failed: ${error.message}`);
        }
        throw error;
    }
}