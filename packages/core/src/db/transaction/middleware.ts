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
 * - PostgreSQL error conversion to custom errors — driver-raised errors only;
 *   application and third-party errors reach the caller untouched
 */
import { createMiddleware } from 'hono/factory';
import { SerializableError } from '@spfn/core/errors';
import { fromPostgresError } from '../postgres-errors';
import { POSTGRES_JS_CONNECTION_CODES, reportDatabaseError } from '../manager/reconnect-trigger';
import { runInTransaction } from './runner';

/**
 * A SQLSTATE is exactly five characters, digits and uppercase letters only —
 * `23505`, `08P01`, `40P01`.
 */
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/**
 * Whether an error came from the database driver — either relayed from the
 * PostgreSQL server or raised by the driver itself. Those are the shapes
 * `fromPostgresError` is written to read.
 *
 * It has to be certain rather than merely plausible, because the cost of a
 * false positive is total: `fromPostgresError` falls back to `QueryError 500`
 * for any code it does not recognise, so an application error routed into it
 * loses its status and its serialized envelope and reaches the client as a
 * bare 500. Two shapes qualify, and nothing else does.
 *
 * **One of the driver's own connection codes.** The errors postgres.js raises
 * itself instead of relaying — a socket that died mid-transaction, a connect
 * that timed out — are built by `Errors.connection` / `Errors.generic` (see
 * `postgres/src/errors.js`), which set `code` to a name of the driver's own
 * invention (`CONNECTION_CLOSED`, `CONNECT_TIMEOUT`, …) and no severity at all.
 * The name is the proof of origin, so it stands alone here;
 * `POSTGRES_JS_CONNECTION_CODES` is the very list the reconnect trigger
 * classifies on, which keeps the two readings of "the connection died" in step.
 *
 * **Or a SQLSTATE-shaped code together with a severity field.** For an error
 * relayed from the server, neither half suffices alone. A `code` says nothing
 * about who raised the error — Stripe sends `resource_missing`, jose sends
 * `ERR_JOSE_GENERIC`, the AWS SDK sends `ThrottlingException`, Node sends
 * `ECONNRESET`, and an application's own error class is free to carry one too.
 * The severity is what only a driver puts there: postgres.js copies the
 * server's ErrorResponse message field-for-field onto the error, mapping `S` to
 * `severity_local` and `V` to `severity` (see `errorFields` in
 * `postgres/src/connection.js`). Either field satisfies the gate: `V` exists
 * only from PostgreSQL 9.6, while `S` is in every ErrorResponse the protocol
 * has ever defined. node-postgres names the `S` field `severity`, so the same
 * gate holds if the driver is ever swapped.
 *
 * Deliberately NOT `routine` / `file` / `line`, the other fields postgres.js
 * sets: the protocol lists them as optional, and a connection pooler that
 * synthesizes its own ErrorResponse rather than relaying one — PgBouncer and
 * friends, which SPFN supports explicitly (see `isTransactionPooler` in
 * `manager/connection.ts`) — sends severity, code and message without them.
 * Those are the `08*` and `53300` errors that most need converting.
 *
 * The trade: an object that fakes both a SQLSTATE and a severity — or that
 * borrows one of the driver's connection-code names — is still converted. That
 * is the right way round. A hand-rolled `{ code: '23505' }` now passes through
 * as itself, which costs nothing real, and in exchange no application error is
 * ever mangled into a 500.
 */
function isDriverOriginError(error: unknown): boolean
{
    if (!error || typeof error !== 'object')
    {
        return false;
    }

    const candidate = error as { code?: unknown; severity?: unknown; severity_local?: unknown };

    if (typeof candidate.code !== 'string')
    {
        return false;
    }

    if (POSTGRES_JS_CONNECTION_CODES.has(candidate.code))
    {
        return true;
    }

    if (!SQLSTATE_PATTERN.test(candidate.code))
    {
        return false;
    }

    return typeof candidate.severity === 'string' || typeof candidate.severity_local === 'string';
}

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

    /**
     * Idle-in-transaction timeout in milliseconds — Postgres reclaims the pooled
     * connection if the transaction sits idle (e.g. the handler awaits external
     * I/O) longer than this. A backstop against pool starvation, not a license
     * to do non-DB work inside a transaction. `0` disables it.
     *
     * @default 30000 (30s) or TRANSACTION_IDLE_TIMEOUT environment variable
     */
    idleTimeout?: number;

    /**
     * Run in an independent transaction instead of joining an ambient one.
     *
     * Only bites when the middleware itself runs nested — a sub-app mounted
     * under a route that already applied `Transactional()`, or a handler invoked
     * from inside `runInTransaction`. By default that inner run takes a SAVEPOINT
     * on the outer transaction; `requiresNew: true` gives it a real `BEGIN` on a
     * second pooled connection, with its own timeouts and its own hook queues.
     *
     * See `RunInTransactionOptions.requiresNew` for the pool and self-deadlock
     * costs — they apply here unchanged.
     *
     * @default false
     */
    requiresNew?: boolean;
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
 * - Hooks: this delegates to runInTransaction, so onBeforeCommit, onAfterCommit
 *   and onAfterRollback behave exactly as they do there. afterRollback callbacks
 *   have already run by the time the error reaches the conversion below.
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
                },
            );
        }
        catch (error)
        {
            // Feed connection-level errors to the reconnect-trigger before
            // rethrowing. No-op for non-connection errors.
            reportDatabaseError(error);

            // 프레임워크 에러 계열(SerializableError)은 그대로 throw.
            //
            // DatabaseError·TransactionError를 포함해 statusCode와 toJSON() 봉투를
            // 이미 갖춘 모든 에러가 여기에 들어온다 — 애플리케이션이 직접 정의한
            // 403 거부 에러처럼 code 필드를 달고 있어도 마찬가지다. 변환은 그런
            // 에러에게서 상태 코드와 봉투를 빼앗을 뿐이다 (issue #82).
            if (error instanceof SerializableError)
            {
                throw error;
            }

            // 진짜 드라이버가 올린 PostgreSQL 에러만 변환
            if (isDriverOriginError(error))
            {
                throw fromPostgresError(error);
            }

            // 그 외 모든 에러는 그대로 throw (InvalidCredentialsError 등 비즈니스 로직 에러)
            throw error;
        }
    });
}
