/**
 * Logger Configuration
 *
 * Environment-based logger configuration with validation for console, file, Slack, and Email transports.
 */

import { existsSync, accessSync, constants, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
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

/**
 * Validate directory path and write permissions
 */
function validateDirectoryWritable(dirPath: string): void
{
    // Check if directory exists
    if (!existsSync(dirPath))
    {
        // Try to create directory
        try
        {
            mkdirSync(dirPath, { recursive: true });
        }
        catch (error)
        {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create log directory "${dirPath}": ${errorMessage}`);
        }
    }

    // Check write permission
    try
    {
        accessSync(dirPath, constants.W_OK);
    }
    catch
    {
        throw new Error(`Log directory "${dirPath}" is not writable. Please check permissions.`);
    }

    // Try to write a test file
    const testFile = join(dirPath, '.logger-write-test');
    try
    {
        writeFileSync(testFile, 'test', 'utf-8');
        unlinkSync(testFile);
    }
    catch (error)
    {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Cannot write to log directory "${dirPath}": ${errorMessage}`);
    }
}

/**
 * Validate file transport configuration
 */
function validateFileConfig(): void
{
    if (!isFileLoggingEnabled())
    {
        return; // File logging disabled, skip validation
    }

    const logDir = process.env.LOG_DIR;

    // Check if LOG_DIR is set
    if (!logDir)
    {
        throw new Error(
            'LOG_DIR environment variable is required when LOGGER_FILE_ENABLED=true. ' +
            'Example: LOG_DIR=/var/log/myapp'
        );
    }

    // Validate directory
    validateDirectoryWritable(logDir);
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
    else if (!['development', 'production', 'test'].includes(nodeEnv))
    {
        process.stderr.write(
            `[Logger] Warning: Unknown NODE_ENV="${nodeEnv}". Expected: development, production, or test.\n`
        );
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
        validateFileConfig();
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