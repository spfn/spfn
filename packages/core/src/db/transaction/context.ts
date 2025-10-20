/**
 * AsyncLocalStorage-based Transaction Context
 *
 * Uses Node.js AsyncLocalStorage to propagate transactions throughout the async call chain.
 *
 * Features:
 * - AsyncLocalStorage-based context management
 * - Type-safe transaction propagation across async chains
 * - Transaction ID tracking for debugging and tracing
 * - Nested transaction detection and logging
 * - Transaction nesting level tracking
 */
import { AsyncLocalStorage } from 'async_hooks';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { logger } from '../../logger'; // Assuming logger is accessible

/**
 * Transaction database type
 * Record<string, never> represents an empty schema; actual schema is determined at runtime
 */
export type TransactionDB = PostgresJsDatabase;

const txLogger = logger.child('transaction');

/**
 * Transaction context stored in AsyncLocalStorage
 */
export type TransactionContext = {
    /** The actual Drizzle transaction object */
    tx: TransactionDB;
    /** Unique transaction ID for logging and tracing */
    txId: string; // Add txId to the context
    level: number;
};

/**
 * Global AsyncLocalStorage instance for transaction context
 */
export const asyncContext = new AsyncLocalStorage<TransactionContext>();

/**
 * Get current transaction object and metadata from AsyncLocalStorage
 *
 * @returns TransactionContext if available, null otherwise
 */
export function getTransactionContext(): TransactionContext | null
{
    return asyncContext.getStore() ?? null;
}

/**
 * Get current transaction from AsyncLocalStorage
 *
 * @returns Transaction if available, null otherwise
 */
export function getTransaction(): TransactionDB | null
{
    const context = getTransactionContext();
    return context?.tx ?? null;
}

/**
 * Get current transaction ID from AsyncLocalStorage
 *
 * @returns Transaction ID if available, null otherwise
 */
export function getTransactionId(): string | null
{
    const context = getTransactionContext();
    return context?.txId ?? null;
}

/**
 * Run a function within a transaction context
 *
 * The transaction will be available to all async operations within the callback
 * via getTransaction().
 *
 * @param tx - Drizzle transaction object
 * @param txId - Unique ID for the transaction
 * @param callback - Function to run within transaction context
 * @returns Result of the callback
 */
export function runWithTransaction<T>(
    tx: TransactionDB,
    txId: string, // Add txId parameter
    callback: () => Promise<T>
): Promise<T>
{
    const existingContext = getTransactionContext();

    // Determine the current transaction nesting level
    const newLevel = existingContext ? existingContext.level + 1 : 1;

    if (existingContext)
    {
        // Nested transaction detected. This means Drizzle will use a SAVEPOINT.
        txLogger.info('Nested transaction started (SAVEPOINT)', {
            outerTxId: existingContext.txId,
            innerTxId: txId,
            level: newLevel,
        });
    }
    else
    {
        // Root transaction
        txLogger.debug('Root transaction context set', { txId, level: newLevel });
    }

    // Store transaction, new ID, and the current nesting level
    return asyncContext.run({ tx, txId, level: newLevel }, callback);
}