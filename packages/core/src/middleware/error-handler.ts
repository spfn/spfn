/**
 * Error Handler Middleware
 *
 * Handles SerializableError with automatic serialization and standard errors
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { SerializableError } from '@spfn/core/errors';
import { logger } from '@spfn/core/logger';
import { env } from '@spfn/core/config';

const errorLogger = logger.child('@spfn/core:error-handler');

/**
 * Options for ErrorHandler middleware
 */
export interface ErrorHandlerOptions
{
    /**
     * Include stack trace in error response
     *
     * Useful for debugging in development, should be disabled in production.
     *
     * @default env.NODE_ENV !== 'production'
     */
    includeStack?: boolean;

    /**
     * Enable error logging to console
     *
     * Logs errors with appropriate level (warn for 4xx, error for 5xx).
     *
     * @default true
     */
    enableLogging?: boolean;

    /**
     * Callback invoked when an error occurs
     *
     * Called asynchronously without blocking the response.
     * Useful for external error notifications (Slack, PagerDuty, etc.)
     */
    onError?: (
        err: Error,
        context: OnErrorContext,
    ) => Promise<void> | void;
}

/**
 * Context passed to onError callback
 */
export interface OnErrorContext
{
    statusCode: number;
    path: string;
    method: string;
    requestId?: string;
    timestamp: string;
    userId?: string;
    request: {
        headers: Record<string, string>;
        query: Record<string, string>;
    };
}

interface ErrorWithStatusCode extends Error
{
    statusCode?: number;
    details?: Record<string, unknown>;
}

interface SerializableErrorLike extends Error
{
    statusCode: number;
    toJSON(): Record<string, unknown>;
}

interface ErrorLogData extends Record<string, unknown>
{
    type: string;
    message: string;
    statusCode: number;
    path: string;
    method: string;
    cause?: string;
}

interface StandardErrorResponse
{
    __type: string;
    message: string;
    cause?: string;
    stack?: string;
}

/**
 * Extract root cause message from nested Error.cause chain
 */
function extractCauseMessage(err: Error): string | undefined
{
    const cause = (err as any).cause;

    if (!cause)
    {
        return undefined;
    }

    if (cause instanceof Error)
    {
        return cause.message;
    }

    if (typeof cause === 'string')
    {
        return cause;
    }

    return String(cause);
}

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'x-api-key', 'x-auth-token']);

/**
 * Extract headers from request, masking sensitive values
 */
function extractHeaders(c: Context): Record<string, string>
{
    const headers: Record<string, string> = {};

    c.req.raw.headers.forEach((value, key) =>
    {
        headers[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? '***' : value;
    });

    return headers;
}

/**
 * Build onError context from Hono context
 */
function buildOnErrorContext(c: Context, statusCode: number): OnErrorContext
{
    const auth = c.get('auth') as { userId?: string } | undefined;

    return {
        statusCode,
        path: c.req.path,
        method: c.req.method,
        requestId: c.get('requestId') as string | undefined,
        timestamp: new Date().toISOString(),
        userId: auth?.userId,
        request: {
            headers: extractHeaders(c),
            query: c.req.query(),
        },
    };
}

/**
 * Log error with appropriate level based on status code
 */
function logError(
    err: Error,
    logData: ErrorLogData,
    includeStack: boolean,
): void
{
    const logLevel = logData.statusCode >= 500 ? 'error' : 'warn';

    if (includeStack)
    {
        errorLogger[logLevel]('Error occurred', err, logData);
    }
    else
    {
        errorLogger[logLevel]('Error occurred', logData);
    }
}

/**
 * Type guard for SerializableError
 *
 * Uses duck typing to handle module duplication issues in dev mode (tsx)
 */
function isSerializableError(err: Error): err is SerializableErrorLike
{
    return err instanceof SerializableError ||
        (typeof (err as any).toJSON === 'function' &&
         typeof (err as any).statusCode === 'number');
}

/**
 * Error handler middleware for Hono
 *
 * Handles SerializableError with automatic serialization and standard errors.
 * SerializableError instances are serialized using their toJSON() method,
 * preserving custom fields like `resource`, `fields`, etc.
 *
 * @param options - Configuration options
 * @returns Error handler function for Hono's onError hook
 *
 * @example
 * ```typescript
 * import { Hono } from 'hono';
 * import { ErrorHandler } from '@spfn/core/middleware';
 *
 * const app = new Hono();
 *
 * // Register error handler
 * app.onError(ErrorHandler({
 *     includeStack: process.env.NODE_ENV !== 'production',
 *     enableLogging: true,
 * }));
 *
 * // Throw SerializableError in routes
 * app.get('/users/:id', (c) => {
 *     throw new NotFoundError({ message: 'User not found', resource: 'User' });
 *     // Response: { __type: 'NotFoundError', message: 'User not found', resource: 'User' }
 * });
 * ```
 */
export function ErrorHandler(options: ErrorHandlerOptions = {}): (err: Error, c: Context) => Response | Promise<Response>
{
    const {
        includeStack = env.NODE_ENV !== 'production',
        enableLogging = true,
        onError,
    } = options;

    return (err: Error, c: Context) =>
    {
        const path = c.req.path;
        const method = c.req.method;

        const causeMessage = extractCauseMessage(err);

        // Handle SerializableError with automatic serialization
        if (isSerializableError(err))
        {
            const { statusCode } = err;

            if (enableLogging)
            {
                logError(err, {
                    type: err.constructor.name,
                    message: err.message,
                    cause: causeMessage,
                    statusCode,
                    path,
                    method,
                }, includeStack);
            }

            // Fire onError callback (non-blocking)
            if (onError)
            {
                const ctx = buildOnErrorContext(c, statusCode);
                Promise.resolve(onError(err, ctx))
                    .catch(e => errorLogger.warn('onError callback failed', e as Error));
            }

            // Internal (DB-driver-derived) errors must not leak SQL text, schema
            // names, or parameter values to clients in production. Full detail is
            // kept in the log above; the client gets a generic message.
            if ((err as { internal?: boolean }).internal === true && !includeStack)
            {
                return c.json(
                    { __type: err.constructor.name, message: 'Internal server error' },
                    statusCode as ContentfulStatusCode,
                );
            }

            // Use toJSON() for automatic serialization
            const serialized = err.toJSON();

            // Add stack trace in development
            if (includeStack && err.stack)
            {
                serialized.stack = err.stack;
            }

            return c.json(serialized, statusCode as ContentfulStatusCode);
        }

        // Handle standard errors (fallback)
        const errorWithCode = err as ErrorWithStatusCode;
        const statusCode = errorWithCode.statusCode || 500;

        if (enableLogging)
        {
            logError(err, {
                type: err.name || 'Error',
                message: err.message,
                cause: causeMessage,
                statusCode,
                path,
                method,
            }, includeStack);
        }

        // Fire onError callback (non-blocking)
        if (onError)
        {
            const ctx = buildOnErrorContext(c, statusCode);
            Promise.resolve(onError(err, ctx))
                .catch(e => errorLogger.warn('onError callback failed', e as Error));
        }

        // Standard (non-SerializableError) errors are uncaught/internal — their
        // message and cause may contain raw SQL or driver text (e.g. an uncaught
        // Drizzle error), so only expose them in development.
        const response: StandardErrorResponse = {
            __type: 'Error',
            message: includeStack ? (err.message || 'Internal Server Error') : 'Internal Server Error',
        };

        if (causeMessage && includeStack)
        {
            response.cause = causeMessage;
        }

        if (includeStack && err.stack)
        {
            response.stack = err.stack;
        }

        return c.json(response, statusCode as ContentfulStatusCode);
    };
}
