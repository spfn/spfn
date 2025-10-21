/**
 * Database Configuration
 *
 * DB 연결 및 Connection Pool 설정
 *
 * ✅ 구현 완료:
 * - 환경별 Connection Pool 설정
 * - 재시도 설정 (Exponential Backoff)
 * - 환경변수 기반 설정
 *
 * 🔗 관련 파일:
 * - src/server/core/db/connection.ts (연결 로직)
 * - src/server/core/db/index.ts (메인 export)
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";

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
 * Connection Pool 설정
 */
export interface PoolConfig
{
    max: number;              // 최대 연결 수
    idleTimeout: number;      // 유휴 연결 타임아웃 (초)
}

/**
 * 재시도 설정
 */
export interface RetryConfig
{
    maxRetries: number;       // 최대 재시도 횟수
    initialDelay: number;     // 초기 대기 시간 (ms)
    maxDelay: number;         // 최대 대기 시간 (ms)
    factor: number;           // 지수 증가 배수
}

// ============================================================================
// Environment Variable Parsing Utilities
// ============================================================================

/**
 * Parse environment variable as number with production/development defaults
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
    devDefault: number
): number
{
    const isProduction = process.env.NODE_ENV === 'production';
    const envValue = parseInt(process.env[key] || '', 10);

    // If parsing fails (NaN), use environment-based default
    return isNaN(envValue)
        ? (isProduction ? prodDefault : devDefault)
        : envValue;
}

/**
 * Parse environment variable as boolean
 *
 * @param key - Environment variable name
 * @param defaultValue - Default value if not set
 * @returns Boolean value
 *
 * @example
 * ```typescript
 * const enabled = parseEnvBoolean('DB_HEALTH_CHECK_ENABLED', true);
 * // Returns true if env var is 'true', false if 'false', or default
 * ```
 */
function parseEnvBoolean(key: string, defaultValue: boolean): boolean
{
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
}

// ============================================================================
// Configuration Builders
// ============================================================================

/**
 * 환경별 Connection Pool 설정
 *
 * 우선순위:
 * 1. options 파라미터 (ServerConfig에서 전달)
 * 2. 환경변수 (DB_POOL_MAX, DB_POOL_IDLE_TIMEOUT)
 * 3. 기본값 (NODE_ENV에 따라)
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
    return {
        max: options?.max ?? parseEnvNumber('DB_POOL_MAX', 20, 10),
        idleTimeout: options?.idleTimeout ?? parseEnvNumber('DB_POOL_IDLE_TIMEOUT', 30, 20),
    };
}

/**
 * 환경별 재시도 설정
 *
 * 우선순위: 환경변수 > 기본값 (NODE_ENV에 따라)
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
 * 우선순위: options > env > defaults
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
 * 우선순위: options > env > defaults
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