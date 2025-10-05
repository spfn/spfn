/**
 * Database Module Exports
 *
 * Entry point for DB module (Pure re-export only)
 */

// DB Instance & Connection
export { db, getRawDb } from './db-instance.js';
export type { DbConnectionType } from './db-instance.js';
export { getDb } from './db-context.js';

// Connection Functions
export { createDatabaseConnection, checkConnection } from './connection.js';

// Configuration Types
export type { PoolConfig, RetryConfig } from './config.js';

// Repository Pattern
export { Repository } from './repository.js';

// Schema Helpers
export { id, timestamps, foreignKey, optionalForeignKey } from './schema-helpers.js';