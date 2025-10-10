/**
 * Database Manager Module Exports
 */

// DB Instance & Connection (Backward Compatibility)
export { db, getRawDb } from './instance.js';
export type { DbConnectionType } from './instance.js';

// DB Context
export { getDb } from './context.js';

// Database Factory (Environment Detection)
export { createDatabaseFromEnv } from './factory.js';
export type { DatabaseClients } from './factory.js';

// Database Manager (Singleton Pattern)
export {
    initDatabase,
    getDatabase,
    setDatabase,
    closeDatabase,
    getDatabaseInfo,
} from './manager.js';

// Connection Functions
export { createDatabaseConnection, checkConnection } from './connection.js';

// Configuration Types
export type { PoolConfig, RetryConfig } from './config.js';

// Wrapped DB
export { WrappedDb } from './wrapped-db.js';