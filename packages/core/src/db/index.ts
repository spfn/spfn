/**
 * Database Module Exports
 *
 * Entry point for DB module (Pure re-export only)
 */

// Manager (DB Instance, Factory, Connection)
export {
    db,
    getRawDb,
    getDb,
    createDatabaseFromEnv,
    initDatabase,
    getDatabase,
    setDatabase,
    closeDatabase,
    getDatabaseInfo,
    createDatabaseConnection,
    checkConnection,
    WrappedDb,
} from './manager/index.js';

export type {
    DbConnectionType,
    DatabaseClients,
    PoolConfig,
    RetryConfig,
} from './manager/index.js';

// Drizzle Config Generator
export { getDrizzleConfig, detectDialect, generateDrizzleConfigFile } from './manager/config-generator.js';
export type { DrizzleConfigOptions } from './manager/config-generator.js';

// Repository Pattern
export {
    Repository,
    getRepository,
    clearRepositoryCache,
    getRepositoryCacheSize,
    QueryBuilder,
    getTableName,
} from './repository/index.js';

export type {
    Pageable,
    Page,
} from './repository/index.js';

// Schema Helpers
export { id, timestamps, foreignKey, optionalForeignKey } from './schema/index.js';

// Transaction
export { Transactional, getTransaction, runWithTransaction } from './transaction/index.js';
export type { TransactionContext, TransactionDB, TransactionalOptions } from './transaction/index.js';