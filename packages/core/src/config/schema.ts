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
    envUrl,
    envString,
} from '@spfn/core/env';

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

    NODE_ENV: envEnum(['local', 'development', 'production', 'test'] as const, {
        description: 'Node.js runtime environment',
        default: 'local',
    }),

    // ========================================================================
    // Database - Connection
    // ========================================================================

    DATABASE_URL: envString({
        description: 'Primary database connection URL',
        required: false,
        sensitive: true,
        examples: ['postgresql://user:password@localhost:5432/dbname'],
    }),

    DATABASE_WRITE_URL: envString({
        description: 'Write database URL (master-replica pattern)',
        required: false,
        sensitive: true,
        examples: ['postgresql://user:password@master:5432/dbname'],
    }),

    DATABASE_READ_URL: envString({
        description: 'Read database URL (master-replica pattern)',
        required: false,
        sensitive: true,
        examples: ['postgresql://user:password@replica:5432/dbname'],
    }),

    DATABASE_REPLICA_URL: envString({
        description: 'Legacy replica database URL',
        required: false,
        sensitive: true,
        examples: ['postgresql://user:password@replica:5432/dbname'],
    }),

    // ========================================================================
    // Database - Connection Pool
    // ========================================================================

    DB_POOL_MAX: envNumber({
        description: 'Maximum number of database connections in pool',
        default: 10,
        examples: [10, 20, 50],
    }),

    DB_POOL_IDLE_TIMEOUT: envNumber({
        description: 'Database connection idle timeout in seconds',
        default: 30,
        examples: [20, 30, 60],
    }),

    // ========================================================================
    // Database - Retry Configuration
    // ========================================================================

    DB_RETRY_MAX: envNumber({
        description: 'Maximum number of database connection retry attempts',
        default: 3,
        examples: [3, 5, 10],
    }),

    DB_RETRY_INITIAL_DELAY: envNumber({
        description: 'Initial delay between database retry attempts (milliseconds)',
        default: 100,
        examples: [50, 100, 200],
    }),

    DB_RETRY_MAX_DELAY: envNumber({
        description: 'Maximum delay cap for database retry attempts (milliseconds)',
        default: 10000,
        examples: [5000, 10000, 30000],
    }),

    DB_RETRY_FACTOR: envNumber({
        description: 'Exponential backoff factor for database retry delays',
        default: 2,
        examples: [2, 1.5, 3],
    }),

    // ========================================================================
    // Database - Health Check
    // ========================================================================

    DB_HEALTH_CHECK_ENABLED: envBoolean({
        description: 'Enable periodic database health checks',
        default: true,
        examples: [true, false],
    }),

    DB_HEALTH_CHECK_INTERVAL: envNumber({
        description: 'Database health check interval (milliseconds)',
        default: 60000,
        examples: [30000, 60000, 120000],
    }),

    DB_HEALTH_CHECK_RECONNECT: envBoolean({
        description: 'Reconnect to database on health check failure',
        default: true,
        examples: [true, false],
    }),

    DB_HEALTH_CHECK_MAX_RETRIES: envNumber({
        description: 'Maximum health check retry attempts before marking as failed',
        default: 3,
        examples: [3, 5, 10],
    }),

    DB_HEALTH_CHECK_RETRY_INTERVAL: envNumber({
        description: 'Interval between health check retry attempts (milliseconds)',
        default: 5000,
        examples: [5000, 10000, 15000],
    }),

    // ========================================================================
    // Database - Monitoring
    // ========================================================================

    DB_MONITORING_ENABLED: envBoolean({
        description: 'Enable database query performance monitoring',
        default: false,
        examples: [true, false],
    }),

    DB_MONITORING_SLOW_THRESHOLD: envNumber({
        description: 'Slow query threshold for monitoring (milliseconds)',
        default: 1000,
        examples: [500, 1000, 2000],
    }),

    DB_MONITORING_LOG_QUERIES: envBoolean({
        description: 'Log all database queries (not just slow queries)',
        default: false,
        examples: [true, false],
    }),

    // ========================================================================
    // Database - Transaction
    // ========================================================================

    TRANSACTION_TIMEOUT: envNumber({
        description: 'Transaction timeout in milliseconds',
        default: 30000,
        examples: [10000, 30000, 60000],
    }),

    // ========================================================================
    // Database - Development
    // ========================================================================

    DB_DEBUG_TRACE: envBoolean({
        description: 'Enable detailed debug tracing for database operations',
        default: false,
        examples: [true, false],
    }),

    // ========================================================================
    // Drizzle ORM
    // ========================================================================

    DRIZZLE_SCHEMA_PATH: envString({
        description: 'Path to Drizzle schema configuration',
        required: false,
        default: './src/server/entities/config.ts',
        examples: ['./src/db/schema.ts', './src/server/entities/config.ts'],
    }),

    DRIZZLE_OUT_DIR: envString({
        description: 'Output directory for Drizzle migrations',
        required: false,
        default: './drizzle',
        examples: ['./drizzle', './migrations'],
    }),

    // ========================================================================
    // Logger - Core
    // ========================================================================

    LOG_LEVEL: envEnum(['debug', 'info', 'warn', 'error', 'fatal'] as const, {
        description: 'Minimum log level to output',
        default: 'info'
    }),

    // ========================================================================
    // Cache (Redis/Valkey)
    // ========================================================================

    CACHE_URL: envString({
        description: 'Single Redis/Valkey instance URL',
        required: false,
        examples: ['redis://localhost:6379', 'rediss://secure.cache.com:6380'],
        sensitive: true,
    }),

    CACHE_WRITE_URL: envString({
        description: 'Master Redis/Valkey URL for writes (master-replica pattern)',
        required: false,
        examples: ['redis://master:6379'],
        sensitive: true,
    }),

    CACHE_READ_URL: envString({
        description: 'Replica Redis/Valkey URL for reads (master-replica pattern)',
        required: false,
        examples: ['redis://replica:6379'],
        sensitive: true,
    }),

    CACHE_SENTINEL_HOSTS: envString({
        description: 'Comma-separated Redis Sentinel hosts',
        required: false,
        examples: ['sentinel1:26379,sentinel2:26379'],
    }),

    CACHE_CLUSTER_NODES: envString({
        description: 'Comma-separated Redis Cluster nodes',
        required: false,
        examples: ['node1:6379,node2:6379,node3:6379'],
    }),

    CACHE_MASTER_NAME: envString({
        description: 'Redis Sentinel master name',
        required: false,
        examples: ['mymaster'],
    }),

    CACHE_PASSWORD: envString({
        description: 'Redis/Valkey authentication password',
        required: false,
        sensitive: true,
        examples: ['your-redis-password'],
    }),

    CACHE_TLS_REJECT_UNAUTHORIZED: envBoolean({
        description: 'Verify TLS certificates for secure Redis connections',
        default: true,
        examples: [true, false],
    }),

    // ========================================================================
    // Next.js Client
    // ========================================================================
    SPFN_API_URL: envUrl({
        description: 'Next.js API URL (required for client-side API calls)',
        required: true,
        examples: ['http://localhost:3000', 'https://your-app.com'],
    }),

    SPFN_APP_URL: envUrl({
        description: 'Next.js application URL (required for server-side API calls)',
        required: true,
        examples: ['http://localhost:3000', 'https://your-app.com'],
    }),
});