/**
 * Transactional Middleware
 *
 * Wraps route handlers in a database transaction.
 * Auto-commits on success, auto-rolls back on error.
 *
 * ✅ Implemented:
 * - Automatic transaction start/commit/rollback
 * - Transaction propagation via AsyncLocalStorage
 * - Hono Context error detection
 * - Integration with getDb() helper
 * - Type safety improvements (TransactionDB type, no @ts-ignore)
 * - Transaction logging (start/commit/rollback)
 * - Execution time measurement and slow transaction warnings
 * - Transaction ID tracking (for debugging)
 * - Transaction timeout configuration (with TRANSACTION_TIMEOUT env var support)
 *
 * ⚠️ Needs improvement:
 * - Detect and warn about nested transactions
 *
 * 💡 Future considerations:
 * - Transaction isolation level configuration option
 * - Read-only transaction mode
 * - Transaction retry logic (on deadlock)
 * - Transaction event hooks (beforeCommit, afterCommit, onRollback)
 *
 * 🔗 Related files:
 * - src/utils/async-context.ts (AsyncLocalStorage)
 * - src/db/db-context.ts (getDb helper)
 * - src/utils/__tests__/transaction.test.ts (tests)
 *
 * 📝 Future improvements:
 * - Transaction isolation level setting (withTransaction({ isolationLevel: 'SERIALIZABLE' }))
 * - Nested transaction savepoint support
 */
import { randomUUID } from 'crypto';
import { logger } from '../../logger';
import { createMiddleware } from 'hono/factory';
import { db } from "../manager";
import { runWithTransaction, type TransactionDB } from './context.js';
import { TransactionError } from '../../errors';
import { fromPostgresError } from '../postgres-errors.js';

/**
 * Transaction middleware options
 */
export interface TransactionalOptions
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
     * If transaction exceeds this duration, it will be aborted with TransactionError.
     *
     * @default 30000 (30 seconds) or TRANSACTION_TIMEOUT environment variable
     *
     * @example
     * ```typescript
     * // Default timeout (30s or TRANSACTION_TIMEOUT env var)
     * Transactional()
     *
     * // Custom timeout for specific route (60s)
     * Transactional({ timeout: 60000 })
     *
     * // Disable timeout
     * Transactional({ timeout: 0 })
     * ```
     */
    timeout?: number;
}

/**
 * Transaction middleware for Hono routes
 *
 * Automatically wraps route handlers in a database transaction.
 * Commits on success, rolls back on error.
 *
 * @example
 * ```typescript
 * // In your route file
 * export const middlewares = [Transactional()];
 *
 * export async function POST(c: RouteContext) {
 *   // All DB operations run in a transaction
 *   const [user] = await db.insert(users).values(body).returning();
 *   await db.insert(profiles).values({ userId: user.id });
 *   // Auto-commits on success
 *   return c.json(user, 201);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With custom options
 * export const middlewares = [
 *   Transactional({
 *     slowThreshold: 2000,    // Warn if transaction takes > 2s
 *     enableLogging: false,   // Disable logging
 *     timeout: 60000,         // 60 second timeout for long operations
 *   })
 * ];
 * ```
 *
 * 🔄 Transaction behavior:
 * - Success: Auto-commit
 * - Error: Auto-rollback
 * - Detects context.error to trigger rollback
 *
 * 📊 Transaction logging:
 * - Auto-logs transaction start/commit/rollback
 * - Measures and records execution time
 * - Warns about slow transactions (default: > 1s)
 */
export function Transactional(options: TransactionalOptions = {})
{
    // Get default timeout from environment variable (default: 30 seconds)
    const defaultTimeout = parseInt(process.env.TRANSACTION_TIMEOUT || '30000', 10);

    const {
        slowThreshold = 1000,
        enableLogging = true,
        timeout = defaultTimeout,
    } = options;

    const txLogger = logger.child('transaction');

    return createMiddleware(async (c, next) =>
    {
        // Generate transaction ID for debugging (using crypto.randomUUID for better uniqueness)
        const txId = `tx_${randomUUID()}`;
        const startTime = Date.now();
        const route = `${c.req.method} ${c.req.path}`;

        if (enableLogging)
        {
            txLogger.debug('Transaction started', { txId, route });
        }

        try
        {
            // Create transaction promise
            const transactionPromise = db.transaction(async (tx: TransactionDB) =>
            {
                // Store transaction in AsyncLocalStorage
                await runWithTransaction(tx, txId, async () =>
                {
                    // Execute handler
                    await next();

                    // Detect if Hono caught an error and stored it in context.error
                    // Context type doesn't officially define error property, so we extend it
                    type ContextWithError = typeof c & { error?: Error };
                    const contextWithError = c as ContextWithError;
                    if (contextWithError.error)
                    {
                        // Throw to rollback transaction
                        throw contextWithError.error;
                    }

                    // Auto-commit on success (handled by Drizzle)
                });
            });

            // Apply timeout if enabled (timeout > 0)
            if (timeout > 0)
            {
                const timeoutPromise = new Promise<never>((_, reject) =>
                {
                    setTimeout(() =>
                    {
                        reject(
                            new TransactionError(
                                `Transaction timeout after ${timeout}ms`,
                                500,
                                {
                                    txId,
                                    route,
                                    timeout: `${timeout}ms`,
                                }
                            )
                        );
                    }, timeout);
                });

                // Race between transaction and timeout
                await Promise.race([transactionPromise, timeoutPromise]);
            }
            else
            {
                // No timeout - just await transaction
                await transactionPromise;
            }

            // Transaction successful (committed)
            const duration = Date.now() - startTime;

            if (enableLogging)
            {
                if (duration >= slowThreshold)
                {
                    txLogger.warn('Slow transaction committed', {
                        txId,
                        route,
                        duration: `${duration}ms`,
                        threshold: `${slowThreshold}ms`,
                    });
                }
                else
                {
                    txLogger.debug('Transaction committed', {
                        txId,
                        route,
                        duration: `${duration}ms`,
                    });
                }
            }
        }
        catch (error)
        {
            // Transaction failed (rolled back)
            const duration = Date.now() - startTime;

            // Convert PostgreSQL error to custom error (unless it's already TransactionError)
            const customError = error instanceof TransactionError
                ? error
                : fromPostgresError(error);

            if (enableLogging)
            {
                txLogger.error('Transaction rolled back', {
                    txId,
                    route,
                    duration: `${duration}ms`,
                    error: customError.message,
                    errorType: customError.name,
                });
            }

            // Re-throw for Hono's error handler
            throw customError;
        }
    });
}