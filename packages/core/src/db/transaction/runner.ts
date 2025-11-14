/**
 * Transaction Runner
 *
 * Standalone transaction execution utility for scripts, migrations, and CLI commands.
 * Provides the same transaction management capabilities as the Transactional middleware
 * but without Hono dependency.
 *
 * Features:
 * - Automatic transaction management (start/commit/rollback)
 * - Transaction propagation via AsyncLocalStorage
 * - PostgreSQL-level timeout with automatic rollback guarantee
 * - Execution time tracking and slow transaction warnings
 * - UUID-based transaction IDs for debugging
 *
 * Timeout Implementation:
 * Uses PostgreSQL `SET LOCAL statement_timeout` to ensure database-level timeout
 * enforcement. This guarantees that long-running transactions are actually rolled
 * back at the database level, preventing data inconsistency.
 *
 * @example
 * ```typescript
 * import { runInTransaction } from '@spfn/core/db/transaction';
 * import { users } from './schema';
 *
 * // Simple usage
 * const user = await runInTransaction(async (tx) => {
 *   const [user] = await tx.insert(users).values({ name: 'John' }).returning();
 *   return user;
 * });
 *
 * // With options
 * await runInTransaction(
 *   async (tx) => {
 *     await tx.insert(users).values({ name: 'Jane' });
 *     await tx.insert(profiles).values({ userId: 1 });
 *   },
 *   {
 *     context: 'migration:add-user',
 *     timeout: 60000,
 *     slowThreshold: 2000,
 *   }
 * );
 * ```
 */
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { logger } from '../../logger';
import { getDatabase } from '../manager';
import { runWithTransaction, getTransactionContext, type TransactionDB } from './context';
import { TransactionError } from '../../errors';
import { getEnvVar } from '../../env';

/**
 * Transaction runner options
 */
export interface RunInTransactionOptions
{
    /**
     * Slow transaction warning threshold in milliseconds
     * @default 1000 (1 second)
     */
    slowThreshold?: number;

    /**
     * Enable transaction logging
     * @default true
     */
    enableLogging?: boolean;

    /**
     * Transaction timeout in milliseconds
     *
     * Sets PostgreSQL `statement_timeout` to enforce database-level timeout.
     * If transaction exceeds this duration, PostgreSQL will automatically cancel
     * the query and rollback the transaction, ensuring data consistency.
     *
     * Behavior:
     * - `timeout: 0` - Disables timeout (unlimited execution time)
     * - `timeout: null` - Uses default (30s or TRANSACTION_TIMEOUT env var)
     * - `timeout: undefined` - Uses default (30s or TRANSACTION_TIMEOUT env var)
     * - `timeout: N` - Sets timeout to N milliseconds (1 to 2147483647)
     *
     * Note: Timeout is only applied to root transactions. Nested transactions
     * (SAVEPOINTs) inherit the timeout from the outer transaction.
     *
     * @default 30000 (30 seconds) or TRANSACTION_TIMEOUT environment variable
     *
     * @example
     * ```typescript
     * // Use default timeout (30s)
     * await runInTransaction(callback);
     *
     * // Disable timeout for long-running operations
     * await runInTransaction(callback, { timeout: 0 });
     *
     * // Set custom timeout (60s)
     * await runInTransaction(callback, { timeout: 60000 });
     * ```
     */
    timeout?: number;

    /**
     * Context string for logging (e.g., 'migration:add-user', 'script:cleanup')
     * @default 'transaction'
     */
    context?: string;
}

/**
 * Run a callback function within a database transaction
 *
 * Automatically manages transaction lifecycle:
 * - Commits on success
 * - Rolls back on error
 * - Tracks execution time
 * - Warns about slow transactions
 * - Enforces timeout if configured
 *
 * Errors are propagated to the caller without modification.
 * Caller is responsible for error handling and conversion.
 *
 * @param callback - Function to execute within transaction
 * @param options - Transaction options
 * @returns Result of callback function
 * @throws TransactionError if database not initialized or timeout exceeded
 * @throws Any error thrown by callback function
 */
export async function runInTransaction<T>(
    callback: (tx: TransactionDB) => Promise<T>,
    options: RunInTransactionOptions = {}
): Promise<T>
{
    // Get default timeout from environment variable with validation (default: 30 seconds)
    const defaultTimeout = getEnvVar('TRANSACTION_TIMEOUT', {
        default: 30000,
        validator: (val) =>
        {
            const parsed = parseInt(val, 10);
            if (Number.isNaN(parsed) || parsed < 0 || parsed > 2147483647)
            {
                throw new Error('TRANSACTION_TIMEOUT must be a non-negative integer between 0 and 2147483647');
            }

            return parsed;
        },
    });

    const {
        slowThreshold = 1000,
        enableLogging = true,
        context = 'transaction',
    } = options;

    // Handle timeout: null/undefined → default, 0 → disabled, N → N milliseconds
    const timeout = options.timeout ?? defaultTimeout;

    const txLogger = logger.child('@spfn/core:transaction');

    // Generate transaction ID for debugging
    const txId = `tx_${randomUUID()}`;

    // Validate slowThreshold
    if (!Number.isInteger(slowThreshold) || slowThreshold < 0)
    {
        throw new TransactionError(
            `Invalid slowThreshold value: ${slowThreshold}. Must be a non-negative integer.`,
            400,
            { txId, context, slowThreshold }
        );
    }

    // Get write database instance
    const writeDb = getDatabase('write');
    if (!writeDb)
    {
        const error = new TransactionError(
            'Database not initialized. Cannot start transaction.',
            500,
            { txId, context }
        );

        if (enableLogging)
        {
            txLogger.error('Database not initialized', {
                txId,
                context,
                error: error.message,
            });
        }

        throw error;
    }

    // Validate timeout value for SQL safety (before transaction starts)
    if (!Number.isInteger(timeout))
    {
        throw new TransactionError(
            `Invalid timeout value: ${timeout}. Must be an integer.`,
            400,
            { txId, context, timeout }
        );
    }

    if (timeout < 0)
    {
        throw new TransactionError(
            `Invalid timeout value: ${timeout}. Timeout must be non-negative (0 to disable, or 1-2147483647ms).`,
            400,
            { txId, context, timeout }
        );
    }

    if (timeout > 2147483647)
    {
        throw new TransactionError(
            `Invalid timeout value: ${timeout}. Maximum timeout is 2147483647ms.`,
            400,
            { txId, context, timeout }
        );
    }

    // Check if we're in a nested transaction
    const existingContext = getTransactionContext();
    const isNested = existingContext !== null;

    // Warn about nested transaction timeout
    if (isNested && timeout > 0 && enableLogging)
    {
        txLogger.warn('Timeout ignored in nested transaction', {
            txId,
            context,
            outerTxId: existingContext.txId,
            requestedTimeout: `${timeout}ms`,
            reason: 'SET LOCAL statement_timeout affects the entire outer transaction',
        });
    }

    // Log transaction start AFTER all validations pass
    if (enableLogging)
    {
        txLogger.debug('Transaction started', { txId, context });
    }

    // Start timing from actual transaction execution
    const startTime = Date.now();

    // Execute transaction within try-catch to capture all errors
    try
    {
        // Execute transaction with PostgreSQL-level timeout
        const result = await writeDb.transaction(async (tx: TransactionDB) =>
        {
            // Set PostgreSQL statement timeout only for root transactions
            // Nested transactions (SAVEPOINTs) would affect the entire outer transaction
            if (timeout > 0 && !isNested)
            {
                // Using sql.raw() because SET commands don't support parameter binding
                await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${timeout}`));
            }

            // Store transaction in AsyncLocalStorage
            return await runWithTransaction(tx, txId, async () =>
            {
                // Execute callback
                return await callback(tx);
            });
        });

        // Transaction successful (committed)
        const duration = Date.now() - startTime;

        if (enableLogging)
        {
            if (duration >= slowThreshold)
            {
                txLogger.warn('Slow transaction committed', {
                    txId,
                    context,
                    duration: `${duration}ms`,
                    threshold: `${slowThreshold}ms`,
                });
            }
            else
            {
                txLogger.debug('Transaction committed', {
                    txId,
                    context,
                    duration: `${duration}ms`,
                });
            }
        }

        return result;
    }
    catch (error)
    {
        // Transaction failed (rolled back)
        const duration = Date.now() - startTime;

        if (enableLogging)
        {
            if (duration >= slowThreshold)
            {
                txLogger.warn('Slow transaction rolled back', {
                    txId,
                    context,
                    duration: `${duration}ms`,
                    threshold: `${slowThreshold}ms`,
                    error: error instanceof Error ? error.message : String(error),
                    errorType: error instanceof Error ? error.name : 'Unknown',
                });
            }
            else
            {
                txLogger.error('Transaction rolled back', {
                    txId,
                    context,
                    duration: `${duration}ms`,
                    error: error instanceof Error ? error.message : String(error),
                    errorType: error instanceof Error ? error.name : 'Unknown',
                });
            }
        }

        // Re-throw error for caller to handle
        throw error;
    }
}