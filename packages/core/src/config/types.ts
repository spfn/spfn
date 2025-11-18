/**
 * Environment Variable Configuration Types
 *
 * Centralized type definitions for all environment variables used in @spfn/core.
 */

/**
 * Node.js environment types
 */
export type NodeEnv = 'development' | 'production' | 'test';

/**
 * Log level types
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Database configuration from environment variables
 */
export interface DatabaseEnvConfig
{
    /** Maximum number of connections in the pool */
    DB_POOL_MAX: number;
    /** Idle connection timeout in seconds */
    DB_POOL_IDLE_TIMEOUT: number;

    /** Maximum number of retry attempts */
    DB_RETRY_MAX: number;
    /** Initial delay between retries in milliseconds */
    DB_RETRY_INITIAL_DELAY: number;
    /** Maximum delay cap in milliseconds */
    DB_RETRY_MAX_DELAY: number;
    /** Exponential backoff factor (delay multiplier) */
    DB_RETRY_FACTOR: number;

    /** Enable health check */
    DB_HEALTH_CHECK_ENABLED: boolean;
    /** Health check interval in milliseconds */
    DB_HEALTH_CHECK_INTERVAL: number;
    /** Reconnect on health check failure */
    DB_HEALTH_CHECK_RECONNECT: boolean;
    /** Maximum health check retry attempts */
    DB_HEALTH_CHECK_MAX_RETRIES: number;
    /** Health check retry interval in milliseconds */
    DB_HEALTH_CHECK_RETRY_INTERVAL: number;

    /** Enable query monitoring */
    DB_MONITORING_ENABLED: boolean;
    /** Slow query threshold in milliseconds */
    DB_MONITORING_SLOW_THRESHOLD: number;
    /** Log all queries */
    DB_MONITORING_LOG_QUERIES: boolean;
}

/**
 * Logger configuration from environment variables
 */
export interface LoggerEnvConfig
{
    /** Log level */
    LOG_LEVEL: LogLevel;

    /** Slack webhook URL (optional) */
    SLACK_WEBHOOK_URL?: string;
    /** Slack channel (optional) */
    SLACK_CHANNEL?: string;
    /** Slack bot username (optional) */
    SLACK_USERNAME?: string;

    /** SMTP host (optional) */
    SMTP_HOST?: string;
    /** SMTP port (optional) */
    SMTP_PORT?: number;
    /** SMTP username (optional) */
    SMTP_USER?: string;
    /** SMTP password (optional) */
    SMTP_PASSWORD?: string;

    /** Email from address (optional) */
    EMAIL_FROM?: string;
    /** Email to addresses (optional) */
    EMAIL_TO?: string;
}

/**
 * Next.js client configuration from environment variables
 */
export interface NextjsEnvConfig
{
    /** Next.js app URL (required in server environment) */
    SPFN_APP_URL?: string;
}

/**
 * Core environment variables configuration
 */
export interface CoreEnvConfig
{
    /** Node.js environment */
    NODE_ENV: NodeEnv;
}

/**
 * Complete environment configuration combining all modules
 */
export interface EnvConfig extends
    CoreEnvConfig,
    DatabaseEnvConfig,
    LoggerEnvConfig,
    NextjsEnvConfig
{
}