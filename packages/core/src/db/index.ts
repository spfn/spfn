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
export { getDrizzleConfig, detectDialect, generateDrizzleConfigFile } from './manager/config-generator';
export type { DrizzleConfigOptions } from './manager/config-generator';

// Schema Helpers
export { id, timestamps, foreignKey, optionalForeignKey } from './schema';
export { createFunctionSchema, packageNameToSchema, getSchemaInfo } from './schema-helper';

// Transaction
export { Transactional, getTransaction, runWithTransaction } from './transaction';
export type { TransactionContext, TransactionDB, TransactionalOptions } from './transaction';

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