/**
 * AsyncLocalStorage-based Transaction Context
 *
 * Uses Node.js AsyncLocalStorage to propagate transactions throughout the async call chain.
 *
 * ✅ Implemented:
 * - AsyncLocalStorage-based context management
 * - Transaction storage/retrieval functions
 * - Type-safe transaction propagation
 * - Transaction propagation across async chains
 *
 * ⚠️ Needs improvement:
 * - Nested transaction handling (currently ignores outer transaction)
 * - Transaction timeout detection
 *
 * 💡 Future considerations:
 * - Add transaction ID (for debugging/tracing)
 * - Track transaction start time (for performance monitoring)
 * - Store transaction metadata (route info, user info, etc.)
 * - Savepoint support (nested transactions)
 * - Transaction isolation level configuration
 *
 * 🔗 Related files:
 * - src/utils/transaction.ts (Transactional middleware)
 * - src/db/db-context.ts (getDb helper)
 */
import { AsyncLocalStorage } from 'async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Transaction database type
 * Record<string, never> represents an empty schema; actual schema is determined at runtime
 */
export type TransactionDB = PostgresJsDatabase;

/**
 * Transaction context stored in AsyncLocalStorage
 */
export type TransactionContext = {
    tx: TransactionDB;
};

/**
 * Global AsyncLocalStorage instance for transaction context
 */
export const asyncContext = new AsyncLocalStorage<TransactionContext>();

/**
 * Get current transaction from AsyncLocalStorage
 *
 * @returns Transaction if available, null otherwise
 */
export function getTransaction(): TransactionDB | null
{
    const context = asyncContext.getStore();
    return context?.tx ?? null;
}

/**
 * Run a function within a transaction context
 *
 * The transaction will be available to all async operations within the callback
 * via getTransaction()
 *
 * @param tx - Drizzle transaction object
 * @param callback - Function to run within transaction context
 * @returns Result of the callback
 */
export function runWithTransaction<T>(
    tx: TransactionDB,
    callback: () => Promise<T>
): Promise<T>
{
    return asyncContext.run({ tx }, callback);
}