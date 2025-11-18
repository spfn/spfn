/**
 * Core Package Environment Variable Schema
 *
 * Centralized schema definition for all environment variables used in @spfn/core.
 * This provides type safety, validation, and documentation for environment configuration.
 *
 * @module config/schema
 */

import {
    defineEnvSchema,
    envEnum,
    envNumber,
    envBoolean,
    envString,
    envUrl,
} from '../env';
import type { NodeEnv, LogLevel } from './types';

/**
 * Check if running in development environment
 */
const isDev = process.env.NODE_ENV === 'development';

/**
 * Check if running in production environment
 */
const isProd = process.env.NODE_ENV === 'production';

/**
 * Core package environment variable schema
 *
 * Defines all environment variables with:
 * - Type information
 * - Default values
 * - Validation rules
 * - Documentation
 *
 * @example
 * ```typescript
 * import { coreEnvSchema } from '@spfn/core/config';
 *
 * // Access schema information
 * console.log(coreEnvSchema.DB_POOL_MAX.description);
 * console.log(coreEnvSchema.DB_POOL_MAX.default);
 * ```
 */
export const coreEnvSchema = defineEnvSchema({
    // ========================================================================
    // Core Environment
    // ========================================================================

    NODE_ENV: {
        ...envEnum(['development', 'production', 'test'] as const, {
            description: 'Node.js runtime environment',
            default: 'development' as NodeEnv,
            category: 'core',
        }),
        key: 'NODE_ENV',
    },

    // ========================================================================
    // Database - Connection Pool
    // ========================================================================

    DB_POOL_MAX: {
        ...envNumber({
            description: 'Maximum number of database connections in pool',
            default: isProd ? 20 : 10,
            category: 'database',
            examples: ['10', '20', '50'],
        }),
        key: 'DB_POOL_MAX',
    },

    DB_POOL_IDLE_TIMEOUT: {
        ...envNumber({
            description: 'Database connection idle timeout in seconds',
            default: isProd ? 30 : 20,
            category: 'database',
            examples: ['20', '30', '60'],
        }),
        key: 'DB_POOL_IDLE_TIMEOUT',
    },

    // ========================================================================
    // Database - Retry Configuration
    // ========================================================================

    DB_RETRY_MAX: {
        ...envNumber({
            description: 'Maximum number of database connection retry attempts',
            default: isProd ? 5 : 3,
            category: 'database',
            examples: ['3', '5', '10'],
        }),
        key: 'DB_RETRY_MAX',
    },

    DB_RETRY_INITIAL_DELAY: {
        ...envNumber({
            description: 'Initial delay between database retry attempts (milliseconds)',
            default: isProd ? 100 : 50,
            category: 'database',
            examples: ['50', '100', '200'],
        }),
        key: 'DB_RETRY_INITIAL_DELAY',
    },

    DB_RETRY_MAX_DELAY: {
        ...envNumber({
            description: 'Maximum delay cap for database retry attempts (milliseconds)',
            default: isProd ? 10000 : 5000,
            category: 'database',
            examples: ['5000', '10000', '30000'],
        }),
        key: 'DB_RETRY_MAX_DELAY',
    },

    DB_RETRY_FACTOR: {
        ...envNumber({
            description: 'Exponential backoff factor for database retry delays',
            default: 2,
            category: 'database',
            examples: ['2', '1.5', '3'],
        }),
        key: 'DB_RETRY_FACTOR',
    },

    // ========================================================================
    // Database - Health Check
    // ========================================================================

    DB_HEALTH_CHECK_ENABLED: {
        ...envBoolean({
            description: 'Enable periodic database health checks',
            default: true,
            category: 'database',
            examples: ['true', 'false'],
        }),
        key: 'DB_HEALTH_CHECK_ENABLED',
    },

    DB_HEALTH_CHECK_INTERVAL: {
        ...envNumber({
            description: 'Database health check interval (milliseconds)',
            default: 60000,
            category: 'database',
            examples: ['30000', '60000', '120000'],
        }),
        key: 'DB_HEALTH_CHECK_INTERVAL',
    },

    DB_HEALTH_CHECK_RECONNECT: {
        ...envBoolean({
            description: 'Reconnect to database on health check failure',
            default: true,
            category: 'database',
            examples: ['true', 'false'],
        }),
        key: 'DB_HEALTH_CHECK_RECONNECT',
    },

    DB_HEALTH_CHECK_MAX_RETRIES: {
        ...envNumber({
            description: 'Maximum health check retry attempts before marking as failed',
            default: 3,
            category: 'database',
            examples: ['3', '5', '10'],
        }),
        key: 'DB_HEALTH_CHECK_MAX_RETRIES',
    },

    DB_HEALTH_CHECK_RETRY_INTERVAL: {
        ...envNumber({
            description: 'Interval between health check retry attempts (milliseconds)',
            default: 5000,
            category: 'database',
            examples: ['5000', '10000', '15000'],
        }),
        key: 'DB_HEALTH_CHECK_RETRY_INTERVAL',
    },

    // ========================================================================
    // Database - Monitoring
    // ========================================================================

    DB_MONITORING_ENABLED: {
        ...envBoolean({
            description: 'Enable database query performance monitoring',
            default: isDev,
            category: 'database',
            examples: ['true', 'false'],
        }),
        key: 'DB_MONITORING_ENABLED',
    },

    DB_MONITORING_SLOW_THRESHOLD: {
        ...envNumber({
            description: 'Slow query threshold for monitoring (milliseconds)',
            default: 1000,
            category: 'database',
            examples: ['500', '1000', '2000'],
        }),
        key: 'DB_MONITORING_SLOW_THRESHOLD',
    },

    DB_MONITORING_LOG_QUERIES: {
        ...envBoolean({
            description: 'Log all database queries (not just slow queries)',
            default: false,
            category: 'database',
            examples: ['true', 'false'],
        }),
        key: 'DB_MONITORING_LOG_QUERIES',
    },

    // ========================================================================
    // Logger - Core
    // ========================================================================

    LOG_LEVEL: {
        ...envEnum(['debug', 'info', 'warn', 'error', 'fatal'] as const, {
            description: 'Minimum log level to output',
            default: (isDev ? 'debug' : isProd ? 'info' : 'warn') as LogLevel,
            category: 'logger',
            examples: ['debug', 'info', 'warn', 'error', 'fatal'],
        }),
        key: 'LOG_LEVEL',
    },

    // ========================================================================
    // Logger - Slack Transport
    // ========================================================================

    SLACK_WEBHOOK_URL: {
        ...envUrl({
            description: 'Slack webhook URL for error notifications',
            required: false,
            category: 'logger',
            sensitive: true,
            examples: ['https://hooks.slack.com/services/YOUR/WEBHOOK/URL'],
        }),
        key: 'SLACK_WEBHOOK_URL',
    },

    SLACK_CHANNEL: {
        ...envString({
            description: 'Slack channel for log notifications',
            required: false,
            category: 'logger',
            examples: ['#errors', '#alerts', '#monitoring'],
        }),
        key: 'SLACK_CHANNEL',
    },

    SLACK_USERNAME: {
        ...envString({
            description: 'Slack bot username for log messages',
            required: false,
            default: 'Logger Bot',
            category: 'logger',
            examples: ['Logger Bot', 'Alert Bot', 'Monitor Bot'],
        }),
        key: 'SLACK_USERNAME',
    },

    // ========================================================================
    // Logger - Email Transport
    // ========================================================================

    SMTP_HOST: {
        ...envString({
            description: 'SMTP server host for email notifications',
            required: false,
            category: 'logger',
            examples: ['smtp.gmail.com', 'smtp.sendgrid.net', 'smtp.mailgun.org'],
        }),
        key: 'SMTP_HOST',
    },

    SMTP_PORT: {
        ...envNumber({
            description: 'SMTP server port',
            required: false,
            category: 'logger',
            examples: ['587', '465', '25'],
        }),
        key: 'SMTP_PORT',
    },

    SMTP_USER: {
        ...envString({
            description: 'SMTP authentication username',
            required: false,
            category: 'logger',
            sensitive: true,
            examples: ['user@example.com'],
        }),
        key: 'SMTP_USER',
    },

    SMTP_PASSWORD: {
        ...envString({
            description: 'SMTP authentication password',
            required: false,
            category: 'logger',
            sensitive: true,
            examples: ['your-smtp-password'],
        }),
        key: 'SMTP_PASSWORD',
    },

    EMAIL_FROM: {
        ...envString({
            description: 'Email sender address for log notifications',
            required: false,
            category: 'logger',
            examples: ['alerts@example.com', 'noreply@example.com'],
        }),
        key: 'EMAIL_FROM',
    },

    EMAIL_TO: {
        ...envString({
            description: 'Email recipient addresses (comma-separated for multiple)',
            required: false,
            category: 'logger',
            examples: ['admin@example.com', 'admin@example.com,dev@example.com'],
        }),
        key: 'EMAIL_TO',
    },

    // ========================================================================
    // Next.js Client
    // ========================================================================

    SPFN_APP_URL: {
        ...envUrl({
            description: 'Next.js application URL (required for server-side API calls)',
            required: false,
            category: 'nextjs',
            examples: ['http://localhost:3000', 'https://your-app.com'],
        }),
        key: 'SPFN_APP_URL',
    },
});

/**
 * Type-safe environment variable keys
 */
export type CoreEnvKey = keyof typeof coreEnvSchema;

/**
 * Get all environment variable keys
 */
export const coreEnvKeys = Object.keys(coreEnvSchema) as CoreEnvKey[];