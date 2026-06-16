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
    setDatabase,
    closeDatabase,
    getDatabaseInfo,
    getDatabaseMonitoringConfig,
    forceReconnectDatabase,
} from './manager';

// Reconnect Trigger
export {
    reportDatabaseError,
    isConnectionLevelError,
    resetConnectionErrorCounter,
} from './reconnect-trigger';

// Connection Functions
export { createDatabaseConnection, checkConnection } from './connection';

// Configuration Types
export type { PoolConfig, RetryConfig } from './config';
export type { DbConnectionType, GetDatabaseFn } from './types';
