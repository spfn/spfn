/**
 * Database Configuration
 *
 * Database connection and connection pool configuration.
 *
 * Features:
 * - Environment-specific connection pool configuration
 * - Retry configuration with exponential backoff
 * - Environment variable-based configuration
 * - Health check and monitoring configuration
 *
 * Related files:
 * - src/server/core/db/connection.ts (connection logic)
 * - src/server/core/db/index.ts (main exports)
 */
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import { parseNumber, parseBoolean } from '@spfn/core/env';

export interface DatabaseClients
{
    /** Primary database for writes (or both read/write if no replica) */
    write?: PostgresJsDatabase;
    /** Replica database for reads (optional, falls back to write) */
    read?: PostgresJsDatabase;
    /** Raw postgres client for write operations (for cleanup) */
    writeClient?: Sql;
    /** Raw postgres client for read operations (for cleanup) */
    readClient?: Sql;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig
{
    enabled: boolean;
    interval: number;
    reconnect: boolean;
    maxRetries: number;
    retryInterval: number;
}

/**
 * Query performance monitoring configuration
 */
export interface MonitoringConfig
{
    enabled: boolean;
    slowThreshold: number;
    logQueries: boolean;
}

/**
 * Database initialization options
 */
export interface DatabaseOptions
{
    /**
     * Connection pool configuration
     * Overrides environment variables and defaults
     */
    pool?: Partial<PoolConfig>;

    /**
     * Health check configuration
     * Periodic checks to ensure database connection is alive
     */
    healthCheck?: Partial<HealthCheckConfig>;

    /**
     * Query performance monitoring configuration
     * Tracks slow queries and logs performance metrics
     */
    monitoring?: Partial<MonitoringConfig>;
}

/**
 * Connection pool configuration
 *
 * Controls the maximum number of connections and idle timeout behavior.
 */
export interface PoolConfig
{
    /** Maximum number of connections in the pool */
    max: number;
    /** Idle connection timeout in seconds */
    idleTimeout: number;
    /**
     * Maximum connections for the read-replica pool. Defaults to `max`. Set
     * separately (DB_POOL_READ_MAX) so a master-replica app can size the two
     * pools independently and keep `write.max + read.max` under the server's
     * `max_connections` (otherwise each process opens up to 2 × max).
     */
    readMax?: number;
    /**
     * Use server-side prepared statements (postgres-js `prepare`). When
     * `undefined`, the connection layer auto-detects: it is disabled for
     * transaction-mode poolers (PgBouncer/Supavisor, e.g. Supabase :6543),
     * where cached statements break as the pooler rotates backends, and
     * enabled otherwise. Set explicitly (or via `SPFN_DB_PREPARE`) to override.
     */
    prepare?: boolean;
}

/**
 * Retry configuration for exponential backoff algorithm
 *
 * Controls retry behavior when connection attempts fail.
 */
export interface RetryConfig
{
    /** Maximum number of retry attempts */
    maxRetries: number;
    /** Initial delay between retries in milliseconds */
    initialDelay: number;
    /** Maximum delay cap in milliseconds */
    maxDelay: number;
    /** Exponential backoff factor (delay multiplier) */
    factor: number;
}

// ============================================================================
// Environment Variable Parsing Utilities
// ============================================================================

/**
 * Parse environment variable as number with production/development defaults
 *
 * Uses @spfn/core/env parseNumber for consistent parsing across the codebase.
 *
 * @param key - Environment variable name
 * @param prodDefault - Default value for production
 * @param devDefault - Default value for development
 * @returns Parsed number or default based on NODE_ENV
 *
 * @example
 * ```typescript
 * const max = parseEnvNumber('DB_POOL_MAX', 20, 10);
 * // Production: 20, Development: 10, or parsed value from env
 * ```
 */
function parseEnvNumber(
    key: string,
    prodDefault: number,
    devDefault: number,
): number
{
    const isProduction = process.env.NODE_ENV === 'production';
    const defaultValue = isProduction ? prodDefault : devDefault;

    const value = process.env[key];

    if (value === undefined)
    {
        return defaultValue;
    }

    try
    {
        return parseNumber(value, { min: 0, integer: true });
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${key}: ${message}`);
    }
}

/**
 * Parse environment variable as boolean with enhanced format support
 *
 * Uses @spfn/core/env parseBoolean for consistent parsing across the codebase.
 * Supports multiple truthy/falsy formats: true/false, 1/0, yes/no.
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Boolean value
 *
 * @example
 * ```typescript
 * const enabled = parseEnvBoolean('DB_HEALTH_CHECK_ENABLED', true);
 * // Accepts: 'true', '1', 'yes' → true
 * // Accepts: 'false', '0', 'no' → false
 * ```
 */
function parseEnvBoolean(key: string, defaultValue: boolean): boolean
{
    const value = process.env[key];

    if (value === undefined)
    {
        return defaultValue;
    }

    try
    {
        return parseBoolean(value);
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${key}: ${message}`);
    }
}

/**
 * Parse a boolean env var, returning `undefined` when it is not set.
 *
 * Unlike {@link parseEnvBoolean}, this preserves the "unset" state so callers
 * can fall back to their own auto-detection (e.g. pooler-based `prepare`).
 */
function parseEnvBooleanOptional(key: string): boolean | undefined
{
    const value = process.env[key];

    if (value === undefined)
    {
        return undefined;
    }

    try
    {
        return parseBoolean(value);
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${key}: ${message}`);
    }
}

// ============================================================================
// Configuration Builders
// ============================================================================

/**
 * Get connection pool configuration based on environment
 *
 * Configuration priority (highest to lowest):
 * 1. options parameter (passed from ServerConfig)
 * 2. Environment variables (DB_POOL_MAX, DB_POOL_IDLE_TIMEOUT)
 * 3. Default values (based on NODE_ENV)
 *
 * @param options - Optional pool configuration from ServerConfig
 * @returns Pool configuration
 *
 * @example
 * ```typescript
 * // 1. ServerConfig priority (highest)
 * const config = getPoolConfig({ max: 50, idleTimeout: 60 });
 *
 * // 2. Environment variable priority
 * // DB_POOL_MAX=30 DB_POOL_IDLE_TIMEOUT=45
 * const config = getPoolConfig();
 *
 * // 3. Default (lowest)
 * // Production: max=20, idleTimeout=30
 * // Development: max=10, idleTimeout=20
 * ```
 */
export function getPoolConfig(options?: Partial<PoolConfig>): PoolConfig
{
    const max = options?.max ?? parseEnvNumber('DB_POOL_MAX', 20, 10);

    return {
        max,
        idleTimeout: options?.idleTimeout ?? parseEnvNumber('DB_POOL_IDLE_TIMEOUT', 30, 20),
        // Defaults to the write `max`; DB_POOL_READ_MAX lets ops size the replica pool separately
        readMax: options?.readMax ?? parseEnvNumber('DB_POOL_READ_MAX', max, max),
        // Left undefined for connection-layer auto-detection unless explicitly overridden.
        prepare: options?.prepare ?? parseEnvBooleanOptional('SPFN_DB_PREPARE'),
    };
}

/**
 * Get retry configuration based on environment
 *
 * Configuration priority (highest to lowest):
 * 1. Environment variables (DB_RETRY_MAX, DB_RETRY_INITIAL_DELAY, etc.)
 * 2. Default values (based on NODE_ENV)
 *
 * @returns Retry configuration
 *
 * @example
 * ```typescript
 * // Environment variables (highest priority)
 * // DB_RETRY_MAX=10
 * // DB_RETRY_INITIAL_DELAY=200
 * const config = getRetryConfig();
 *
 * // Defaults (lowest priority)
 * // Production: 5 retries, 100ms initial, 10s max, factor 2
 * // Development: 3 retries, 50ms initial, 5s max, factor 2
 * ```
 */
export function getRetryConfig(): RetryConfig
{
    return {
        maxRetries: parseEnvNumber('DB_RETRY_MAX', 5, 3),
        initialDelay: parseEnvNumber('DB_RETRY_INITIAL_DELAY', 100, 50),
        maxDelay: parseEnvNumber('DB_RETRY_MAX_DELAY', 10000, 5000),
        factor: parseEnvNumber('DB_RETRY_FACTOR', 2, 2),
    };
}

/**
 * Build health check configuration with priority resolution
 *
 * Configuration priority (highest to lowest):
 * 1. options parameter
 * 2. Environment variables
 * 3. Default values
 *
 * @param options - Optional health check configuration
 * @returns Health check configuration
 *
 * @example
 * ```typescript
 * // Custom options (highest priority)
 * const config = buildHealthCheckConfig({ enabled: false });
 *
 * // Environment variables
 * // DB_HEALTH_CHECK_ENABLED=true
 * // DB_HEALTH_CHECK_INTERVAL=30000
 * const config = buildHealthCheckConfig();
 *
 * // Defaults (lowest priority)
 * // enabled: true, interval: 60000ms, reconnect: true
 * ```
 */
export function buildHealthCheckConfig(options?: Partial<HealthCheckConfig>): HealthCheckConfig
{
    return {
        enabled: options?.enabled
            ?? parseEnvBoolean('DB_HEALTH_CHECK_ENABLED', true),
        interval: options?.interval
            ?? parseEnvNumber('DB_HEALTH_CHECK_INTERVAL', 60000, 60000),
        reconnect: options?.reconnect
            ?? parseEnvBoolean('DB_HEALTH_CHECK_RECONNECT', true),
        maxRetries: options?.maxRetries
            ?? parseEnvNumber('DB_HEALTH_CHECK_MAX_RETRIES', 3, 3),
        retryInterval: options?.retryInterval
            ?? parseEnvNumber('DB_HEALTH_CHECK_RETRY_INTERVAL', 5000, 5000),
    };
}

/**
 * Build monitoring configuration with priority resolution
 *
 * Configuration priority (highest to lowest):
 * 1. options parameter
 * 2. Environment variables
 * 3. Default values
 *
 * @param options - Optional monitoring configuration
 * @returns Monitoring configuration
 *
 * @example
 * ```typescript
 * // Custom options (highest priority)
 * const config = buildMonitoringConfig({ slowThreshold: 2000 });
 *
 * // Environment variables
 * // DB_MONITORING_ENABLED=true
 * // DB_MONITORING_SLOW_THRESHOLD=500
 * const config = buildMonitoringConfig();
 *
 * // Defaults (lowest priority)
 * // Development: enabled=true, slowThreshold=1000ms, logQueries=false
 * // Production: enabled=false, slowThreshold=1000ms, logQueries=false
 * ```
 */
export function buildMonitoringConfig(options?: Partial<MonitoringConfig>): MonitoringConfig
{
    const isDevelopment = process.env.NODE_ENV !== 'production';

    return {
        enabled: options?.enabled
            ?? parseEnvBoolean('DB_MONITORING_ENABLED', isDevelopment),
        slowThreshold: options?.slowThreshold
            ?? parseEnvNumber('DB_MONITORING_SLOW_THRESHOLD', 1000, 1000),
        logQueries: options?.logQueries
            ?? parseEnvBoolean('DB_MONITORING_LOG_QUERIES', false),
    };
}
