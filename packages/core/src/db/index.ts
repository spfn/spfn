/**
 * Database Module Exports
 *
 * Entry point for DB module (Pure re-export only)
 */

// DB Instance & Connection (Backward Compatibility)
export { db, getRawDb } from './db-instance.js';
export type { DbConnectionType } from './db-instance.js';
export { getDb } from './db-context.js';

// Database Factory (Environment Detection)
export { createDatabaseFromEnv } from './db-factory.js';
export type { DatabaseClients } from './db-factory.js';

// Database Manager (Singleton Pattern)
export {
    initDatabase,
    getDatabase,
    setDatabase,
    closeDatabase,
    getDatabaseInfo,
} from './db-manager.js';

// Connection Functions
export { createDatabaseConnection, checkConnection } from './connection.js';

// Configuration Types
export type { PoolConfig, RetryConfig } from './config.js';

// Repository Pattern
export { Repository } from './repository.js';

// Schema Helpers
export { id, timestamps, foreignKey, optionalForeignKey } from './schema-helpers.js';