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
import { logger } from '@spfn/core/logger';
import { getDatabase } from '../manager';
import {
    runWithTransaction,
    getTransactionContext,
    type TransactionDB,
    type AfterCommitCallback,
    type BeforeCommitCallback,
    type AfterRollbackCallback,
} from './context';
import { TransactionError } from '@spfn/core/errors';
import { env } from '@spfn/core/config';
import type { DefaultDatabase, DrizzleDatabase } from '../manager/types';

/**
 * PostgreSQL maximum timeout value (max int4)
 */
const MAX_TIMEOUT_MS = 2147483647;
const txLogger = logger.child('@spfn/core:transaction');

/**
 * Emit a status log line under a backstop
 *
 * The commit/rollback status lines sit at points where a throwing logger would
 * be destructive and never useful: on the rollback path it would replace the
 * error that caused the rollback and skip the afterRollback callbacks; on the
 * success path it would report a failure for a transaction that already
 * committed and drop the afterCommit queue. A broken logger changes neither.
 */
function logSafely(emit: () => void): void
{
    try
    {
        emit();
    }
    catch
    {
        // Reporting a logging failure would need the logger. Stay silent.
    }
}

/**
 * Run the beforeCommit callbacks, in registration order, inside the transaction
 *
 * The queue is SNAPSHOT before the pass. A callback that itself calls
 * onBeforeCommit would otherwise grow the array while we walk it, and a
 * self-registering callback would spin forever inside an open transaction,
 * holding a pooled connection — statement_timeout cannot save us there, because
 * no statement is running. The semantics that follow are documented on
 * onBeforeCommit: a callback registered during the pass does not run for this
 * commit.
 *
 * These run after the user callback resolved, so the transaction is still healthy
 * and a callback may issue statements that join the same commit. A throw is
 * deliberately NOT caught: it escapes writeDb.transaction(), which rolls the
 * transaction back, and the afterRollback callbacks then fire. Later callbacks
 * are skipped — the transaction they would have run in is already doomed.
 */
async function runBeforeCommitCallbacks(callbacks: BeforeCommitCallback[]): Promise<void>
{
    for (const cb of [...callbacks])
    {
        await cb();
    }
}

/**
 * Run the afterRollback callbacks, in registration order, outside the transaction
 *
 * The rollback error is already on its way to the caller, so nothing here may
 * replace it: each callback's failure is logged through logSafely, so neither a
 * broken callback nor a broken logger can stop the rest. The opening debug line
 * goes through logSafely for the same reason — a throw there would skip every
 * callback. Callbacks are awaited so they complete before the error leaves the
 * runner.
 */
async function runAfterRollbackCallbacks(
    callbacks: AfterRollbackCallback[],
    txId: string,
    context: string,
    enableLogging: boolean,
): Promise<void>
{
    if (enableLogging)
    {
        logSafely(() => txLogger.debug('Executing afterRollback callbacks', {
            txId,
            context,
            count: callbacks.length,
        }));
    }

    for (const cb of callbacks)
    {
        await Promise.resolve()
            .then(cb)
            .catch((err) => logSafely(() =>
            {
                txLogger.error('afterRollback callback failed', {
                    txId,
                    context,
                    error: err instanceof Error ? err.message : String(err),
                });
            }));
    }
}

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
     * Idle-in-transaction timeout in milliseconds (root transactions only).
     *
     * Sets PostgreSQL `idle_in_transaction_session_timeout`: if the transaction
     * sits open without running a query for longer than this — e.g. while the
     * handler awaits external I/O inside the transaction — Postgres terminates
     * the session and rolls back, reclaiming the pooled connection instead of
     * letting one stuck request hold it (and its row locks) indefinitely.
     *
     * Do not put external I/O inside a transaction; this is a backstop, not a
     * license. `0` disables it.
     *
     * @default 30000 (30s) or TRANSACTION_IDLE_TIMEOUT environment variable
     */
    idleTimeout?: number;

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
export async function runInTransaction<T, TDatabase extends DrizzleDatabase = DefaultDatabase>(
    callback: (tx: TransactionDB<TDatabase>) => Promise<T>,
    options: RunInTransactionOptions = {},
): Promise<T>
{
    // Get default timeout from environment variable (default: 30 seconds)
    const defaultTimeout = env.TRANSACTION_TIMEOUT;

    const {
        slowThreshold = 1000,
        enableLogging = true,
        context = 'transaction',
    } = options;

    // Handle timeout: null/undefined → default, 0 → disabled, N → N milliseconds
    const timeout = options.timeout ?? defaultTimeout;

    // Idle-in-transaction backstop: 0 disables, else default from env
    const idleTimeout = options.idleTimeout ?? env.TRANSACTION_IDLE_TIMEOUT;

    // Generate transaction ID for debugging
    const txId = `tx_${randomUUID()}`;

    /**
     * Helper function to validate parameters and throw TransactionError
     */
    const validateAndThrow = (
        condition: boolean,
        message: string,
        logMessage: string,
        metadata: Record<string, unknown>,
    ): void =>
    {
        if (condition)
        {
            const error = new TransactionError({ message, statusCode: 400, details: metadata });

            if (enableLogging)
            {
                txLogger.error(logMessage, { ...metadata, error: error.message });
            }

            throw error;
        }
    };

    // Validate all input parameters before DB access (fail-fast pattern)

    // Validate callback is a function
    validateAndThrow(
        typeof callback !== 'function',
        'Callback must be a function',
        'Invalid callback type',
        { txId, context, callbackType: typeof callback },
    );

    // Validate slowThreshold
    validateAndThrow(
        !Number.isInteger(slowThreshold) || slowThreshold < 0,
        `Invalid slowThreshold value: ${slowThreshold}. Must be a non-negative integer.`,
        'Invalid slowThreshold',
        { txId, context, slowThreshold },
    );

    // Validate timeout value for SQL safety
    validateAndThrow(
        !Number.isInteger(timeout),
        `Invalid timeout value: ${timeout}. Must be an integer.`,
        'Invalid timeout type',
        { txId, context, timeout },
    );

    validateAndThrow(
        timeout < 0,
        `Invalid timeout value: ${timeout}. Timeout must be non-negative (0 to disable, or 1-${MAX_TIMEOUT_MS}ms).`,
        'Invalid timeout range',
        { txId, context, timeout },
    );

    validateAndThrow(
        timeout > MAX_TIMEOUT_MS,
        `Invalid timeout value: ${timeout}. Maximum timeout is ${MAX_TIMEOUT_MS}ms.`,
        'Timeout exceeds maximum',
        { txId, context, timeout, maxTimeout: MAX_TIMEOUT_MS },
    );

    // Validate idleTimeout the same way — it is interpolated into
    // `SET LOCAL idle_in_transaction_session_timeout` via sql.raw (SET commands
    // don't support bind params), so a non-integer would be an injection vector.
    validateAndThrow(
        !Number.isInteger(idleTimeout),
        `Invalid idleTimeout value: ${idleTimeout}. Must be an integer.`,
        'Invalid idleTimeout type',
        { txId, context, idleTimeout },
    );

    validateAndThrow(
        idleTimeout < 0,
        `Invalid idleTimeout value: ${idleTimeout}. Must be non-negative (0 to disable).`,
        'Invalid idleTimeout range',
        { txId, context, idleTimeout },
    );

    validateAndThrow(
        idleTimeout > MAX_TIMEOUT_MS,
        `Invalid idleTimeout value: ${idleTimeout}. Maximum is ${MAX_TIMEOUT_MS}ms.`,
        'idleTimeout exceeds maximum',
        { txId, context, idleTimeout, maxTimeout: MAX_TIMEOUT_MS },
    );

    // Get write database instance (after all input validations)
    const writeDb = getDatabase<TDatabase>('write');
    if (!writeDb)
    {
        const error = new TransactionError({
            message: 'Database not initialized. Cannot start transaction.',
            statusCode: 500,
            details: { txId, context },
        });

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

    // Hook queues of the root transaction context.
    //
    // These are ALIASES of the arrays inside the context, not copies, and they
    // are bound on entry to the transaction closure — before the user callback
    // can throw. That is what makes them reachable from the catch below, where
    // the AsyncLocalStorage context is already gone: a throw can never lose a
    // registered rollback callback. Callbacks registered later (including from
    // nested transactions, which share the root's arrays) mutate these same
    // arrays, so the runner always sees the complete queue.
    let beforeCommitCallbacks: BeforeCommitCallback[] = [];
    let afterCommitCallbacks: AfterCommitCallback[] = [];
    let afterRollbackCallbacks: AfterRollbackCallback[] = [];

    // Execute transaction within try-catch to capture all errors
    try
    {
        // Execute transaction with PostgreSQL-level timeout
        const result = await writeDb.transaction(async (tx) =>
        {
            const transaction = tx as TransactionDB<TDatabase>;

            // Set PostgreSQL statement timeout only for root transactions
            // Nested transactions (SAVEPOINTs) would affect the entire outer transaction
            if (timeout > 0 && !isNested)
            {
                // Using sql.raw() because SET commands don't support parameter binding
                await transaction.execute(sql.raw(`SET LOCAL statement_timeout = ${timeout}`));
            }

            // Idle-in-transaction backstop (root only): reclaims the pooled
            // connection if the transaction sits idle (e.g. awaiting external I/O)
            if (idleTimeout > 0 && !isNested)
            {
                await transaction.execute(sql.raw(`SET LOCAL idle_in_transaction_session_timeout = ${idleTimeout}`));
            }

            // Store transaction in AsyncLocalStorage
            return await runWithTransaction(transaction, txId, async () =>
            {
                // Bind the hook queues before running user code, so they survive
                // a throw (see the declarations above)
                if (!isNested)
                {
                    const ctx = getTransactionContext();
                    if (ctx)
                    {
                        beforeCommitCallbacks = ctx.beforeCommitCallbacks;
                        afterCommitCallbacks = ctx.afterCommitCallbacks;
                        afterRollbackCallbacks = ctx.afterRollbackCallbacks;
                    }
                }

                const innerResult = await callback(transaction);

                // beforeCommit hooks run here: the user callback resolved, so the
                // transaction is still usable, and we are still inside its context
                // and before drizzle issues COMMIT
                if (!isNested && beforeCommitCallbacks.length > 0)
                {
                    if (enableLogging)
                    {
                        // Backstopped: a throwing logger must not roll back a
                        // transaction that is about to commit cleanly
                        logSafely(() => txLogger.debug('Executing beforeCommit callbacks', {
                            txId,
                            context,
                            count: beforeCommitCallbacks.length,
                        }));
                    }

                    await runBeforeCommitCallbacks(beforeCommitCallbacks);
                }

                return innerResult;
            });
        });

        // Transaction successful (committed)
        const duration = Date.now() - startTime;

        // Backstopped: the commit already happened, so a throwing logger must
        // not turn a committed transaction into a failed call — nor drop the
        // afterCommit queue below
        if (enableLogging)
        {
            logSafely(() =>
            {
                if (duration >= slowThreshold)
                {
                    txLogger.warn('Slow transaction committed', {
                        txId,
                        context,
                        duration: `${duration}ms`,
                        threshold: `${slowThreshold}ms`,
                        hint: 'A transaction holds a pooled connection (and row locks) for its whole duration. If this is slow because of non-DB work (external API, etc.) inside the transaction, move that work out — it starves the connection pool.',
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
            });
        }

        // Execute afterCommit callbacks (root transaction only, after commit confirmed)
        if (!isNested && afterCommitCallbacks.length > 0)
        {
            if (enableLogging)
            {
                logSafely(() => txLogger.debug('Executing afterCommit callbacks', {
                    txId,
                    context,
                    count: afterCommitCallbacks.length,
                }));
            }

            for (const cb of afterCommitCallbacks)
            {
                Promise.resolve().then(cb).catch((err) => logSafely(() =>
                {
                    txLogger.error('afterCommit callback failed', {
                        txId,
                        context,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }));
            }
        }

        return result;
    }
    catch (error)
    {
        // Transaction failed (rolled back)
        const duration = Date.now() - startTime;

        // Backstopped, and for the same reason as the callback stage below: this
        // line runs BEFORE the afterRollback callbacks and outside their catch,
        // so a throwing logger here would both skip every registered callback and
        // replace the error that caused the rollback. It stays ahead of the
        // callbacks — the rollback record belongs in the log before the arbitrary
        // user code that reacts to it — and is made non-throwing instead.
        if (enableLogging)
        {
            logSafely(() =>
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
                        hint: 'If the error is an idle-in-transaction timeout, the transaction held a pooled connection while awaiting non-DB work (external API, etc.). Move that work out of the transaction.',
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
            });
        }

        // Execute afterRollback callbacks (root transaction only, rollback done).
        // Awaited so they complete before the error leaves the runner, and run
        // outside the transaction context — getTransactionContext() is null here,
        // so DB work inside them uses a fresh connection like afterCommit does.
        // Nested calls skip this: only the root's fate fires rollback hooks, and
        // that keeps a nested failure from firing them once per nesting level.
        if (!isNested && afterRollbackCallbacks.length > 0)
        {
            // Last backstop: nothing in this stage — not a callback, not a log
            // line — may replace the error that caused the rollback
            await runAfterRollbackCallbacks(afterRollbackCallbacks, txId, context, enableLogging)
                .catch(() => undefined);
        }

        // Re-throw the ORIGINAL error for caller to handle: nothing above may
        // replace it
        throw error;
    }
}
