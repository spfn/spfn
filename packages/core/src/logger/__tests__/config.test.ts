/**
 * Logger Configuration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
    isFileLoggingEnabled,
    getDefaultLogLevel,
    getConsoleConfig,
    getFileConfig,
    getSlackConfig,
    getEmailConfig,
    validateConfig,
} from '../config';

describe('Logger Configuration', () =>
{
    const originalEnv = process.env;

    beforeEach(() =>
    {
        // Reset environment variables
        process.env = { ...originalEnv };
    });

    afterEach(() =>
    {
        // Restore original environment
        process.env = originalEnv;
    });

    describe('isFileLoggingEnabled', () =>
    {
        it('should return true when LOGGER_FILE_ENABLED is "true"', () =>
        {
            process.env.LOGGER_FILE_ENABLED = 'true';

            expect(isFileLoggingEnabled()).toBe(true);
        });

        it('should return false when LOGGER_FILE_ENABLED is not "true"', () =>
        {
            process.env.LOGGER_FILE_ENABLED = 'false';

            expect(isFileLoggingEnabled()).toBe(false);
        });

        it('should return false when LOGGER_FILE_ENABLED is undefined', () =>
        {
            delete process.env.LOGGER_FILE_ENABLED;

            expect(isFileLoggingEnabled()).toBe(false);
        });
    });

    describe('getDefaultLogLevel', () =>
    {
        it('should return "debug" for development environment', () =>
        {
            process.env.NODE_ENV = 'development';

            expect(getDefaultLogLevel()).toBe('debug');
        });

        it('should return "info" for production environment', () =>
        {
            process.env.NODE_ENV = 'production';

            expect(getDefaultLogLevel()).toBe('info');
        });

        it('should return "warn" for test environment', () =>
        {
            process.env.NODE_ENV = 'test';

            expect(getDefaultLogLevel()).toBe('warn');
        });

        it('should return "warn" for unknown environment', () =>
        {
            process.env.NODE_ENV = 'staging';

            expect(getDefaultLogLevel()).toBe('warn');
        });
    });

    describe('getConsoleConfig', () =>
    {
        it('should enable colorize in development', () =>
        {
            process.env.NODE_ENV = 'development';

            const config = getConsoleConfig();

            expect(config.colorize).toBe(true);
        });

        it('should disable colorize in production', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = getConsoleConfig();

            expect(config.colorize).toBe(false);
        });

        it('should always be enabled', () =>
        {
            const config = getConsoleConfig();

            expect(config.enabled).toBe(true);
        });

        it('should use debug level', () =>
        {
            const config = getConsoleConfig();

            expect(config.level).toBe('debug');
        });
    });

    describe('getFileConfig', () =>
    {
        it('should be enabled in production', () =>
        {
            process.env.NODE_ENV = 'production';

            const config = getFileConfig();

            expect(config.enabled).toBe(true);
        });

        it('should be disabled in development', () =>
        {
            process.env.NODE_ENV = 'development';

            const config = getFileConfig();

            expect(config.enabled).toBe(false);
        });

        it('should use info level', () =>
        {
            const config = getFileConfig();

            expect(config.level).toBe('info');
        });

        it('should use default log directory', () =>
        {
            delete process.env.LOG_DIR;

            const config = getFileConfig();

            expect(config.logDir).toBe('./logs');
        });

        it('should use custom log directory from environment', () =>
        {
            process.env.LOG_DIR = '/var/log/app';

            const config = getFileConfig();

            expect(config.logDir).toBe('/var/log/app');
        });

        it('should have default maxFileSize of 10MB', () =>
        {
            const config = getFileConfig();

            expect(config.maxFileSize).toBe(10 * 1024 * 1024);
        });

        it('should have default maxFiles of 10', () =>
        {
            const config = getFileConfig();

            expect(config.maxFiles).toBe(10);
        });
    });

    describe('getSlackConfig', () =>
    {
        it('should return null when SLACK_WEBHOOK_URL is not configured', () =>
        {
            delete process.env.SLACK_WEBHOOK_URL;

            const config = getSlackConfig();

            expect(config).toBeNull();
        });

        it('should return config when SLACK_WEBHOOK_URL is configured', () =>
        {
            process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

            const config = getSlackConfig();

            expect(config).not.toBeNull();
            expect(config?.webhookUrl).toBe('https://hooks.slack.com/test');
        });

        it('should be enabled in production', () =>
        {
            process.env.NODE_ENV = 'production';
            process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

            const config = getSlackConfig();

            expect(config?.enabled).toBe(true);
        });

        it('should be disabled in development', () =>
        {
            process.env.NODE_ENV = 'development';
            process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

            const config = getSlackConfig();

            expect(config?.enabled).toBe(false);
        });

        it('should use error level', () =>
        {
            process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

            const config = getSlackConfig();

            expect(config?.level).toBe('error');
        });

        it('should use custom channel from environment', () =>
        {
            process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
            process.env.SLACK_CHANNEL = '#alerts';

            const config = getSlackConfig();

            expect(config?.channel).toBe('#alerts');
        });

        it('should use custom username from environment', () =>
        {
            process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
            process.env.SLACK_USERNAME = 'Custom Bot';

            const config = getSlackConfig();

            expect(config?.username).toBe('Custom Bot');
        });

        it('should use default username if not specified', () =>
        {
            process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
            delete process.env.SLACK_USERNAME;

            const config = getSlackConfig();

            expect(config?.username).toBe('Logger Bot');
        });
    });

    describe('getEmailConfig', () =>
    {
        it('should return null when required config is missing', () =>
        {
            delete process.env.SMTP_HOST;
            delete process.env.SMTP_PORT;
            delete process.env.EMAIL_FROM;
            delete process.env.EMAIL_TO;

            const config = getEmailConfig();

            expect(config).toBeNull();
        });

        it('should return null when SMTP_HOST is missing', () =>
        {
            delete process.env.SMTP_HOST;
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com';

            const config = getEmailConfig();

            expect(config).toBeNull();
        });

        it('should return null when SMTP_PORT is missing', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            delete process.env.SMTP_PORT;
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com';

            const config = getEmailConfig();

            expect(config).toBeNull();
        });

        it('should return config when all required fields are provided', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com';

            const config = getEmailConfig();

            expect(config).not.toBeNull();
            expect(config?.smtpHost).toBe('smtp.example.com');
            expect(config?.smtpPort).toBe(587);
        });

        it('should be enabled in production', () =>
        {
            process.env.NODE_ENV = 'production';
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com';

            const config = getEmailConfig();

            expect(config?.enabled).toBe(true);
        });

        it('should be disabled in development', () =>
        {
            process.env.NODE_ENV = 'development';
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com';

            const config = getEmailConfig();

            expect(config?.enabled).toBe(false);
        });

        it('should use fatal level', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com';

            const config = getEmailConfig();

            expect(config?.level).toBe('fatal');
        });

        it('should parse comma-separated EMAIL_TO addresses', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin1@example.com, admin2@example.com, admin3@example.com';

            const config = getEmailConfig();

            expect(config?.to).toEqual([
                'admin1@example.com',
                'admin2@example.com',
                'admin3@example.com',
            ]);
        });

        it('should trim whitespace from email addresses', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = '  admin1@example.com  ,  admin2@example.com  ';

            const config = getEmailConfig();

            expect(config?.to).toEqual([
                'admin1@example.com',
                'admin2@example.com',
            ]);
        });

        it('should include optional SMTP credentials', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com';
            process.env.SMTP_USER = 'smtp-user';
            process.env.SMTP_PASSWORD = 'smtp-password';

            const config = getEmailConfig();

            expect(config?.smtpUser).toBe('smtp-user');
            expect(config?.smtpPassword).toBe('smtp-password');
        });
    });

    describe('validateConfig', () =>
    {
        const testLogDir = join(process.cwd(), 'test-logs');

        afterEach(() =>
        {
            // Cleanup test directory
            if (existsSync(testLogDir))
            {
                rmSync(testLogDir, { recursive: true, force: true });
            }
        });

        it('should pass validation with default config', () =>
        {
            process.env.NODE_ENV = 'development';
            delete process.env.LOGGER_FILE_ENABLED;

            expect(() => validateConfig()).not.toThrow();
        });

        it('should fail when file logging is enabled but LOG_DIR is not set', () =>
        {
            process.env.LOGGER_FILE_ENABLED = 'true';
            delete process.env.LOG_DIR;

            expect(() => validateConfig()).toThrow(/LOG_DIR environment variable is required/);
        });

        it('should create log directory if it does not exist', () =>
        {
            process.env.LOGGER_FILE_ENABLED = 'true';
            process.env.LOG_DIR = testLogDir;

            expect(() => validateConfig()).not.toThrow();
            expect(existsSync(testLogDir)).toBe(true);
        });

        it('should fail when log directory is not writable', () =>
        {
            process.env.LOGGER_FILE_ENABLED = 'true';
            process.env.LOG_DIR = '/root/test-logs'; // Typically not writable

            expect(() => validateConfig()).toThrow();
        });

        it('should fail when Slack webhook URL is invalid', () =>
        {
            process.env.SLACK_WEBHOOK_URL = 'http://invalid.com/webhook';

            expect(() => validateConfig()).toThrow(/Invalid SLACK_WEBHOOK_URL/);
        });

        it('should pass when Slack webhook URL is valid', () =>
        {
            process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX';

            expect(() => validateConfig()).not.toThrow();
        });

        it('should fail when email config is incomplete (only SMTP_HOST set)', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            delete process.env.SMTP_PORT;
            delete process.env.EMAIL_FROM;
            delete process.env.EMAIL_TO;

            expect(() => validateConfig()).toThrow(/Email transport configuration incomplete/);
        });

        it('should fail when SMTP_PORT is invalid', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = 'invalid';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com';

            expect(() => validateConfig()).toThrow(/Invalid SMTP_PORT/);
        });

        it('should fail when EMAIL_FROM format is invalid', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'invalid-email';
            process.env.EMAIL_TO = 'admin@example.com';

            expect(() => validateConfig()).toThrow(/Invalid EMAIL_FROM format/);
        });

        it('should fail when EMAIL_TO contains invalid email', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin@example.com, invalid-email';

            expect(() => validateConfig()).toThrow(/Invalid email address in EMAIL_TO/);
        });

        it('should pass when all email config is valid', () =>
        {
            process.env.SMTP_HOST = 'smtp.example.com';
            process.env.SMTP_PORT = '587';
            process.env.EMAIL_FROM = 'noreply@example.com';
            process.env.EMAIL_TO = 'admin1@example.com, admin2@example.com';

            expect(() => validateConfig()).not.toThrow();
        });

        it('should warn when NODE_ENV is not set', () =>
        {
            delete process.env.NODE_ENV;

            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            validateConfig();

            expect(stderrSpy).toHaveBeenCalledWith(
                expect.stringContaining('NODE_ENV is not set')
            );

            stderrSpy.mockRestore();
        });

        it('should warn when NODE_ENV is unknown', () =>
        {
            process.env.NODE_ENV = 'staging';

            const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            validateConfig();

            expect(stderrSpy).toHaveBeenCalledWith(
                expect.stringContaining('Unknown NODE_ENV')
            );

            stderrSpy.mockRestore();
        });

        it('should wrap errors with logger prefix', () =>
        {
            process.env.LOGGER_FILE_ENABLED = 'true';
            delete process.env.LOG_DIR;

            expect(() => validateConfig()).toThrow(/\[Logger\] Configuration validation failed/);
        });
    });
});
