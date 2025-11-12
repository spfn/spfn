/**
 * Database Manager Module Exports
 */

// Database Factory (Environment Detection)
export { createDatabaseFromEnv } from './factory';
export type { DatabaseClients } from './config';

// Database Manager (Singleton Pattern)
export {
    initDatabase,
    getDatabase,
    getDatabaseOrThrow,
    setDatabase,
    closeDatabase,
    getDatabaseInfo,
    getDatabaseMonitoringConfig,
} from './manager';

// Connection Functions
export { createDatabaseConnection, checkConnection } from './connection';

// Configuration Types
export type { PoolConfig, RetryConfig } from './config';