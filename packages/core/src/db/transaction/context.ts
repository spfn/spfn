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
import { logger } from '@spfn/core/logger'; // Assuming logger is accessible
import type {
    DatabaseTransaction,
    DefaultDatabase,
    DrizzleDatabase,
} from '../manager/types';

/**
 * Transaction type belonging to a PostgreSQL Drizzle database.
 */
export type TransactionDB<TDatabase extends DrizzleDatabase = DefaultDatabase> =
    DatabaseTransaction<TDatabase>;

const txLogger = logger.child('@spfn/core:transaction');

/**
 * afterCommit callback type
 */
export type AfterCommitCallback = () => void | Promise<void>;

/**
 * beforeCommit callback type
 */
export type BeforeCommitCallback = () => void | Promise<void>;

/**
 * afterRollback callback type
 */
export type AfterRollbackCallback = () => void | Promise<void>;

/**
 * Transaction context stored in AsyncLocalStorage
 */
export type TransactionContext<TDatabase extends DrizzleDatabase = DrizzleDatabase> = {
    /** The actual Drizzle transaction object */
    tx: TransactionDB<TDatabase>;
    /** Unique transaction ID for logging and tracing */
    txId: string;
    level: number;
    /** Callbacks to execute before the root transaction commits (still inside it) */
    beforeCommitCallbacks: BeforeCommitCallback[];
    /** Callbacks to execute after root transaction commits */
    afterCommitCallbacks: AfterCommitCallback[];
    /** Callbacks to execute after the root transaction rolled back */
    afterRollbackCallbacks: AfterRollbackCallback[];
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
export function getTransactionContext<TDatabase extends DrizzleDatabase = DefaultDatabase>(): TransactionContext<TDatabase> | null
{
    return (asyncContext.getStore() as TransactionContext<TDatabase> | undefined) ?? null;
}

/**
 * Get current transaction from AsyncLocalStorage
 *
 * @returns Transaction if available, null otherwise
 */
export function getTransaction<TDatabase extends DrizzleDatabase = DefaultDatabase>(): TransactionDB<TDatabase> | null
{
    const context = getTransactionContext<TDatabase>();

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
export function runWithTransaction<T, TDatabase extends DrizzleDatabase = DefaultDatabase>(
    tx: TransactionDB<TDatabase>,
    txId: string, // Add txId parameter
    callback: () => Promise<T>,
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

    // Nested transactions share the root's hook queues. All three hooks are
    // scoped to the ROOT transaction's outcome, so a SAVEPOINT never owns a
    // queue of its own: a callback registered in a nested call fires at the
    // root's commit/rollback boundary, not the savepoint's.
    const beforeCommitCallbacks = existingContext?.beforeCommitCallbacks ?? [];
    const afterCommitCallbacks = existingContext?.afterCommitCallbacks ?? [];
    const afterRollbackCallbacks = existingContext?.afterRollbackCallbacks ?? [];

    // Store transaction, new ID, and the current nesting level
    return asyncContext.run(
        {
            tx,
            txId,
            level: newLevel,
            beforeCommitCallbacks,
            afterCommitCallbacks,
            afterRollbackCallbacks,
        } as TransactionContext,
        callback,
    );
}

/**
 * Register a callback to run after the current transaction commits
 *
 * - Inside a transaction: queued and executed after root transaction commits
 * - Outside a transaction: executed immediately (already "committed")
 * - Nested transactions: callbacks bubble up to root transaction
 * - Callbacks run outside transaction context (new connection for DB access)
 * - Errors are logged but never thrown (commit already succeeded)
 *
 * @example
 * ```typescript
 * import { onAfterCommit } from '@spfn/core/db/transaction';
 *
 * async function submit(spaceId: string, chatId: string)
 * {
 *     const publication = await publicationRepo.create({...});
 *     await requestRepo.updateStatusAtomically(...);
 *
 *     onAfterCommit(() => generateArticle(spaceId, chatId, publication.id));
 *
 *     return publication;
 * }
 * ```
 */
export function onAfterCommit(callback: AfterCommitCallback): void
{
    const context = getTransactionContext();

    if (!context)
    {
        // No active transaction → execute immediately
        Promise.resolve().then(callback).catch((err) =>
        {
            txLogger.error('afterCommit callback failed (no transaction)', {
                error: err instanceof Error ? err.message : String(err),
            });
        });

        return;
    }

    context.afterCommitCallbacks.push(callback);
}

/**
 * Register a callback to run just before the current transaction commits
 *
 * - Inside a transaction: queued and executed after the root callback resolves,
 *   while the transaction is still open — the callback MAY run statements and
 *   they are part of the same commit
 * - Outside a transaction: executed immediately with a WARNING (same rationale as
 *   onAfterCommit — there is nothing left to commit), and the abort semantics
 *   below do not apply: there is no transaction for a throw to roll back
 * - Nested transactions: callbacks bubble up to root transaction
 * - Callbacks run in registration order, inside the transaction context
 *   (getTransaction() returns the live tx)
 * - The queue is snapshot before the pass, so a callback registered BY a
 *   beforeCommit callback does not run for this commit — it would otherwise
 *   grow the queue mid-iteration and loop forever inside the open transaction
 * - A throw ABORTS: later callbacks are skipped, the transaction rolls back,
 *   the error propagates to the caller, and afterRollback callbacks fire
 *
 * @example
 * ```typescript
 * import { runInTransaction, onBeforeCommit } from '@spfn/core/db/transaction';
 *
 * async function transfer(fromId: string, toId: string, amount: number)
 * {
 *     // The transaction is what gives the check teeth — registered outside one,
 *     // the callback runs immediately and its throw aborts nothing.
 *     await runInTransaction(async () =>
 *     {
 *         await accountRepo.debit(fromId, amount);
 *         await accountRepo.credit(toId, amount);
 *
 *         // Last-moment invariant check: a throw here rolls the whole transfer back.
 *         onBeforeCommit(() => assertNoNegativeBalance(fromId));
 *     });
 * }
 * ```
 */
export function onBeforeCommit(callback: BeforeCommitCallback): void
{
    const context = getTransactionContext();

    if (!context)
    {
        // No active transaction → nothing to run before, execute immediately.
        // Warn first: the caller most likely wanted the abort semantics, and
        // here there is no transaction to abort — a throwing callback only
        // reaches the log line below, while the write it meant to prevent has
        // already committed on its own.
        txLogger.warn(
            'beforeCommit callback ran immediately (no transaction): a throw cannot abort anything',
        );

        Promise.resolve().then(callback).catch((err) =>
        {
            txLogger.error('beforeCommit callback failed (no transaction)', {
                error: err instanceof Error ? err.message : String(err),
            });
        });

        return;
    }

    context.beforeCommitCallbacks.push(callback);
}

/**
 * Register a callback to run after the current transaction rolled back
 *
 * - Inside a transaction: queued and executed after the ROOT transaction rolled
 *   back, before the causing error leaves runInTransaction / the middleware
 * - Outside a transaction: no-op with a warning — there is no rollback to wait for
 * - Nested transactions: callbacks bubble up to root transaction. A nested
 *   rollback that the root survives does NOT fire them; these hooks are about
 *   the root transaction's fate, not a savepoint's
 * - Callbacks run outside the transaction context (new connection for DB access)
 * - Errors are logged but never thrown: the original error keeps propagating
 *   unchanged, never replaced by a callback failure
 *
 * @example
 * ```typescript
 * import { runInTransaction, onAfterRollback } from '@spfn/core/db/transaction';
 *
 * async function importAvatar(userId: string, file: Blob)
 * {
 *     // Upload first: external I/O never belongs inside the transaction.
 *     const key = await objectStore.put(file);
 *
 *     await runInTransaction(async () =>
 *     {
 *         await userRepo.updateAvatar(userId, key);
 *
 *         // The upload cannot roll back on its own — undo it if the write never lands.
 *         onAfterRollback(() => objectStore.delete(key));
 *     });
 * }
 * ```
 */
export function onAfterRollback(callback: AfterRollbackCallback): void
{
    const context = getTransactionContext();

    if (!context)
    {
        // No active transaction → no rollback can ever happen, so the callback
        // would never run. Drop it loudly instead of silently.
        txLogger.warn('afterRollback callback ignored (no transaction)');

        return;
    }

    context.afterRollbackCallbacks.push(callback);
}
