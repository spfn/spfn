/**
 * Transactional Middleware
 *
 * Wraps route handlers in a database transaction.
 * Auto-commits on success, auto-rolls back on error.
 *
 * Features:
 * - Automatic transaction management (start/commit/rollback)
 * - Transaction propagation via AsyncLocalStorage
 * - Nested transaction detection and logging
 * - Hono Context error detection
 * - Transaction timeout with configurable threshold
 * - Execution time tracking and slow transaction warnings
 * - UUID-based transaction IDs for debugging
 * - PostgreSQL error conversion to custom errors
 */
import { createMiddleware } from 'hono/factory';
import { TransactionError } from '@spfn/core/errors';
import { fromPostgresError } from '../postgres-errors';
import { runInTransaction } from './runner';

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
    return createMiddleware(async (c, next) =>
    {
        const route = `${c.req.method} ${c.req.path}`;

        try
        {
            // Run route handler within transaction
            await runInTransaction(
                async () =>
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
                },
                {
                    context: route,
                    ...options,
                }
            );
        }
        catch (error)
        {
            // Convert PostgreSQL error to custom error (unless it's already TransactionError)
            // Re-throw for Hono's error handler
            throw error instanceof TransactionError ? error : fromPostgresError(error);
        }
    });
}