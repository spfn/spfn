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

/**
 * Validate Slack transport configuration
 */
function validateSlackConfig(): void
{
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;

    if (!webhookUrl)
    {
        return; // Slack disabled, skip validation
    }

    // Validate webhook URL format
    if (!webhookUrl.startsWith('https://hooks.slack.com/'))
    {
        throw new Error(
            `Invalid SLACK_WEBHOOK_URL: "${webhookUrl}". ` +
            'Slack webhook URLs must start with "https://hooks.slack.com/"'
        );
    }
}

/**
 * Validate Email transport configuration
 */
function validateEmailConfig(): void
{
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const emailFrom = process.env.EMAIL_FROM;
    const emailTo = process.env.EMAIL_TO;

    // If any email config is set, all required fields must be present
    const hasAnyEmailConfig = smtpHost || smtpPort || emailFrom || emailTo;
    if (!hasAnyEmailConfig)
    {
        return; // Email disabled, skip validation
    }

    // Validate all required fields
    const missingFields: string[] = [];
    if (!smtpHost) missingFields.push('SMTP_HOST');
    if (!smtpPort) missingFields.push('SMTP_PORT');
    if (!emailFrom) missingFields.push('EMAIL_FROM');
    if (!emailTo) missingFields.push('EMAIL_TO');

    if (missingFields.length > 0)
    {
        throw new Error(
            `Email transport configuration incomplete. Missing: ${missingFields.join(', ')}. ` +
            'Either set all required fields or remove all email configuration.'
        );
    }

    // Validate SMTP port is a number
    const port = parseInt(smtpPort!, 10);
    if (isNaN(port) || port < 1 || port > 65535)
    {
        throw new Error(
            `Invalid SMTP_PORT: "${smtpPort}". Must be a number between 1 and 65535.`
        );
    }

    // Validate email format (basic check)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailFrom!))
    {
        throw new Error(`Invalid EMAIL_FROM format: "${emailFrom}"`);
    }

    // Validate email recipients
    const recipients = emailTo!.split(',').map(e => e.trim());
    for (const email of recipients)
    {
        if (!emailRegex.test(email))
        {
            throw new Error(`Invalid email address in EMAIL_TO: "${email}"`);
        }
    }
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