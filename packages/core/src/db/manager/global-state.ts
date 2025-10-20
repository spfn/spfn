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
import type { MonitoringConfig } from './config.js';

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
    var __SPFN_DB_WRITE__: PostgresJsDatabase | undefined;
    var __SPFN_DB_READ__: PostgresJsDatabase | undefined;
    var __SPFN_DB_WRITE_CLIENT__: Sql | undefined;
    var __SPFN_DB_READ_CLIENT__: Sql | undefined;
    var __SPFN_DB_HEALTH_CHECK__: NodeJS.Timeout | undefined;
    var __SPFN_DB_MONITORING__: MonitoringConfig | undefined;
}

// ============================================================================
// Database Instance Accessors
// ============================================================================

/**
 * Get write database instance from global state
 */
export const getWriteInstance = (): PostgresJsDatabase | undefined =>
    globalThis.__SPFN_DB_WRITE__;

/**
 * Set write database instance in global state
 */
export const setWriteInstance = (instance: PostgresJsDatabase | undefined): void => {
    globalThis.__SPFN_DB_WRITE__ = instance;
};

/**
 * Get read database instance from global state
 */
export const getReadInstance = (): PostgresJsDatabase | undefined =>
    globalThis.__SPFN_DB_READ__;

/**
 * Set read database instance in global state
 */
export const setReadInstance = (instance: PostgresJsDatabase | undefined): void => {
    globalThis.__SPFN_DB_READ__ = instance;
};

// ============================================================================
// Raw Client Accessors
// ============================================================================

/**
 * Get write client from global state (for cleanup)
 */
export const getWriteClient = (): Sql | undefined =>
    globalThis.__SPFN_DB_WRITE_CLIENT__;

/**
 * Set write client in global state
 */
export const setWriteClient = (client: Sql | undefined): void => {
    globalThis.__SPFN_DB_WRITE_CLIENT__ = client;
};

/**
 * Get read client from global state (for cleanup)
 */
export const getReadClient = (): Sql | undefined =>
    globalThis.__SPFN_DB_READ_CLIENT__;

/**
 * Set read client in global state
 */
export const setReadClient = (client: Sql | undefined): void => {
    globalThis.__SPFN_DB_READ_CLIENT__ = client;
};

// ============================================================================
// Health Check Accessors
// ============================================================================

/**
 * Get health check interval from global state
 */
export const getHealthCheckInterval = (): NodeJS.Timeout | undefined =>
    globalThis.__SPFN_DB_HEALTH_CHECK__;

/**
 * Set health check interval in global state
 */
export const setHealthCheckInterval = (interval: NodeJS.Timeout | undefined): void => {
    globalThis.__SPFN_DB_HEALTH_CHECK__ = interval;
};

// ============================================================================
// Monitoring Config Accessors
// ============================================================================

/**
 * Get monitoring configuration from global state
 */
export const getMonitoringConfig = (): MonitoringConfig | undefined =>
    globalThis.__SPFN_DB_MONITORING__;

/**
 * Set monitoring configuration in global state
 */
export const setMonitoringConfig = (config: MonitoringConfig | undefined): void => {
    globalThis.__SPFN_DB_MONITORING__ = config;
};