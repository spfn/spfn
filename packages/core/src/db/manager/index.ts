/**
 * Database Manager Module Exports
 */

// Database Factory (Environment Detection)
export { createDatabaseFromEnv } from './factory.js';
export type { DatabaseClients } from './config.js';

// Database Manager (Singleton Pattern)
export {
    initDatabase,
    getDatabase,
    setDatabase,
    closeDatabase,
    getDatabaseInfo,
    getDatabaseMonitoringConfig,
} from './manager.js';

// Connection Functions
export { createDatabaseConnection, checkConnection } from './connection.js';

// Configuration Types
export type { PoolConfig, RetryConfig } from './config.js';