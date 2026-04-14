/**
 * Global Database State Management
 *
 * Manages global database instances using globalThis for persistence across module reloads.
 * This is particularly useful in development with hot module replacement (HMR).
 *
 * The singleton pattern ensures database connections persist even when modules are reloaded
 * during development (e.g., with tsx watch mode).
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import type { DatabaseOptions, MonitoringConfig } from './config';

// ============================================================================
// Global Type Declarations
// ============================================================================

/**
 * Extend globalThis with database-specific properties
 *
 * Using globalThis allows database instances to persist across module reloads,
 * which is essential for development environments with hot module replacement.
 */
declare global
{
    var __SPFN_DB_WRITE__: PostgresJsDatabase<Record<string, unknown>> | undefined;
    var __SPFN_DB_READ__: PostgresJsDatabase<Record<string, unknown>> | undefined;
    var __SPFN_DB_WRITE_CLIENT__: Sql | undefined;
    var __SPFN_DB_READ_CLIENT__: Sql | undefined;
    var __SPFN_DB_HEALTH_CHECK__: NodeJS.Timeout | undefined;
    var __SPFN_DB_MONITORING__: MonitoringConfig | undefined;
    var __SPFN_DB_INIT_OPTIONS__: DatabaseOptions | undefined;
    var __SPFN_DB_CLOSING__: boolean | undefined;
}

// ============================================================================
// Database Instance Accessors
// ============================================================================

/**
 * Get write database instance from global state
 *
 * @internal - This is an internal API. Use getDatabase() from @spfn/core/db instead.
 */
export const getWriteInstance = (): PostgresJsDatabase<Record<string, unknown>> | undefined =>
    globalThis.__SPFN_DB_WRITE__;

/**
 * Set write database instance in global state
 *
 * @internal - This is an internal API used by the database manager.
 */
export const setWriteInstance = (instance: PostgresJsDatabase<Record<string, unknown>> | undefined): void => {
    globalThis.__SPFN_DB_WRITE__ = instance;
};

/**
 * Get read database instance from global state
 *
 * @internal - This is an internal API. Use getDatabase() from @spfn/core/db instead.
 */
export const getReadInstance = (): PostgresJsDatabase<Record<string, unknown>> | undefined =>
    globalThis.__SPFN_DB_READ__;

/**
 * Set read database instance in global state
 *
 * @internal - This is an internal API used by the database manager.
 */
export const setReadInstance = (instance: PostgresJsDatabase<Record<string, unknown>> | undefined): void => {
    globalThis.__SPFN_DB_READ__ = instance;
};

// ============================================================================
// Raw Client Accessors
// ============================================================================

/**
 * Get write client from global state (for cleanup)
 *
 * @internal - This is an internal API used by the database manager.
 */
export const getWriteClient = (): Sql | undefined =>
    globalThis.__SPFN_DB_WRITE_CLIENT__;

/**
 * Set write client in global state
 *
 * @internal - This is an internal API used by the database manager.
 */
export const setWriteClient = (client: Sql | undefined): void => {
    globalThis.__SPFN_DB_WRITE_CLIENT__ = client;
};

/**
 * Get read client from global state (for cleanup)
 *
 * @internal - This is an internal API used by the database manager.
 */
export const getReadClient = (): Sql | undefined =>
    globalThis.__SPFN_DB_READ_CLIENT__;

/**
 * Set read client in global state
 *
 * @internal - This is an internal API used by the database manager.
 */
export const setReadClient = (client: Sql | undefined): void => {
    globalThis.__SPFN_DB_READ_CLIENT__ = client;
};

// ============================================================================
// Health Check Accessors
// ============================================================================

/**
 * Get health check interval from global state
 *
 * @internal - This is an internal API used by the database manager.
 */
export const getHealthCheckInterval = (): NodeJS.Timeout | undefined =>
    globalThis.__SPFN_DB_HEALTH_CHECK__;

/**
 * Set health check interval in global state
 *
 * @internal - This is an internal API used by the database manager.
 */
export const setHealthCheckInterval = (interval: NodeJS.Timeout | undefined): void => {
    globalThis.__SPFN_DB_HEALTH_CHECK__ = interval;
};

// ============================================================================
// Monitoring Config Accessors
// ============================================================================

/**
 * Get monitoring configuration from global state
 *
 * @internal - This is an internal API used by the database manager.
 */
export const getMonitoringConfig = (): MonitoringConfig | undefined =>
    globalThis.__SPFN_DB_MONITORING__;

/**
 * Set monitoring configuration in global state
 *
 * @internal - This is an internal API used by the database manager.
 */
export const setMonitoringConfig = (config: MonitoringConfig | undefined): void => {
    globalThis.__SPFN_DB_MONITORING__ = config;
};

// ============================================================================
// Init Options Accessors
// ============================================================================

/**
 * Get stored database init options from global state
 *
 * Preserved from the original initDatabase() call so that on-demand
 * reconnection (forceReconnectDatabase, health-check recovery) can
 * reconstruct the same pool/monitoring/healthCheck configuration.
 *
 * @internal
 */
export const getInitOptions = (): DatabaseOptions | undefined =>
    globalThis.__SPFN_DB_INIT_OPTIONS__;

/**
 * Set database init options in global state
 *
 * @internal
 */
export const setInitOptions = (options: DatabaseOptions | undefined): void => {
    globalThis.__SPFN_DB_INIT_OPTIONS__ = options;
};

// ============================================================================
// Closing Flag Accessors
// ============================================================================

/**
 * Check whether closeDatabase() is currently tearing down the pool
 *
 * Shared across modules so reconnect paths (both periodic and query-error
 * triggered) can bail out cleanly without swapping a freshly-created pool
 * into a globalThis that closeDatabase is about to clear.
 *
 * @internal
 */
export const getIsClosing = (): boolean =>
    globalThis.__SPFN_DB_CLOSING__ === true;

/**
 * Set the closing flag
 *
 * @internal
 */
export const setIsClosing = (closing: boolean): void => {
    globalThis.__SPFN_DB_CLOSING__ = closing;
};