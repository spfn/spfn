import postgres from 'postgres';
import type { Sql } from 'postgres';

import { logger } from '@spfn/core/logger';
import { ConnectionError } from '@spfn/core/errors';
import { fromPostgresError } from '../postgres-errors';
import type { PoolConfig, RetryConfig } from './config';

const dbLogger = logger.child('@spfn/core:database');

/**
 * Connection timeout in seconds
 *
 * Timeout for PostgreSQL server connection and initial query execution.
 */
const DEFAULT_CONNECT_TIMEOUT = 10;

/**
 * Delay execution for specified milliseconds
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
function delay(ms: number): Promise<void>
{
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mask password in connection string for secure logging
 *
 * Replaces password with *** to prevent credentials from appearing in logs.
 *
 * @param connectionString - Database connection string
 * @returns Masked connection string with password replaced by ***
 *
 * @example
 * ```typescript
 * maskConnectionString('postgresql://user:password@host:5432/db')
 * // Returns: 'postgresql://user:***@host:5432/db'
 *
 * maskConnectionString('postgresql://user:p@ssw0rd@host:5432/db')
 * // Returns: 'postgresql://user:***@host:5432/db'
 * ```
 */
function maskConnectionString(connectionString: string): string
{
    try
    {
        // Safe password masking using URL parsing
        const url = new URL(connectionString);
        if (url.password)
        {
            // Replace password with ***
            return connectionString.replace(`:${url.password}@`, ':***@');
        }
        return connectionString;
    }
    catch
    {
        // Fallback to regex if URL parsing fails (safe only for passwords without @)
        return connectionString.replace(/(:\/\/[^:/@]+:)([^@]+)(@)/, '$1***$3');
    }
}

/**
 * Check if error is an authentication error
 *
 * Detects password authentication failures, missing passwords, and invalid authorization.
 *
 * @param error - Error object to check
 * @returns true if error is authentication-related, false otherwise
 */
function isAuthenticationError(error: Error): boolean
{
    const message = error.message.toLowerCase();
    return message.includes('password authentication failed') ||
           message.includes('no password supplied') ||
           message.includes('authentication failed') ||
           message.includes('invalid authorization');
}

/**
 * Check if error indicates database does not exist
 *
 * @param error - Error object to check
 * @returns true if database not found, false otherwise
 */
function isDatabaseNotFoundError(error: Error): boolean
{
    const message = error.message.toLowerCase();
    return message.includes('database') && message.includes('does not exist');
}

/**
 * Check if error is SSL/TLS related
 *
 * Detects SSL, TLS, certificate, and verification errors.
 *
 * @param error - Error object to check
 * @returns true if SSL/TLS error, false otherwise
 */
function isSSLError(error: Error): boolean
{
    const message = error.message.toLowerCase();
    return message.includes('ssl') ||
           message.includes('tls') ||
           message.includes('certificate') ||
           message.includes('self signed certificate') ||
           message.includes('unable to verify');
}

/**
 * Check if error should not be retried
 *
 * Non-retryable errors include:
 * - Authentication failures (wrong password, username, etc.)
 * - Database not found errors
 * - SSL/TLS configuration errors
 *
 * These errors indicate configuration issues that won't be resolved by retrying.
 *
 * @param error - Error object to check
 * @returns true if error should not be retried, false if retry is appropriate
 */
function isNonRetryableError(error: Error): boolean
{
    return isAuthenticationError(error) ||
           isDatabaseNotFoundError(error) ||
           isSSLError(error);
}

/**
 * Validate retry configuration parameters
 *
 * Ensures all retry config values are within valid ranges.
 *
 * @param retryConfig - Retry configuration to validate
 * @throws ConnectionError if any configuration value is invalid
 */
function validateRetryConfig(retryConfig: RetryConfig): void
{
    if (retryConfig.maxRetries < 0)
    {
        throw new ConnectionError(`maxRetries must be non-negative, got ${retryConfig.maxRetries}`);
    }

    if (retryConfig.initialDelay <= 0)
    {
        throw new ConnectionError(`initialDelay must be positive, got ${retryConfig.initialDelay}`);
    }

    if (retryConfig.factor <= 0)
    {
        throw new ConnectionError(`factor must be positive, got ${retryConfig.factor}`);
    }

    if (retryConfig.maxDelay <= 0)
    {
        throw new ConnectionError(`maxDelay must be positive, got ${retryConfig.maxDelay}`);
    }
}

/**
 * Validate pool configuration parameters
 *
 * Ensures pool configuration values are valid.
 *
 * @param poolConfig - Pool configuration to validate
 * @throws ConnectionError if configuration is invalid
 */
function validatePoolConfig(poolConfig: PoolConfig): void
{
    if (poolConfig.max <= 0)
    {
        throw new ConnectionError(`pool max must be positive, got ${poolConfig.max}`);
    }
}

/**
 * Create database connection with exponential backoff retry strategy
 *
 * Attempts to establish a database connection with automatic retries using
 * exponential backoff with jitter. Non-retryable errors (authentication,
 * database not found, SSL issues) fail immediately.
 *
 * Retry Strategy:
 * - Exponential backoff: delay = initialDelay * (factor ^ attempt)
 * - Jitter: randomized delay between 50-100% of calculated delay
 * - Max delay cap: prevents excessive wait times
 *
 * @param connectionString - PostgreSQL connection string
 * @param poolConfig - Connection pool configuration
 * @param retryConfig - Retry configuration (max attempts, delays, etc.)
 * @returns PostgreSQL client instance
 * @throws ConnectionError if connection fails after all retries or on non-retryable errors
 *
 * @example
 * ```typescript
 * const client = await createDatabaseConnection(
 *   'postgresql://localhost:5432/mydb',
 *   { max: 20, idleTimeout: 30 },
 *   { maxRetries: 5, initialDelay: 100, maxDelay: 10000, factor: 2 }
 * );
 * ```
 */
export async function createDatabaseConnection(
    connectionString: string,
    poolConfig: PoolConfig,
    retryConfig: RetryConfig
) {
    // Validate input parameters
    if (!connectionString)
    {
        throw new ConnectionError('Connection string must be a non-empty string');
    }

    validateRetryConfig(retryConfig);
    validatePoolConfig(poolConfig);

    let lastError: Error | undefined;
    let client: Sql | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++)
    {
        try
        {
            // Create PostgreSQL client
            client = postgres(connectionString, {
                max: poolConfig.max,
                idle_timeout: poolConfig.idleTimeout,
                connect_timeout: DEFAULT_CONNECT_TIMEOUT,
            });

            // Test connection with simple query
            // connect_timeout is applied at DB level, so Promise.race is not needed
            await client`SELECT 1 as test`;

            // Connection successful
            if (attempt > 0)
            {
                dbLogger.info(
                    'Database connected successfully',
                    { retriesNeeded: attempt }
                );
            }
            else
            {
                dbLogger.info('Database connected successfully');
            }

            return client;
        }
        catch (error)
        {
            // Cleanup failed client (prevent resource leak)
            if (client)
            {
                try
                {
                    await client.end();
                }
                catch
                {
                    // Ignore cleanup errors (client may already be closed)
                }

                client = undefined;
            }

            lastError = fromPostgresError(error);

            // Throw immediately on non-retryable errors
            if (isNonRetryableError(lastError))
            {
                dbLogger.error(
                    'Cannot connect to database (non-retryable error)',
                    lastError,
                    {
                        connectionString: maskConnectionString(connectionString),
                        poolConfig: {
                            max: poolConfig.max,
                            idleTimeout: poolConfig.idleTimeout,
                            connectTimeout: DEFAULT_CONNECT_TIMEOUT,
                        },
                        reason: isAuthenticationError(lastError)
                            ? 'authentication_failed'
                            : isDatabaseNotFoundError(lastError)
                            ? 'database_not_found'
                            : 'ssl_error',
                    }
                );

                throw new ConnectionError(
                    `Cannot connect to database: ${lastError.message}`
                );
            }

            // Retry if not last attempt
            if (attempt < retryConfig.maxRetries)
            {
                // Calculate exponential backoff with jitter
                const baseDelay = Math.min(
                    retryConfig.initialDelay * Math.pow(retryConfig.factor, attempt),
                    retryConfig.maxDelay
                );
                // Jitter: randomize delay between 50-100% (prevents thundering herd)
                const jitter = 0.5 + Math.random() * 0.5;
                const delayMs = Math.floor(baseDelay * jitter);

                dbLogger.warn(
                    'Database connection failed, retrying...',
                    lastError,
                    {
                        attempt: attempt + 1,
                        totalAttempts: retryConfig.maxRetries + 1,
                        nextRetryIn: delayMs,
                        connectionString: maskConnectionString(connectionString),
                        poolConfig: {
                            max: poolConfig.max,
                            idleTimeout: poolConfig.idleTimeout,
                            connectTimeout: DEFAULT_CONNECT_TIMEOUT,
                        },
                    }
                );

                await delay(delayMs);
            }
        }
    }

    // All retries failed
    // lastError is assigned at least once in the loop, so it cannot be undefined
    if (!lastError)
    {
        throw new ConnectionError(
            'Unexpected error: no error recorded after failed connection attempts'
        );
    }

    dbLogger.error(
        'Failed to connect to database after all retries',
        lastError,
        {
            totalAttempts: retryConfig.maxRetries + 1,
            connectionString: maskConnectionString(connectionString),
            poolConfig: {
                max: poolConfig.max,
                idleTimeout: poolConfig.idleTimeout,
                connectTimeout: DEFAULT_CONNECT_TIMEOUT,
            },
            retryConfig: {
                maxRetries: retryConfig.maxRetries,
                initialDelay: retryConfig.initialDelay,
                factor: retryConfig.factor,
                maxDelay: retryConfig.maxDelay,
            },
        }
    );

    throw new ConnectionError(
        `Failed to connect to database after ${retryConfig.maxRetries + 1} attempts: ${lastError.message}`
    );
}

/**
 * Check database connection health
 *
 * Uses the client's configured timeout settings (connect_timeout, etc.).
 * Executes a simple SELECT query to verify the connection is alive.
 *
 * @param client - PostgreSQL client to check
 * @returns true if connection is healthy, false otherwise
 *
 * @example
 * ```typescript
 * const isHealthy = await checkConnection(client);
 * if (!isHealthy) {
 *   console.error('Database connection is down');
 * }
 * ```
 */
export async function checkConnection(client: Sql): Promise<boolean>
{
    try
    {
        // Health check query
        // Uses client's default timeout settings
        await client`SELECT 1 as health_check`;

        return true;
    }
    catch (error)
    {
        const errorObj = fromPostgresError(error);

        dbLogger.error(
            'Database health check failed',
            errorObj,
            { errorType: errorObj.name }
        );

        return false;
    }
}