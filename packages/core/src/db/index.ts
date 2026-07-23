/**
 * Database Module Exports
 *
 * Entry point for DB module (Pure re-export only)
 */

// Manager (DB Instance, Factory, Connection)
export {
    createDatabaseFromEnv,
    initDatabase,
    getDatabase,
    setDatabase,
    setDatabaseProvider,
    closeDatabase,
    getDatabaseInfo,
    forceReconnectDatabase,
    createDatabaseConnection,
    checkConnection,
} from './manager';

// Reconnect trigger (query-error driven pool rebuild)
export {
    reportDatabaseError,
    isConnectionLevelError,
    resetConnectionErrorCounter,
} from './manager/reconnect-trigger';

export type {
    DatabaseClients,
    DatabaseInitOptions,
    DatabaseOptions,
    PoolConfig,
    RetryConfig,
    DatabaseProvider,
    DatabaseTransaction,
    DefaultDatabase,
    DrizzleDatabase,
} from './manager';

// Drizzle Config Generator
export { getDrizzleConfig, detectDialect, generateDrizzleConfigFile } from './manager/config-generator';
export type { DrizzleConfigOptions } from './manager/config-generator';

// Schema Helpers
export * from './schema';

// Transaction
export { Transactional, getTransaction, getTransactionContext, runWithTransaction, runInTransaction, onAfterCommit } from './transaction';
export type { TransactionContext, TransactionDB, TransactionalOptions, RunInTransactionOptions, AfterCommitCallback } from './transaction';

// PostgreSQL Error Utilities
export { fromPostgresError } from './postgres-errors';

// Helper Functions
export {
    findOne,
    findMany,
    create,
    createMany,
    upsert,
    updateOne,
    updateMany,
    deleteOne,
    deleteMany,
    count,
} from './helpers';

// Repository Pattern
export { BaseRepository, RepositoryError } from './repository';
