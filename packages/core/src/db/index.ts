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
    closeDatabase,
    getDatabaseInfo,
    createDatabaseConnection,
    checkConnection,
} from './manager';

export type {
    DatabaseClients,
    PoolConfig,
    RetryConfig,
} from './manager';

// Drizzle Config Generator
export { getDrizzleConfig, detectDialect, generateDrizzleConfigFile } from './manager/config-generator.js';
export type { DrizzleConfigOptions } from './manager/config-generator.js';

// Schema Helpers
export { id, timestamps, foreignKey, optionalForeignKey } from './schema';

// Transaction
export { Transactional, getTransaction, runWithTransaction } from './transaction';
export type { TransactionContext, TransactionDB, TransactionalOptions } from './transaction';

// PostgreSQL Error Utilities
export { fromPostgresError } from './postgres-errors.js';
export { Repository } from './repository';