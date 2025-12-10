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
}

interface StandardErrorResponse
{
    __type: string;
    message: string;
    stack?: string;
}

/**
 * Log error with appropriate level based on status code
 */
function logError(
    err: Error,
    logData: ErrorLogData,
    includeStack: boolean
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
    } = options;

    return (err: Error, c: Context) =>
    {
        // Handle SerializableError with automatic serialization
        if (isSerializableError(err))
        {
            const { statusCode } = err;

            if (enableLogging)
            {
                logError(err, {
                    type: err.constructor.name,
                    message: err.message,
                    statusCode,
                    path: c.req.path,
                    method: c.req.method,
                }, includeStack);
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
                statusCode,
                path: c.req.path,
                method: c.req.method,
            }, includeStack);
        }

        // Standard error response
        const response: StandardErrorResponse = {
            __type: 'Error',
            message: err.message || 'Internal Server Error',
        };

        if (includeStack && err.stack)
        {
            response.stack = err.stack;
        }

        return c.json(response, statusCode as ContentfulStatusCode);
    };
}
